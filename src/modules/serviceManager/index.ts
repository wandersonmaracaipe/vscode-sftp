import { Uri } from 'vscode';
import * as path from 'path';
import app from '../../app';
import logger from '../../logger';
import { simplifyPath, reportError } from '../../helper';
import { UResource, FileService, TransferTask } from '../../core';
import { validateConfig } from '../config';
import watcherService from '../fileWatcher';
import { renderTransferCount } from '../transferStatusBar';
import { recordTransfer, TransferOutcome } from '../transferHistory';
import Trie from './trie';

const WIN_DRIVE_REGEX = /^([a-zA-Z]):/;
const isWindows = process.platform === 'win32';

const serviceManager = new Trie<FileService>(
  {},
  {
    delimiter: path.sep,
  }
);

function maskConfig(config) {
  const copy = {};
  const MASK = '******';
  Object.keys(config).forEach(key => {
    const configValue = config[key];
    switch (key) {
      case 'username':
      case 'password':
      case 'passphrase':
        copy[key] = MASK;
        break;
      case 'interactiveAuth':
        if (Array.isArray(configValue)) {
          copy[key] = configValue.map(phrase => MASK);
        } else {
          copy[key] = configValue;
        }
        break;
      default:
        copy[key] = configValue;
    }
  });
  return copy;
}

function normalizePathForTrie(pathname) {
  if (isWindows) {
    const device = pathname.substr(0, 2);
    if (device.charAt(1) === ':') {
      // lowercase drive letter
      pathname = pathname[0].toLowerCase() + pathname.substr(1);
    }
  }

  return path.normalize(pathname);
}

// Key used to index services in the trie. On Windows the filesystem is
// case-insensitive, but the trie matches path segments exactly, so a fsPath
// coming back from VS Code with different casing than the configured base path
// would fail to resolve and raise a spurious "Config Not Found" (issue #428).
// Lower-casing the whole key on Windows makes the lookup case-insensitive.
// The service still keeps its original-cased baseDir for display and transfers.
function toTrieKey(pathname: string): string {
  const normalized = normalizePathForTrie(pathname);
  return isWindows ? normalized.toLowerCase() : normalized;
}

export function getBasePath(context: string, workspace: string) {
  let dirpath;
  if (context) {
    if (path.isAbsolute(context)) {
      dirpath = context;
      if (isWindows) {
        const contextBeginWithDrive = context.match(WIN_DRIVE_REGEX);
        // if a windows user omit drive, we complete it with a drive letter same with the workspace one
        if (!contextBeginWithDrive) {
          const workspaceDrive = workspace.match(WIN_DRIVE_REGEX);
          if (workspaceDrive) {
            const drive = workspaceDrive[1];
            dirpath = path.join(`${drive}:`, context);
          }
        }
      }
    } else {
      // Don't use path.resolve bacause it may change the root dir of workspace!
      // Example: On window path.resove('\\a\\b\\c') will result to '<drive>:\\a\\b\\c'
      // We know workspace must be a absolute path and context is a relative path to workspace,
      // so path.join will suit our requirements.
      dirpath = path.join(workspace, context);
    }
  } else {
    dirpath = workspace;
  }

  return normalizePathForTrie(dirpath);
}

export function createFileService(config: any, workspace: string) {
  if (config.defaultProfile) {
    app.state.profile = config.defaultProfile;
  }

  const normalizedBasePath = getBasePath(config.context, workspace);
  const service = new FileService(normalizedBasePath, workspace, config);

  logger.info(`config at ${normalizedBasePath}`, maskConfig(config));

  serviceManager.add(toTrieKey(normalizedBasePath), service);
  service.name = config.name;
  service.setConfigValidator(validateConfig);
  service.setWatcherService(watcherService);
  service.beforeTransfer(task => {
    const { localFsPath, transferType } = task;
    app.sftpBarItem.showMsg(
      `${transferType} ${path.basename(localFsPath)}`,
      simplifyPath(localFsPath)
    );
    renderTransferCount(getRunningTransformTasks().length);
  });
  service.afterTransfer((error, task) => {
    renderTransferCount(getRunningTransformTasks().length);
    const { localFsPath, transferType } = task;
    const filename = path.basename(localFsPath);
    const filepath = simplifyPath(localFsPath);
    if (task.isCancelled()) {
      logger.info(`cancel transfer ${localFsPath}`);
      app.sftpBarItem.showMsg(`cancelado ${filename}`, filepath, 2000 * 2);
      recordTransfer(localFsPath, transferType, TransferOutcome.Cancelled);
    } else if (error) {
      // if ((error as any).reported !== true) {
      reportError(error, `when ${transferType} ${localFsPath}`);
      // }
      app.sftpBarItem.showMsg(`falhou ${filename}`, filepath, 2000 * 2);
      recordTransfer(localFsPath, transferType, TransferOutcome.Failed, error && error.message);
    } else {
      logger.info(`${transferType} ${localFsPath}`);
      app.sftpBarItem.showMsg(`concluído ${filename}`, filepath, 2000 * 2);
      recordTransfer(localFsPath, transferType, TransferOutcome.Success);
    }
  });

  return service;
}

export function getFileService(uri: Uri): FileService {
  let fileService;
  if (UResource.isRemote(uri)) {
    const remoteRoot = app.remoteExplorer.findRoot(uri);
    if (remoteRoot) {
      fileService = remoteRoot.explorerContext.fileService;
    }
  } else {
    fileService = serviceManager.findPrefix(toTrieKey(uri.fsPath));
  }

  return fileService;
}

export function disposeFileService(fileService: FileService) {
  serviceManager.remove(toTrieKey(fileService.baseDir));
  fileService.dispose();
}

export function findAllFileService(predictor: (x: FileService) => boolean): FileService[] {
  if (serviceManager === undefined) {
    return [];
  }

  return getAllFileService().filter(predictor);
}

export function getAllFileService(): FileService[] {
  if (serviceManager === undefined) {
    return [];
  }

  return serviceManager.getAllValues();
}

export function getRunningTransformTasks(): TransferTask[] {
  return getAllFileService().reduce<TransferTask[]>((acc, fileService) => {
    return acc.concat(fileService.getPendingTransferTasks());
  }, []);
}
