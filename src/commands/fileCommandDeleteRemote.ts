import { window } from 'vscode';
import { COMMAND_DELETE_REMOTE } from '../constants';
import { upath } from '../core';
import { removeRemote } from '../fileHandlers';
import { checkFileCommand } from './abstract/createCommand';
import { uriFromExplorerContextOrEditorContext } from './shared';

export default checkFileCommand({
  id: COMMAND_DELETE_REMOTE,
  async getFileTarget(item, items) {
    const targets = await uriFromExplorerContextOrEditorContext(item, items);

    if (!targets) {
      return;
    }

    const names = Array.isArray(targets)
      ? targets.map(t => upath.basename(t.fsPath))
      : [upath.basename(targets.fsPath)];
    const label =
      names.length > 1 ? `${names.length} itens remotos` : `'${names[0]}'`;

    // Use a modal warning so a destructive, non-undoable remote delete can't be
    // dismissed by accident (the old non-modal notification was easy to miss).
    const choice = await window.showWarningMessage(
      `Excluir ${label} no servidor remoto?`,
      {
        modal: true,
        detail:
          'Isto remove permanentemente o(s) item(ns) no remoto. Pastas são excluídas com todo o seu conteúdo. Esta ação não pode ser desfeita.',
      },
      'Excluir'
    );

    return choice === 'Excluir' ? targets : undefined;
  },

  handleFile: removeRemote,
});
