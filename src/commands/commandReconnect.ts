import app from '../app';
import logger from '../logger';
import StatusBarItem from '../ui/statusBarItem';
import { COMMAND_RECONNECT } from '../constants';
import { showInformationMessage } from '../host';
import { checkCommand } from './abstract/createCommand';
import { getAllFileService } from '../modules/serviceManager';
import { removeAllRemoteFs } from '../core/remoteFs';
import { renderTransferCount } from '../modules/transferStatusBar';

// Escape hatch for a session that got itself stuck: cancels whatever is still
// queued, throws away every pooled connection and clears the transfer
// indicators. The next upload/sync connects from scratch — no window reload,
// no restarting the editor.
export default checkCommand({
  id: COMMAND_RECONNECT,

  async handleCommand() {
    getAllFileService().forEach(fileService => fileService.cancelTransferTasks());
    removeAllRemoteFs();

    renderTransferCount(0);
    app.sftpBarItem.stopSpinner();
    app.sftpBarItem.updateStatus(StatusBarItem.Status.ok);
    app.sftpBarItem.reset();

    logger.info('conexões reiniciadas pelo comando "Reconectar"');
    showInformationMessage('SFTP: conexões reiniciadas. A próxima operação vai reconectar.');
  },
});
