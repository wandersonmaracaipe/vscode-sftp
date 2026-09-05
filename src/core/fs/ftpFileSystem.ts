import PQueue = require('p-queue');
import { PassThrough, Readable } from 'stream';
import { Client, FileInfo, FileType as FtpFileType } from 'basic-ftp';
import logger from '../../logger';
import { FileEntry, FileType, FileStats, FileOption } from './fileSystem';
import RemoteFileSystem from './remoteFileSystem';
import { FTPClient } from '../remote-client';

interface FtpFileHandle {
  path: string;
  flags: string;
  mode?: number;
}

// basic-ftp reports permissions as octal digits per class, e.g. { user: 7,
// group: 5, world: 5 } for rwxr-xr-x. Some servers omit them entirely.
function permissionsToMode(perm?: { user: number; group: number; world: number }): number {
  if (!perm) return 0o666; // Caution: many servers (and Windows) won't report this.
  // eslint-disable-next-line no-bitwise
  return (perm.user << 6) | (perm.group << 3) | perm.world;
}

// Paths that name no directory to create: the remote root and the "current
// directory" forms. `MKD` on one of these is meaningless — a server answers it
// with "501 No directory name" — and it isn't an error worth failing a
// transfer over, because the root always exists. SFTP's ensureDir has had the
// same guard all along; FTP's walk up the tree didn't, so it eventually issued
// `MKD /` and killed the whole upload.
function isRootPath(dir: string): boolean {
  return (
    !dir ||
    dir === '/' ||
    dir === '.' ||
    dir === './' ||
    /^[a-zA-Z]:(\/|\\)?$/.test(dir)
  );
}

// FTP `MFMT` timestamp format: YYYYMMDDhhmmss in UTC.
function formatMfmtDate(date: Date): string {
  const pad = (n: number) => ('00' + n).slice(-2);
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  );
}

export default class FTPFileSystem extends RemoteFileSystem {
  private _supportMFMT: boolean = true;

  static getFileType(type: FtpFileType): FileType {
    switch (type) {
      case FtpFileType.Directory:
        return FileType.Directory;
      case FtpFileType.File:
        return FileType.File;
      case FtpFileType.SymbolicLink:
        return FileType.SymbolicLink;
      default:
        return FileType.Unknown;
    }
  }

  private queue: any = new PQueue({ concurrency: 1 });

  get ftp(): Client {
    return this.getClient().getFsClient();
  }

  toFileStat(stat: FileInfo): FileStats {
    // basic-ftp fills `modifiedAt` (a UTC Date) when the server supports MLSD;
    // with plain LIST it may be absent, in which case we fall back to 0 and let
    // sync rely on size comparison.
    const remoteTime = stat.modifiedAt ? stat.modifiedAt.getTime() : 0;
    const mtime = remoteTime ? this.toLocalTime(remoteTime) : 0;
    return {
      type: FTPFileSystem.getFileType(stat.type),
      mode: permissionsToMode(stat.permissions),
      size: stat.size,
      mtime,
      atime: mtime,
      target: stat.link || undefined,
    };
  }

  toFileEntry(fullPath: string, stat: FileInfo): FileEntry {
    return {
      fspath: fullPath,
      name: stat.name,
      ...this.toFileStat(stat),
    };
  }

  _createClient(option) {
    return new FTPClient(option);
  }

  async lstat(path: string): Promise<FileStats> {
    if (path === '/') {
      return {
        type: FileType.Directory,
        mode: 0o666,
        size: 0,
        mtime: 0,
        atime: 0,
      };
    }

    const parentPath = this.pathResolver.dirname(path);
    const nameIdentity = this.pathResolver.basename(path);
    const stats = await this.list(parentPath);

    const fileStat = stats.find(ns => ns.name === nameIdentity);

    if (!fileStat) {
      throw new Error('o arquivo não existe');
    }

    return fileStat;
  }

  open(path: string, flags: string, mode?: number): Promise<FtpFileHandle> {
    return Promise.resolve({
      path,
      flags,
      mode,
    });
  }

  close(_fd: FtpFileHandle): Promise<void> {
    return Promise.resolve();
  }

  fstat(fd: FtpFileHandle): Promise<FileStats> {
    return this.lstat(fd.path);
  }

  futimes(fd: FtpFileHandle, _atime: number, mtime: number): Promise<void> {
    if (!this._supportMFMT) return Promise.resolve();

    return this.atomicSetLastMod(fd.path, new Date(mtime * 1000)).catch(_ => {
      logger.info('Don\'t Support MFMT');
      this._supportMFMT = false;
    });
  }

  async get(path, _option?: FileOption): Promise<Readable> {
    const stream = await this.atomicGet(path);

    if (!stream) {
      throw new Error('falha ao criar o stream de leitura');
    }

    return stream;
  }

  async chmod(path: string, mode: number): Promise<void> {
    const command = `CHMOD ${mode.toString(8)} ${path}`;
    return await this.atomicSite(command);
  }

  async put(input: Readable, path, _option?: FileOption): Promise<void> {
    return await this.atomicPut(input, path);
  }

  readlink(path: string): Promise<string> {
    return this.lstat(path).then(stat => stat.target!);
  }

  symlink(_targetPath: string, _path: string): Promise<void> {
    // TO-DO implement
    return Promise.resolve();
  }

  async mkdir(dir: string): Promise<void> {
    return await this.atomicMakeDir(dir);
  }

