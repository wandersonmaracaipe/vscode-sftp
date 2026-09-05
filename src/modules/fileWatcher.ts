import * as vscode from 'vscode';
import { statSync } from 'fs';
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

// Paths that arrived as a *create* event. A directory's modification time moves
// whenever anything inside it does, so a plain change event on a folder is not
// a reason to re-send the folder: uploading it walks the whole tree and
// re-sends every file under it. Saving one file in the project root would
// re-upload the entire project — on FTP, where transfers are serialised, that
// keeps the queue busy for a very long time and auto-upload looks dead. A
// folder that was just created is still sent, so new folders reach the remote.
const createdPaths = new Set<string>();

// less than 550 will not work
const ACTION_INTEVAL = 550;

const DEFAULT_CONCURRENCY = 4;

// Each upload()/removeRemote() spins up its own transfer scheduler, so firing
// the whole batch at once opens one connection slot per file — a branch switch
// touching hundreds of files would open hundreds of concurrent transfers and
// exhaust the connection. Bound the batch to the service's own `concurrency`.
function batchConcurrency(uri: vscode.Uri): number {
  try {
    const fileService = getFileService(uri);
    const concurrency = fileService && fileService.getConfig().concurrency;
    return typeof concurrency === 'number' && concurrency >= 1
      ? concurrency
      : DEFAULT_CONCURRENCY;
  } catch {
    return DEFAULT_CONCURRENCY;
  }
}

async function runBounded<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      await run(items[cursor++]);
    }
  });
  await Promise.all(workers);
}

// Batches run one after another. Without this, a slow batch still in flight when
// the next debounce fires would stack another pool on top of it, defeating the
// concurrency bound.
let uploadChain: Promise<void> = Promise.resolve();
let deleteChain: Promise<void> = Promise.resolve();

// How long a batch may go without finishing a single file before we stop
// waiting on it. The chain is one promise: a batch that never settles used to
// block every later batch forever, so auto-upload died silently — with no error
// and no way back short of reloading the window. The timer is re-armed after
// each file, so a long but progressing batch is never cut off.
const BATCH_STALL_TIMEOUT = 10 * 60 * 1000;

// Runs one batch and always releases the chain: on success, on failure, or on a
// stall. A stalled batch is left to finish on its own — we only stop making
// every future upload wait for it.
function runBatch(
  files: vscode.Uri[],
  label: string,
  runOne: (uri: vscode.Uri) => Promise<void>
): Promise<void> {
  return new Promise<void>(resolve => {
    let released = false;
    let timer: NodeJS.Timeout;

    const release = () => {
      if (released) {
        return;
      }
      released = true;
      clearTimeout(timer);
      resolve();
    };

    const armStallTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        logger.error(
          `${label}: nenhum arquivo concluído em ${BATCH_STALL_TIMEOUT /
            60000} minutos. A fila foi liberada para não travar os próximos envios.`
        );
        app.sftpBarItem.updateStatus(StatusBarItem.Status.error);
        release();
      }, BATCH_STALL_TIMEOUT);
    };

    armStallTimer();
    runBounded(files, batchConcurrency(files[0]), async uri => {
      try {
        await runOne(uri);
      } finally {
        armStallTimer();
      }
    }).then(release, error => {
      logger.error(error, label);
      release();
    });
  });
}

function doUpload() {
  const files = Array.from(uploadQueue).sort((a, b) => fileDepth(b.fsPath) - fileDepth(a.fsPath));
  const created = new Set(createdPaths);
  uploadQueue.clear();
  createdPaths.clear();
  if (!files.length) {
    return;
  }

  const currentDownloadTasks = getRunningTransformTasks().filter(
    task => task.transferType === TransferDirection.REMOTE_TO_LOCAL
  );

  const uploadOne = async (uri: vscode.Uri) => {
    // current target is still in downloading, so don't upload it.
    if (currentDownloadTasks.find(task => task.localFsPath === uri.fsPath)) {
      return;
    }

    const fspath = uri.fsPath;
    // The file may have vanished between the fs event and now (common with
    // transient/temp files). Skip it instead of letting the read fail
    // mid-transfer and tear down the connection.
    let stat;
    try {
      stat = statSync(fspath);
    } catch {
      return;
    }

    // A folder that only had its timestamp touched: its files raise their own
    // events, so re-sending the whole tree here is pure duplicated work.
    if (stat.isDirectory() && !created.has(fspath)) {
      logger.debug(`[watcher/updated] pasta ignorada (sem criação): ${fspath}`);
      return;
    }

    logger.info(`[watcher/updated] ${fspath}`);
    try {
      await upload(uri);
    } catch (error) {
      logger.error(error, `upload ${fspath}`);
      app.sftpBarItem.updateStatus(StatusBarItem.Status.error);
    }
  };

  uploadChain = uploadChain.then(() => runBatch(files, 'watcher upload batch', uploadOne));
}

function doDelete() {
  const files = Array.from(deleteQueue).sort((a, b) => fileDepth(b.fsPath) - fileDepth(a.fsPath));
  deleteQueue.clear();
  if (!files.length) {
    return;
  }

  const deleteOne = async (uri: vscode.Uri) => {
    const fspath = uri.fsPath;
    logger.info(`[watcher/removed] ${fspath}`);
    try {
      await removeRemote(uri);
    } catch (error) {
      logger.error(error, `remove ${fspath}`);
      app.sftpBarItem.updateStatus(StatusBarItem.Status.error);
    }
  };

  deleteChain = deleteChain.then(() => runBatch(files, 'watcher delete batch', deleteOne));
}

const debouncedUpload = debounce(doUpload, ACTION_INTEVAL, { leading: true, trailing: true });
const debouncedDelete = debounce(doDelete, ACTION_INTEVAL, { leading: true, trailing: true });

function uploadHandler(uri: vscode.Uri, isCreate: boolean) {
  if (!isValidFile(uri) || isIgnored(uri)) {
    return;
  }

  if (isCreate) {
    createdPaths.add(uri.fsPath);
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
    watcher.onDidCreate(uri => uploadHandler(uri, true));
    watcher.onDidChange(uri => uploadHandler(uri, false));
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
