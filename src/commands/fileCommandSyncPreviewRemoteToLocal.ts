import { COMMAND_SYNC_PREVIEW_REMOTE_TO_LOCAL } from '../constants';
import { syncPreview2Local } from '../fileHandlers';
import { checkFileCommand } from './abstract/createCommand';
import { selectFolderFallbackToConfigContext, uriFromfspath, applySelector } from './shared';

export default checkFileCommand({
  id: COMMAND_SYNC_PREVIEW_REMOTE_TO_LOCAL,
  getFileTarget: applySelector(uriFromfspath, selectFolderFallbackToConfigContext),

  handleFile: syncPreview2Local,
});
