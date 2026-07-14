import upath from './upath';
import { promptForPassword } from '../host';
import logger from '../logger';
import app from '../app';
import StatusBarItem from '../ui/statusBarItem';
import { getStoredPassword } from '../modules/secretStorage';
import { isTransientError } from './transientError';
import { ConnectOption } from './remote-client/remoteClient';
import {
  FileSystem,
  RemoteFileSystem,
  SFTPFileSystem,
  FTPFileSystem,
} from './fs';
import localFs from './localFs';

const MAX_CONNECT_ATTEMPTS = 3; // 1 tentativa inicial + 2 novas tentativas
const RECONNECT_DELAY_MS = 1000;

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function hashOption(opiton) {
  return Object.keys(opiton)
    .map(key => opiton[key])
    .join('');
}

class KeepAliveRemoteFs {
  private isValid: boolean = false;

  private pendingPromise: Promise<RemoteFileSystem> | null;

  private fs: RemoteFileSystem;

  async getFs(
    option: ConnectOption & {
      protocol: string;
      remoteTimeOffsetInHours: number;
    }
  ): Promise<RemoteFileSystem> {
    if (this.isValid) {
      this.pendingPromise = null;
      return Promise.resolve(this.fs);
    }

    if (this.pendingPromise) {
      return this.pendingPromise;
    }

    const connectOption = Object.assign({}, option);
    // tslint:disable variable-name
    let FsConstructor: typeof SFTPFileSystem | typeof FTPFileSystem;
    if (option.protocol === 'sftp') {
      connectOption.debug = function debug(str) {
        const log = str.match(/^DEBUG(?:\[SFTP\])?: (.*?): (.*?)$/);

        if (log) {
          if (log[1] === 'Parser') return;
          logger.debug(`${log[1]}: ${log[2]}`);
        } else {
          logger.debug(str);
        }
      };
      FsConstructor = SFTPFileSystem;
    } else if (option.protocol === 'ftp') {
      connectOption.debug = function debug(str) {
        const log = str.match(/^\[connection\] (>|<) (.*?)(\\r\\n)?$/);

        if (!log) return;

        if (log[2].match(/200 NOOP/)) return;

        if (log[2].match(/^PASS /)) log[2] = 'PASS ******';

        logger.debug(`${log[1]} ${log[2]}`);
      };
      FsConstructor = FTPFileSystem;
    } else {
      throw new Error(`Protocolo não suportado: ${option.protocol}`);
    }

    // Prefer a password saved in the OS keychain; fall back to prompting.
    const askForPasswd = async (msg: string) => {
      const saved = await getStoredPassword(connectOption);
      if (saved !== undefined) {
        return saved;
      }
      return promptForPassword(msg);
    };

    app.sftpBarItem.showMsg('conectando...', connectOption.connectTimeout);
    this.pendingPromise = (async () => {
      let lastError;
      for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
        // A fresh client per attempt. onDisconnected is bound before connect
        // (some clients wire the handler during connect), but `invalid()` only
        // acts once the connection is established, so a failed attempt's
        // teardown won't disturb the retry.
        this.fs = new FsConstructor(upath, {
          clientOption: connectOption,
          remoteTimeOffsetInHours: option.remoteTimeOffsetInHours,
        });
        this.fs.onDisconnected(this.invalid.bind(this));

        try {
          await this.fs.connect(connectOption, { askForPasswd });
          this.isValid = true;
          app.sftpBarItem.updateStatus(StatusBarItem.Status.ok);
          app.sftpBarItem.reset();
          return this.fs;
        } catch (err) {
          lastError = err;
          try {
            this.fs.end();
          } catch {
            // ignore teardown errors
          }

          if (attempt >= MAX_CONNECT_ATTEMPTS || !isTransientError(err)) {
            break;
          }

          logger.warn(
            `Falha ao conectar (tentativa ${attempt}/${MAX_CONNECT_ATTEMPTS}): ` +
              `${err && err.message}. Tentando novamente…`
          );
          app.sftpBarItem.showMsg('reconectando…', connectOption.connectTimeout);
          await delay(RECONNECT_DELAY_MS);
        }
      }

      this.pendingPromise = null;
      this.isValid = false;
      app.sftpBarItem.updateStatus(StatusBarItem.Status.error);
      throw lastError;
    })();

    return this.pendingPromise;
  }

  invalid(reason: string) {
    // Ignore disconnect events that fire while we're still (re)connecting;
    // only an established connection dropping should invalidate the pool entry.
    if (!this.isValid) {
      return;
    }
    this.isValid = false;
    this.pendingPromise = null;
    try {
      this.fs.end();
    } catch {
      // ignore
    }
  }

  end() {
    this.fs.end();
  }
}

function getLocalFs() {
  return Promise.resolve(localFs);
}

const fsTable: {
  [x: string]: KeepAliveRemoteFs;
} = {};

export function createRemoteIfNoneExist(option): Promise<FileSystem> {
  if (option.protocol === 'local') {
    return getLocalFs();
  }

  const identity = hashOption(option);
  const fs = fsTable[identity];
  if (fs !== undefined) {
    return fs.getFs(option);
  }

  const fsInstance = new KeepAliveRemoteFs();
  fsTable[identity] = fsInstance;
  return fsInstance.getFs(option);
}

export function removeRemoteFs(option) {
  const identity = hashOption(option);
  const fs = fsTable[identity];
  if (fs !== undefined) {
    fs.end();
    delete fsTable[identity];
  }
}