  async ensureDir(dir: string): Promise<void> {
    return await this._ensureDir(dir, true);
  }

  async _ensureDir(dir: string, checkExistFirst: boolean): Promise<void> {
    // The root is always there. Trying to create it is what produced
    // "501 No directory name" — and that error aborted the entire upload.
    if (isRootPath(dir)) {
      return;
    }

    // check if exist first.
    // `ls` command can't make sure to return dotfiles, so this not work for dotfiles,
    // cause ftp don't return distinct error code for dir not exists and dir exists
    if (checkExistFirst) {
      let stat;
      try {
        stat = await this.lstat(dir);
      } catch {
        // ignore error
      }

      if (stat) {
        if (stat.type !== FileType.Directory) {
          logger.error(`${dir} (type = ${stat.type})is not a directory`);
          throw new Error(`${dir} não é um caminho de diretório válido`);
        }

        return;
      }
    }

    let err;
    try {
      await this.mkdir(dir);
      return;
    } catch (error) {
      // avoid nested code block
      err = error;
    }

    if (err.code === 550) {
      // Hooray, exists!
      if (err.message.toLowerCase().indexOf('file exists') >= 0) {
        return;
      }

      const parentPath = this.pathResolver.dirname(dir);
      // Only walk up while there is a real parent left to create. Reaching the
      // root means the missing piece was `dir` itself, so fall through to the
      // check below instead of asking the server to create the root.
      if (parentPath !== dir && !isRootPath(parentPath)) {
        // If goes here, we can assume the file doesn't exist
        await this._ensureDir(parentPath, false);
        await this.mkdir(dir);
        return;
      }
    }

    // Any other failure: the directory may well be there already — servers
    // disagree on the reply code for that ("550 File exists", "521 Directory
    // already exists", …). Believe a successful stat; otherwise report the
    // original error.
    let stat;
    try {
      stat = await this.lstat(dir);
    } catch {
      // if the stat fails, then that's super weird.
      // let the original error be the failure reason
      throw err;
    }

    if (stat.type !== FileType.Directory) {
      throw err;
    }
  }

  async list(
    dir: string,
    { showHiddenFiles = false } = {}
  ): Promise<FileEntry[]> {
    const stats = await this.atomicList(dir);

    return (
      stats
        // basic-ftp still parses odd lines defensively; guard for a missing name
        // and drop the current/parent directory entries.
        .filter(item => item.name && item.name !== '.' && item.name !== '..')
        .map(item =>
          this.toFileEntry(this.pathResolver.join(dir, item.name), item)
        )
    );
  }

  async unlink(path: string): Promise<void> {
    return await this.atomicDeleteFile(path);
  }

  async rmdir(path: string, recursive: boolean): Promise<void> {
    return await this.atomicRemoveDir(path, recursive);
  }

  async rename(srcPath: string, destPath: string): Promise<void> {
    return await this.renameAtomic(srcPath, destPath);
  }

  async renameAtomic(srcPath: string, destPath: string): Promise<void> {
    return this.queue.add(() => this.ftp.rename(srcPath, destPath));
  }

  private async atomicList(path: string): Promise<FileInfo[]> {
    return this.queue.add(() => this.ftp.list(path));
  }

  // Returns a readable stream immediately while the actual download runs inside
  // the queue slot, so no other command touches the control connection until
  // the transfer finishes. basic-ftp downloads into a writable, so we bridge it
  // through a PassThrough.
  private atomicGet(path: string): Promise<Readable> {
    return new Promise<Readable>((resolveStream, rejectStream) => {
      let streamResolved = false;
      const task = () => {
        const pass = new PassThrough();
        streamResolved = true;
        resolveStream(pass);
        return this.ftp.downloadTo(pass, path).catch((err: Error) => {
          pass.destroy(err);
        });
      };

      this.queue.add(task).catch((err: Error) => {
        if (!streamResolved) rejectStream(err);
      });
    });
  }

  private async atomicPut(input: Readable, path: string): Promise<void> {
    return this.queue.add(async () => {
      await this.ftp.uploadFrom(input, path);
    });
  }

  private async atomicDeleteFile(path: string): Promise<void> {
    return this.queue.add(async () => {
      await this.ftp.remove(path);
    });
  }

  private async atomicMakeDir(path: string): Promise<void> {
    // Never put a bare `MKD` on the wire: the server rejects it with
    // "501 No directory name", an error that reads like a server problem and
    // says nothing about the caller that asked for it.
    if (isRootPath(path)) {
      throw new Error(`"${path}" não é um nome de diretório válido`);
    }

    // Single, non-recursive MKD so that _ensureDir keeps control over the
    // recursion and can read the 550 reply code. basic-ftp's send() throws an
    // FTPError carrying the numeric reply code on failure.
    return this.queue.add(async () => {
      await this.ftp.send('MKD ' + path);
    });
  }

  private async atomicRemoveDir(
    path: string,
    recursive: boolean
  ): Promise<void> {
    return this.queue.add(async () => {
      if (recursive) {
        await this.ftp.removeDir(path);
      } else {
        await this.ftp.removeEmptyDir(path);
      }
    });
  }

  private async atomicSite(command: string): Promise<void> {
    return this.queue.add(async () => {
      await this.ftp.send('SITE ' + command);
    });
  }

  private async atomicSetLastMod(path: string, date: Date): Promise<void> {
    return this.queue.add(async () => {
      await this.ftp.send('MFMT ' + formatMfmtDate(date) + ' ' + path);
    });
  }
}
