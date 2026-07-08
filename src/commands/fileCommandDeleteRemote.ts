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
      names.length > 1 ? `${names.length} remote items` : `'${names[0]}'`;

    // Use a modal warning so a destructive, non-undoable remote delete can't be
    // dismissed by accident (the old non-modal notification was easy to miss).
    const choice = await window.showWarningMessage(
      `Delete ${label} on the remote server?`,
      {
        modal: true,
        detail:
          'This permanently removes the item(s) on the remote. Folders are deleted with all their contents. This cannot be undone.',
      },
      'Delete'
    );

    return choice === 'Delete' ? targets : undefined;
  },

  handleFile: removeRemote,
});
