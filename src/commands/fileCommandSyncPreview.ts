import { COMMAND_SYNC_PREVIEW } from '../constants';
import { syncPreview2Remote } from '../fileHandlers';
import { checkFileCommand } from './abstract/createCommand';
import { selectFolderFallbackToConfigContext, uriFromfspath, applySelector } from './shared';

export default checkFileCommand({
  id: COMMAND_SYNC_PREVIEW,
  getFileTarget: applySelector(uriFromfspath, selectFolderFallbackToConfigContext),

  handleFile: syncPreview2Remote,
});
