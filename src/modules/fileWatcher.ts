import * as vscode from 'vscode';
import { existsSync } from 'fs';
import debounce = require('lodash.debounce');
import logger from '../logger';
import { isValidFile, fileDepth } from '../helper';
import { upload, removeRemote } from '../fileHandlers';
import { WatcherService, TransferDirection } from '../core';
import app from '../app';
import StatusBarItem from '../ui/statusBarItem';
import { getRunningTransformTasks, getFileService } from './serviceManager';

// Whether the watcher should skip this file because the resolved config ignores
// it. Applying the ignore rules here (not just at transfer time) keeps the queue
// clean and, importantly, avoids trying to upload transient files under folders
// like node_modules — which vanish mid-transfer and drop the connection.
function isIgnored(uri: vscode.Uri): boolean {
  try {
    const fileService = getFileService(uri);
    if (!fileService) {
      return false;
    }
    const config = fileService.getConfig();
    return typeof config.ignore === 'function' && config.ignore(uri.fsPath);
  } catch {
    return false;
  }
}

const watchers: {
  [x: string]: vscode.FileSystemWatcher;
} = {};

const uploadQueue = new Set<vscode.Uri>();
const deleteQueue = new Set<vscode.Uri>();

// less than 550 will not work
const ACTION_INTEVAL = 550;

function doUpload() {
  const files = Array.from(uploadQueue).sort((a, b) => fileDepth(b.fsPath) - fileDepth(a.fsPath));
  uploadQueue.clear();

  const currentDownloadTasks = getRunningTransformTasks().filter(
    task => task.transferType === TransferDirection.REMOTE_TO_LOCAL
  );

  files.forEach(async uri => {
    // current target is still in downloading, so don't upload it.
    if (currentDownloadTasks.find(task => task.localFsPath === uri.fsPath)) {
      return;
    }

    const fspath = uri.fsPath;
    // The file may have vanished between the fs event and now (common with
    // transient/temp files). Skip it instead of letting the read fail
    // mid-transfer and tear down the connection.
    if (!existsSync(fspath)) {
      return;
    }

    logger.info(`[watcher/updated] ${fspath}`);
    try {
      await upload(uri);
    } catch (error) {
      logger.error(error, `upload ${fspath}`);
      app.sftpBarItem.updateStatus(StatusBarItem.Status.error);
    }
  });
}

function doDelete() {
  const files = Array.from(deleteQueue).sort((a, b) => fileDepth(b.fsPath) - fileDepth(a.fsPath));
  deleteQueue.clear();
  files.forEach(async uri => {
    const fspath = uri.fsPath;
    logger.info(`[watcher/removed] ${fspath}`);
    try {
      await removeRemote(uri);
    } catch (error) {
      logger.error(error, `remove ${fspath}`);
      app.sftpBarItem.updateStatus(StatusBarItem.Status.error);
    }
  });
}

const debouncedUpload = debounce(doUpload, ACTION_INTEVAL, { leading: true, trailing: true });
const debouncedDelete = debounce(doDelete, ACTION_INTEVAL, { leading: true, trailing: true });

function uploadHandler(uri: vscode.Uri) {
  if (!isValidFile(uri) || isIgnored(uri)) {
    return;
  }

  uploadQueue.add(uri);
  debouncedUpload();
}

function addWatcher(id, watcher) {
  watchers[id] = watcher;
}

function getWatcher(id) {
  return watchers[id];
}

function createWatcher(
  watcherBase: string,
  watcherConfig: { files: false | string; autoUpload: boolean; autoDelete: boolean }
) {
  let watcher = getWatcher(watcherBase);
  if (watcher) {
    // clear old watcher
    watcher.dispose();
  }

  if (!watcherConfig) {
    return;
  }

  const shouldAddListenser = watcherConfig.autoUpload || watcherConfig.autoDelete;
  // tslint:disable-next-line triple-equals
  if (watcherConfig.files == false || !shouldAddListenser) {
    return;
  }

  watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(watcherBase, watcherConfig.files),
    false,
    false,
    false
  );
  addWatcher(watcherBase, watcher);

  if (watcherConfig.autoUpload) {
    watcher.onDidCreate(uploadHandler);
    watcher.onDidChange(uploadHandler);
  }

  if (watcherConfig.autoDelete) {
    watcher.onDidDelete(uri => {
      if (!isValidFile(uri) || isIgnored(uri)) {
        return;
      }

      deleteQueue.add(uri);
      debouncedDelete();
    });
  }
}

function removeWatcher(watcherBase: string) {
  const watcher = getWatcher(watcherBase);
  if (watcher) {
    watcher.dispose();
    delete watchers[watcherBase];
  }
}

const watcherService: WatcherService = {
  create: createWatcher,
  dispose: removeWatcher,
};

export default watcherService;
