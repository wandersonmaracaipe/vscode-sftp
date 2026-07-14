import * as vscode from 'vscode';
import { COMMAND_CANCEL_ALL_TRANSFER } from '../constants';

// A dedicated status-bar item that shows how many transfers are currently in
// flight and lets the user cancel them with a click. Hidden while idle.
let item: vscode.StatusBarItem | undefined;

export function initTransferStatusBar(context: vscode.ExtensionContext) {
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
  item.command = COMMAND_CANCEL_ALL_TRANSFER;
  context.subscriptions.push(item);
}

export function renderTransferCount(count: number) {
  if (!item) {
    return;
  }
  if (count > 0) {
    item.text = `$(sync~spin) ${count} transferência${count > 1 ? 's' : ''}`;
    item.tooltip = 'Transferências SFTP em andamento — clique para cancelar todas';
    item.show();
  } else {
    item.hide();
  }
}
