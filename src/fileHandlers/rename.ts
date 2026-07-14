import { window } from 'vscode';
import { fileOperations, upath } from '../core';
import { refreshRemoteExplorer } from './shared';
import createFileHandler from './createFileHandler';
import { FileHandleOption } from './option';

export const renameRemote = createFileHandler<{ originPath: string }>({
  name: 'rename',
  async handle({ originPath }) {
    const remoteFs = await this.fileService.getRemoteFileSystem(this.config);
    const { localFsPath } = this.target;
    await fileOperations.rename(originPath, localFsPath, remoteFs);
  },
});

// Interactive rename/move of a remote resource: prompts for a new name (which
// may include a path to move the item) and renames it on the remote.
export const renameRemoteResource = createFileHandler<FileHandleOption>({
  name: 'renameRemoteResource',
  async handle() {
    const remoteFs = await this.fileService.getRemoteFileSystem(this.config);
    const { remoteFsPath } = this.target;
    const currentName = upath.basename(remoteFsPath);

    const newName = await window.showInputBox({
      prompt: 'Novo nome (pode incluir um caminho para mover)',
      value: currentName,
      ignoreFocusOut: true,
      validateInput: value =>
        value && value.trim().length > 0 ? null : 'O nome não pode ficar vazio.',
    });
    if (!newName || newName === currentName) {
      return;
    }

    // A plain name renames in place; a path (contains "/") moves the item.
    const newPath = newName.indexOf('/') >= 0
      ? upath.normalize(
          upath.isAbsolute(newName) ? newName : upath.join(upath.dirname(remoteFsPath), newName)
        )
      : upath.join(upath.dirname(remoteFsPath), newName);

    await remoteFs.rename(remoteFsPath, newPath);
  },
  afterHandle() {
    refreshRemoteExplorer(this.target, true);
  },
});
