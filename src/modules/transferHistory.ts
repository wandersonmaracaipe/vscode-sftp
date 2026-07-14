import * as vscode from 'vscode';
import * as path from 'path';
import { TransferDirection } from '../core';
import { upload, download } from '../fileHandlers';
import logger from '../logger';
import { registerCommand } from '../host';
import {
  COMMAND_TRANSFERHISTORY_RETRY,
  COMMAND_TRANSFERHISTORY_RETRY_ALL_FAILED,
  COMMAND_TRANSFERHISTORY_CLEAR,
  COMMAND_TRANSFERHISTORY_REVEAL,
} from '../constants';

export enum TransferOutcome {
  Success = 'success',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export interface TransferRecord {
  id: number;
  localFsPath: string;
  direction: TransferDirection;
  outcome: TransferOutcome;
  error?: string;
  at: number;
}

// Bounded so a big sync can't grow the history without limit. Newest first.
const MAX_RECORDS = 200;

const records: TransferRecord[] = [];
let nextId = 1;

const onDidChange = new vscode.EventEmitter<void>();

export function recordTransfer(
  localFsPath: string,
  direction: TransferDirection,
  outcome: TransferOutcome,
  error?: string
) {
  records.unshift({
    id: nextId++,
    localFsPath,
    direction,
    outcome,
    error,
    at: Date.now(),
  });
  if (records.length > MAX_RECORDS) {
    records.length = MAX_RECORDS;
  }
  onDidChange.fire();
}

function formatTime(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

class TransferHistoryProvider implements vscode.TreeDataProvider<TransferRecord> {
  readonly onDidChangeTreeData = onDidChange.event;

  getChildren(element?: TransferRecord): TransferRecord[] {
    return element ? [] : records;
  }

  getTreeItem(record: TransferRecord): vscode.TreeItem {
    const item = new vscode.TreeItem(
      path.basename(record.localFsPath),
      vscode.TreeItemCollapsibleState.None
    );

    const arrow = record.direction === TransferDirection.REMOTE_TO_LOCAL ? '↓' : '↑';
    item.description = `${arrow} ${formatTime(record.at)}`;
    item.resourceUri = vscode.Uri.file(record.localFsPath);

    // contextValue drives which inline actions the view shows — only a failed
    // transfer is worth offering a retry for.
    item.contextValue = record.outcome === TransferOutcome.Failed ? 'failedTransfer' : 'transfer';

    switch (record.outcome) {
      case TransferOutcome.Failed:
        item.iconPath = new vscode.ThemeIcon(
          'error',
          new vscode.ThemeColor('list.errorForeground')
        );
        item.tooltip = `${record.localFsPath}\n\nFalhou: ${record.error || 'erro desconhecido'}`;
        break;
      case TransferOutcome.Cancelled:
        item.iconPath = new vscode.ThemeIcon('circle-slash');
        item.tooltip = `${record.localFsPath}\n\nCancelado`;
        break;
      default:
        item.iconPath = new vscode.ThemeIcon(
          'check',
          new vscode.ThemeColor('testing.iconPassed')
        );
        item.tooltip = `${record.localFsPath}\n\n${record.direction}`;
    }

    item.command = {
      command: COMMAND_TRANSFERHISTORY_REVEAL,
      title: 'Abrir',
      arguments: [record],
    };

    return item;
  }
}

async function retry(record: TransferRecord) {
  const uri = vscode.Uri.file(record.localFsPath);
  try {
    if (record.direction === TransferDirection.REMOTE_TO_LOCAL) {
      await download(uri);
    } else {
      await upload(uri);
    }
  } catch (error) {
    logger.error(error, `retry ${record.localFsPath}`);
    vscode.window.showErrorMessage(
      `Falha ao repetir ${path.basename(record.localFsPath)}: ${error && error.message}`
    );
  }
}

export function initTransferHistory(context: vscode.ExtensionContext) {
  const provider = new TransferHistoryProvider();
  context.subscriptions.push(
    vscode.window.createTreeView('transferHistory', { treeDataProvider: provider })
  );

  registerCommand(context, COMMAND_TRANSFERHISTORY_RETRY, (record: TransferRecord) =>
    retry(record)
  );

  registerCommand(context, COMMAND_TRANSFERHISTORY_RETRY_ALL_FAILED, async () => {
    // Snapshot first: each retry appends new records, and a successful one would
    // otherwise be picked up again by the loop.
    const failed = records.filter(r => r.outcome === TransferOutcome.Failed);
    if (!failed.length) {
      vscode.window.showInformationMessage('Nenhuma transferência falhada para repetir.');
      return;
    }
    for (const record of failed) {
      await retry(record);
    }
  });

  registerCommand(context, COMMAND_TRANSFERHISTORY_CLEAR, () => {
    records.length = 0;
    onDidChange.fire();
  });

  registerCommand(context, COMMAND_TRANSFERHISTORY_REVEAL, async (record: TransferRecord) => {
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(record.localFsPath));
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch {
      // The file may have been deleted or be binary — not worth an error popup.
    }
  });
}
