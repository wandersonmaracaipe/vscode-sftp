import * as vscode from 'vscode';
import { refreshRemoteExplorer } from '../shared';
import { upath, FileService, FileType, TransferScheduler, TransferTask } from '../../core';
import { showConfirmMessage, executeCommand, showTextDocument } from '../../host';
import { COMMAND_DIFF } from '../../constants';
import createFileHandler, { FileHandlerContext } from '../createFileHandler';
import { transfer, sync, TransferOption, SyncOption, TransferDirection } from './transfer';

function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 || value >= 100 ? 0 : 1)} ${units[i]}`;
}

function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s restantes`;
  const m = Math.floor(s / 60);
  if (m < 60) {
    const rs = s % 60;
    return `${m}m${rs ? ' ' + rs + 's' : ''} restantes`;
  }
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m restantes`;
}

// Runs a collected transfer scheduler, surfacing a cancellable progress
// notification for multi-file operations. When the total byte size is known the
// bar is determinate by bytes and shows size/speed/ETA; otherwise it advances by
// file count. Single-file transfers (including upload-on-save) keep relying on
// the status-bar spinner to avoid popping a notification on every save.
async function runSchedulerWithProgress(
  scheduler: TransferScheduler,
  fileService: FileService,
  title: string,
  bytes?: { transferred: number },
  totalBytes = 0
) {
  const total = scheduler.size;
  if (total <= 1) {
    await scheduler.run();
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title,
      cancellable: true,
    },
    async (progress, token) => {
      let done = 0;
      const startedAt = Date.now();
      const determinate = !!bytes && totalBytes > 0;
      let lastReportedBytes = 0;

      const render = () => {
        const elapsed = (Date.now() - startedAt) / 1000;
        if (determinate) {
          const transferred = Math.min(bytes!.transferred, totalBytes);
          const increment = ((transferred - lastReportedBytes) / totalBytes) * 100;
          lastReportedBytes = transferred;
          const speed = elapsed > 0 ? transferred / elapsed : 0;
          const remaining = speed > 0 ? (totalBytes - transferred) / speed : 0;
          const parts = [`${done}/${total}`, `${formatBytes(transferred)} / ${formatBytes(totalBytes)}`];
          if (speed > 0) parts.push(`${formatBytes(speed)}/s`);
          if (remaining > 0) parts.push(formatEta(remaining));
          progress.report({ increment, message: parts.join(' · ') });
        } else {
          const parts = [`${done}/${total}`];
          if (bytes && bytes.transferred > 0) {
            const speed = elapsed > 0 ? bytes.transferred / elapsed : 0;
            parts.push(formatBytes(bytes.transferred));
            parts.push(`${formatBytes(speed)}/s`);
          }
          progress.report({ message: parts.join(' · ') });
        }
      };

      render();
      const timer = bytes ? setInterval(render, 500) : undefined;
      const unsubscribe = fileService.afterTransfer(() => {
        done += 1;
        if (!determinate) {
          progress.report({ increment: 100 / total });
        }
        render();
      });
      token.onCancellationRequested(() => fileService.cancelTransferTasks());
      try {
        await scheduler.run();
      } finally {
        if (timer) {
          clearInterval(timer);
        }
        // Land the determinate bar on 100%.
        if (determinate) {
          const remainingPct = 100 - (lastReportedBytes / totalBytes) * 100;
          if (remainingPct > 0) {
            progress.report({ increment: remainingPct });
          }
        }
        unsubscribe();
      }
    }
  );
}

function createTransferHandle(direction: TransferDirection) {
  return async function handle(this: FileHandlerContext, option) {
    const remoteFs = await this.fileService.getRemoteFileSystem(this.config);
    const localFs = this.fileService.getLocalFileSystem();
    const { localFsPath, remoteFsPath } = this.target;
    const scheduler = this.fileService.createTransferScheduler(this.config.concurrency);
    let transferConfig;

    if (direction === TransferDirection.REMOTE_TO_LOCAL) {
      transferConfig = {
        srcFsPath: remoteFsPath,
        srcFs: remoteFs,
        targetFsPath: localFsPath,
        targetFs: localFs,
        transferOption: option,
        transferDirection: TransferDirection.REMOTE_TO_LOCAL,
      };
    } else {
      transferConfig = {
        srcFsPath: localFsPath,
        srcFs: localFs,
        targetFsPath: remoteFsPath,
        targetFs: remoteFs,
        transferOption: option,
        filePerm: this.config.filePerm,
        dirPerm: this.config.dirPerm,
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
      };
    }
    const bytes = { transferred: 0 };
    let totalBytes = 0;
    option.onProgress = (delta: number) => {
      bytes.transferred += delta;
    };
    // todo: abort at here. we should stop collect task
    await transfer(transferConfig, t => {
      totalBytes += t.fileSize;
      scheduler.add(t);
    });
    const title =
      direction === TransferDirection.LOCAL_TO_REMOTE ? 'SFTP: Enviando' : 'SFTP: Baixando';
    await runSchedulerWithProgress(scheduler, this.fileService, title, bytes, totalBytes);
  };
}

const uploadHandle = createTransferHandle(TransferDirection.LOCAL_TO_REMOTE);
const downloadHandle = createTransferHandle(TransferDirection.REMOTE_TO_LOCAL);

// Single-file upload with an optional "remote is newer" conflict warning
// (enabled per-config via `warnRemoteNewer`).
async function uploadFileHandle(this: FileHandlerContext, option) {
  if (this.config.warnRemoteNewer) {
    const remoteFs = await this.fileService.getRemoteFileSystem(this.config);
    const localFs = this.fileService.getLocalFileSystem();
    const { localFsPath, remoteFsPath } = this.target;

    let remoteStat;
    try {
      remoteStat = await remoteFs.lstat(remoteFsPath);
    } catch {
      remoteStat = undefined; // remote file doesn't exist — no conflict
    }

    if (remoteStat && remoteStat.type === FileType.File) {
      const localStat = await localFs.lstat(localFsPath);
      // Remote mtime is already normalized to local time by the FileSystem.
      if (Math.floor(remoteStat.mtime / 1000) > Math.floor(localStat.mtime / 1000)) {
        const overwrite = await showConfirmMessage(
          `O arquivo remoto "${upath.basename(remoteFsPath)}" é mais recente que o local. Enviar mesmo assim?`,
          'Enviar',
          'Cancelar'
        );
        if (!overwrite) {
          return;
        }
      }
    }
  }

  return uploadHandle.call(this, option);
}

export const sync2Remote = createFileHandler<SyncOption>({
  name: 'sync local ➞ remote',
  async handle(option) {
    const remoteFs = await this.fileService.getRemoteFileSystem(this.config);
    const localFs = this.fileService.getLocalFileSystem();
    const { localFsPath, remoteFsPath } = this.target;
    const scheduler = this.fileService.createTransferScheduler(this.config.concurrency);
    // Attach filePerm and dirPerm to transferOption
    option.filePerm = this.config.filePerm;
    option.dirPerm = this.config.dirPerm;
    const bytes = { transferred: 0 };
    let totalBytes = 0;
    option.onProgress = (delta: number) => {
      bytes.transferred += delta;
    };
    await sync(
      {
        srcFsPath: localFsPath,
        srcFs: localFs,
        targetFsPath: remoteFsPath,
        targetFs: remoteFs,
        transferOption: option,
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
      },
      t => {
        totalBytes += t.fileSize;
        scheduler.add(t);
      }
    );
    await runSchedulerWithProgress(
      scheduler,
      this.fileService,
      'SFTP: Sincronizando local ➞ remoto',
      bytes,
      totalBytes
    );
  },
  transformOption() {
    const config = this.config;
    const syncOption = config.syncOption || {};
    return {
      perserveTargetMode: config.protocol === 'sftp' && !config.filePerm && !config.dirPerm,
      useTempFile: config.useTempFile,
      openSsh: config.openSsh,
      // remoteTimeOffsetInHours: config.remoteTimeOffsetInHours,
      ignore: config.ignore,
      delete: syncOption.delete,
      skipCreate: syncOption.skipCreate,
      ignoreExisting: syncOption.ignoreExisting,
      update: syncOption.update,
    };
  },
  afterHandle() {
    refreshRemoteExplorer(this.target, true);
  },
});

export const sync2Local = createFileHandler<SyncOption>({
  name: 'sync remote ➞ local',
  async handle(option) {
    const remoteFs = await this.fileService.getRemoteFileSystem(this.config);
    const localFs = this.fileService.getLocalFileSystem();
    const { localFsPath, remoteFsPath } = this.target;
    const scheduler = this.fileService.createTransferScheduler(this.config.concurrency);
    const bytes = { transferred: 0 };
    let totalBytes = 0;
    option.onProgress = (delta: number) => {
      bytes.transferred += delta;
    };
    await sync(
      {
        srcFsPath: remoteFsPath,
        srcFs: remoteFs,
        targetFsPath: localFsPath,
        targetFs: localFs,
        transferOption: option,
        transferDirection: TransferDirection.REMOTE_TO_LOCAL,
      },
      t => {
        totalBytes += t.fileSize;
        scheduler.add(t);
      }
    );
    await runSchedulerWithProgress(
      scheduler,
      this.fileService,
      'SFTP: Sincronizando remoto ➞ local',
      bytes,
      totalBytes
    );
  },
  transformOption() {
    const config = this.config;
    const syncOption = config.syncOption || {};
    return {
      perserveTargetMode: false,
      // remoteTimeOffsetInHours: config.remoteTimeOffsetInHours,
      ignore: config.ignore,
      delete: syncOption.delete,
      skipCreate: syncOption.skipCreate,
      ignoreExisting: syncOption.ignoreExisting,
      update: syncOption.update,
    };
  },
});

// Dry-run preview of a sync in either direction: collects what would change
// without touching either side, lets the user review it, and applies it only on
// confirmation. Shared by the Local ➞ Remote and Remote ➞ Local previews so the
// two stay identical apart from direction and wording.
async function previewAndApplySync(
  ctx: FileHandlerContext,
  option: SyncOption,
  direction: TransferDirection
) {
  const remoteFs = await ctx.fileService.getRemoteFileSystem(ctx.config);
  const localFs = ctx.fileService.getLocalFileSystem();
  const { localFsPath, remoteFsPath } = ctx.target;
  const toRemote = direction === TransferDirection.LOCAL_TO_REMOTE;

  const buildConfig = (dryRun: boolean) => ({
    srcFsPath: toRemote ? localFsPath : remoteFsPath,
    srcFs: toRemote ? localFs : remoteFs,
    targetFsPath: toRemote ? remoteFsPath : localFsPath,
    targetFs: toRemote ? remoteFs : localFs,
    transferOption: { ...option, dryRun },
    transferDirection: direction,
  });

  const arrow = toRemote ? 'local ➞ remoto' : 'remoto ➞ local';
  const sendVerb = toRemote ? 'Enviar' : 'Baixar';
  const deleteWhere = toRemote ? 'Excluir no remoto' : 'Excluir no local';
  const sendIcon = toRemote ? '$(arrow-up)' : '$(arrow-down)';

  const collected: TransferTask[] = [];
  const deleted = await sync(buildConfig(true), t => collected.push(t));

  if (collected.length === 0 && deleted.length === 0) {
    vscode.window.showInformationMessage(`SFTP: nada para sincronizar (${arrow}). ✅`);
    return;
  }

  const changes: vscode.QuickPickItem[] = [
    ...collected.map(t => ({
      label: `${sendIcon} ${upath.basename(t.targetFsPath)}`,
      description: t.targetFsPath,
      detail: sendVerb,
    })),
    ...deleted.map(f => ({
      label: `$(trash) ${upath.basename(f.fspath)}`,
      description: f.fspath,
      detail: deleteWhere,
    })),
  ];

  const APPLY = '$(check) Aplicar sincronização';
  const summary = `${collected.length} ${toRemote ? 'envio(s)' : 'download(s)'} · ${
    deleted.length
  } exclusão(ões)`;
  const pick = await vscode.window.showQuickPick(
    [{ label: APPLY, description: summary }, ...changes],
    {
      placeHolder: `Preview ${arrow}: ${summary}. Escolha "Aplicar" para sincronizar.`,
      matchOnDescription: true,
    }
  );

  if (!pick || pick.label !== APPLY) {
    return;
  }

  // Apply for real.
  const scheduler = ctx.fileService.createTransferScheduler(ctx.config.concurrency);
  const bytes = { transferred: 0 };
  let totalBytes = 0;
  if (toRemote) {
    option.filePerm = ctx.config.filePerm;
    option.dirPerm = ctx.config.dirPerm;
  }
  option.onProgress = (delta: number) => {
    bytes.transferred += delta;
  };
  await sync(buildConfig(false), t => {
    totalBytes += t.fileSize;
    scheduler.add(t);
  });
  await runSchedulerWithProgress(
    scheduler,
    ctx.fileService,
    `SFTP: Sincronizando ${arrow}`,
    bytes,
    totalBytes
  );
}

export const syncPreview2Remote = createFileHandler<SyncOption>({
  name: 'sync preview local ➞ remote',
  handle(option) {
    return previewAndApplySync(this, option, TransferDirection.LOCAL_TO_REMOTE);
  },
  transformOption() {
    const config = this.config;
    const syncOption = config.syncOption || {};
    return {
      perserveTargetMode: config.protocol === 'sftp' && !config.filePerm && !config.dirPerm,
      useTempFile: config.useTempFile,
      openSsh: config.openSsh,
      ignore: config.ignore,
      delete: syncOption.delete,
      skipCreate: syncOption.skipCreate,
      ignoreExisting: syncOption.ignoreExisting,
      update: syncOption.update,
    };
  },
  afterHandle() {
    refreshRemoteExplorer(this.target, true);
  },
});

// Compares a local folder against its remote counterpart and lists the
// differences, without changing either side. Reuses the sync dry-run: a
// Local ➞ Remote pass with delete+dryRun reports the local-side changes
// (collected) and the remote-only entries (deleted) in one traversal.
export const diffFolder = createFileHandler<SyncOption>({
  name: 'diff folder',
  async handle(option) {
    const remoteFs = await this.fileService.getRemoteFileSystem(this.config);
    const localFs = this.fileService.getLocalFileSystem();
    const { localFsPath, remoteFsPath } = this.target;
    const serviceName = this.fileService.name || 'remote';

    const collected: TransferTask[] = [];
    const deleted = await sync(
      {
        srcFsPath: localFsPath,
        srcFs: localFs,
        targetFsPath: remoteFsPath,
        targetFs: remoteFs,
        transferOption: { ...option, delete: true, dryRun: true },
        transferDirection: TransferDirection.LOCAL_TO_REMOTE,
      },
      t => collected.push(t)
    );

    if (collected.length === 0 && deleted.length === 0) {
      vscode.window.showInformationMessage(
        `SFTP: a pasta local está idêntica ao remoto (${serviceName}). ✅`
      );
      return;
    }

    // `collected` mixes "only local" with "differs". A file's remote
    // counterpart existing decides which — and whether a side-by-side diff even
    // makes sense. Bounded so a wildly divergent tree can't fire thousands of
    // stats; past the cap everything is shown without the distinction.
    const CLASSIFY_LIMIT = 300;
    const localItems = await Promise.all(
      collected.map(async (t, i) => {
        let onBoth = false;
        if (i < CLASSIFY_LIMIT && t.fileType === FileType.File) {
          try {
            await remoteFs.lstat(t.targetFsPath);
            onBoth = true;
          } catch {
            onBoth = false; // not on the remote — local-only
          }
        }
        return { task: t, onBoth };
      })
    );

    interface DiffPick extends vscode.QuickPickItem {
      localPath?: string;
      remotePath?: string;
      diff?: boolean;
    }

    const items: DiffPick[] = [
      ...localItems.map(({ task, onBoth }) => ({
        label: `${onBoth ? '$(diff-modified)' : '$(diff-added)'} ${upath.basename(
          task.srcFsPath
        )}`,
        description: task.srcFsPath,
        detail: onBoth ? 'Diferente (local ↔ remoto)' : 'Apenas no local',
        localPath: task.srcFsPath,
        diff: onBoth,
      })),
      ...deleted.map(f => ({
        label: `$(diff-removed) ${upath.basename(f.fspath)}`,
        description: f.fspath,
        detail: 'Apenas no remoto',
        remotePath: f.fspath,
      })),
    ];

    const summary = `${localItems.filter(i => i.onBoth).length} diferente(s) · ${
      localItems.filter(i => !i.onBoth).length
    } só local · ${deleted.length} só remoto`;

    const pick = (await vscode.window.showQuickPick(items, {
      placeHolder: `Diferenças com ${serviceName}: ${summary}`,
      matchOnDescription: true,
    })) as DiffPick | undefined;

    if (!pick) {
      return;
    }

    if (pick.diff && pick.localPath) {
      // Open the existing side-by-side file diff for a differing file.
      await executeCommand(COMMAND_DIFF, vscode.Uri.file(pick.localPath));
    } else if (pick.localPath) {
      await showTextDocument(vscode.Uri.file(pick.localPath));
    }
    // A remote-only entry has no local file to open; selecting it is just
    // informational (its path is shown in the pick).
  },
  transformOption() {
    const config = this.config;
    const syncOption = config.syncOption || {};
    return {
      perserveTargetMode: false,
      ignore: config.ignore,
      // delete is forced on in handle() to surface remote-only entries; the
      // dry run guarantees nothing is actually removed.
      skipCreate: syncOption.skipCreate,
      ignoreExisting: syncOption.ignoreExisting,
      update: syncOption.update,
    };
  },
});

export const syncPreview2Local = createFileHandler<SyncOption>({
  name: 'sync preview remote ➞ local',
  handle(option) {
    return previewAndApplySync(this, option, TransferDirection.REMOTE_TO_LOCAL);
  },
  transformOption() {
    const config = this.config;
    const syncOption = config.syncOption || {};
    return {
      perserveTargetMode: false,
      ignore: config.ignore,
      delete: syncOption.delete,
      skipCreate: syncOption.skipCreate,
      ignoreExisting: syncOption.ignoreExisting,
      update: syncOption.update,
    };
  },
});

export const upload = createFileHandler<TransferOption>({
  name: 'upload',
  handle: uploadHandle,
  transformOption() {
    const config = this.config;
    return {
      perserveTargetMode: config.protocol === 'sftp' && !config.filePerm && !config.dirPerm,
      useTempFile: config.useTempFile,
      openSsh: config.openSsh,
      // remoteTimeOffsetInHours: config.remoteTimeOffsetInHours,
      ignore: config.ignore,
    };
  },
  afterHandle() {
    refreshRemoteExplorer(this.target, this.fileService);
  },
});

export const uploadFile = createFileHandler<TransferOption>({
  name: 'upload file',
  handle: uploadFileHandle,
  transformOption() {
    const config = this.config;
    return {
      perserveTargetMode: config.protocol === 'sftp' && !config.filePerm,
      useTempFile: config.useTempFile,
      openSsh: config.openSsh,
      // remoteTimeOffsetInHours: config.remoteTimeOffsetInHours,
      ignore: config.ignore,
    };
  },
  afterHandle() {
    refreshRemoteExplorer(this.target, false);
  },
});

export const uploadFolder = createFileHandler<TransferOption>({
  name: 'upload folder',
  handle: uploadHandle,
  transformOption() {
    const config = this.config;
    return {
      perserveTargetMode: config.protocol === 'sftp' && !config.dirPerm,
      useTempFile: config.useTempFile,
      openSsh: config.openSsh,
      // remoteTimeOffsetInHours: config.remoteTimeOffsetInHours,
      ignore: config.ignore,
    };
  },
  afterHandle() {
    refreshRemoteExplorer(this.target, true);
  },
});

export const download = createFileHandler<TransferOption>({
  name: 'download',
  handle: downloadHandle,
  transformOption() {
    const config = this.config;
    return {
      perserveTargetMode: false,
      // remoteTimeOffsetInHours: config.remoteTimeOffsetInHours,
      ignore: config.ignore,
    };
  },
});

export const downloadFile = createFileHandler<TransferOption>({
  name: 'download file',
  handle: downloadHandle,
  transformOption() {
    const config = this.config;
    return {
      perserveTargetMode: false,
      // remoteTimeOffsetInHours: config.remoteTimeOffsetInHours,
      ignore: config.ignore,
    };
  },
});

export const downloadFolder = createFileHandler<TransferOption>({
  name: 'download folder',
  handle: downloadHandle,
  transformOption() {
    const config = this.config;
    return {
      perserveTargetMode: false,
      // remoteTimeOffsetInHours: config.remoteTimeOffsetInHours,
      ignore: config.ignore,
    };
  },
});
