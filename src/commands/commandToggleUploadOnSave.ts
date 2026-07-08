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
      ? 'SFTP: Envio ao salvar PAUSADO — os arquivos não serão enviados automaticamente até você retomar.'
      : 'SFTP: Envio ao salvar ATIVO (seguindo o "uploadOnSave" de cada perfil).';

    app.sftpBarItem.showMsg(paused ? 'envio ao salvar pausado' : 'envio ao salvar ativo', message, 3000);
    window.showInformationMessage(message);
  },
});
