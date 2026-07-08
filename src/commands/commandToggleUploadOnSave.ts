import { window } from 'vscode';
import app from '../app';
import { COMMAND_TOGGLE_UPLOAD_ON_SAVE } from '../constants';
import { checkCommand } from './abstract/createCommand';

export default checkCommand({
  id: COMMAND_TOGGLE_UPLOAD_ON_SAVE,

  async handleCommand() {
    const paused = !app.state.uploadOnSavePaused;
    app.state.uploadOnSavePaused = paused;

    const message = paused
      ? 'SFTP: Upload on save is now PAUSED — files won\'t auto-upload until you resume.'
      : 'SFTP: Upload on save is now ACTIVE (following each profile\'s "uploadOnSave").';

    app.sftpBarItem.showMsg(paused ? 'auto-upload paused' : 'auto-upload active', message, 3000);
    window.showInformationMessage(message);
  },
});
