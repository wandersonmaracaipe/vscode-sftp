import { refreshRemoteExplorer } from './shared';
import { fileOperations } from '../core';
import { showConfirmMessage } from '../host';
import createFileHandler from './createFileHandler';
import { FileHandleOption } from './option';

export const createRemoteFile = createFileHandler<FileHandleOption & { skipDir?: boolean }>({
  name: 'createRemoteFile',
  async handle(option) {
    const remoteFs = await this.fileService.getRemoteFileSystem(this.config);
    const { remoteFsPath } = this.target;

    // #228: creating a file that already exists remotely would silently
    // truncate it. Confirm before overwriting an existing remote entry.
    let existing;
    try {
      existing = await remoteFs.lstat(remoteFsPath);
    } catch {
      existing = undefined; // doesn't exist yet — safe to create
    }
    if (existing) {
      const overwrite = await showConfirmMessage(
        `"${remoteFsPath}" already exists on the remote. Overwrite it?`,
        'Overwrite',
        'Cancel'
      );
      if (!overwrite) {
        return;
      }
    }

    let promise;
    promise = fileOperations.createFile(remoteFsPath, remoteFs, {});

    /*
    const stat = await remoteFs.lstat(remoteFsPath);
    switch (stat.type) {
      case FileType.Directory:
        if (option.skipDir) {
          return;
        }
        promise = fileOperations.createDir(remoteFsPath, remoteFs, {});
        // promise = fileOperations.removeDir(remoteFsPath, remoteFs, {});
        break;
      case FileType.File:
      case FileType.SymbolicLink:
        // promise = fileOperations.removeFile(remoteFsPath, remoteFs, {});
        break;
      default:
        throw new Error(`Unsupported file type (type = ${stat.type})`);
    }*/
    await promise;
  },
  transformOption() {
    const config = this.config;
    return {
      ignore: config.ignore,
    };
  },
  afterHandle() {
    refreshRemoteExplorer(this.target, false);
  },
});

export const createRemoteFolder = createFileHandler<FileHandleOption & { skipDir?: boolean }>({
  name: 'createRemoteFolder',
  async handle(option) {
    const remoteFs = await this.fileService.getRemoteFileSystem(this.config);
    const { remoteFsPath } = this.target;

    let promise;
    promise = fileOperations.createDir(remoteFsPath, remoteFs, {});

    /*
    const stat = await remoteFs.lstat(remoteFsPath);
    switch (stat.type) {
      case FileType.Directory:
        if (option.skipDir) {
          return;
        }
        promise = fileOperations.createDir(remoteFsPath, remoteFs, {});
        // promise = fileOperations.removeDir(remoteFsPath, remoteFs, {});
        break;
      case FileType.File:
      case FileType.SymbolicLink:
        // promise = fileOperations.removeFile(remoteFsPath, remoteFs, {});
        break;
      default:
        throw new Error(`Unsupported file type (type = ${stat.type})`);
    }*/
    await promise;
  },
  transformOption() {
    const config = this.config;
    return {
      ignore: config.ignore,
    };
  },
  afterHandle() {
    refreshRemoteExplorer(this.target, false);
  },
});
