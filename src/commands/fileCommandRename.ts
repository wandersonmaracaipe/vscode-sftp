import { COMMAND_RENAME_REMOTE } from '../constants';
import { renameRemoteResource } from '../fileHandlers';
import { checkFileCommand } from './abstract/createCommand';
import { uriFromExplorerContextOrEditorContext } from './shared';

export default checkFileCommand({
  id: COMMAND_RENAME_REMOTE,
  async getFileTarget(item, items) {
    const targets = await uriFromExplorerContextOrEditorContext(item, items);
    if (!targets) {
      return;
    }
    // Rename operates on a single item.
    return Array.isArray(targets) ? targets[0] : targets;
  },

  handleFile: renameRemoteResource,
});
