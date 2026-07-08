import { window } from 'vscode';
import { COMMAND_SAVE_PASSWORD } from '../constants';
import { checkCommand } from './abstract/createCommand';
import { getAllFileService } from '../modules/serviceManager';
import { setStoredPassword } from '../modules/secretStorage';
import { simplifyPath } from '../helper';

async function pickConnection() {
  const services = getAllFileService();
  if (services.length === 0) {
    window.showInformationMessage('SFTP: Nenhuma configuração encontrada.');
    return undefined;
  }
  if (services.length === 1) {
    return services[0].getConfig();
  }
  const items = services.map(service => {
    const config = service.getConfig();
    return {
      label: service.name || simplifyPath(service.baseDir),
      description: `${config.username}@${config.host}:${config.port}`,
      config,
    };
  });
  const pick = await window.showQuickPick(items, { placeHolder: 'Selecione a conexão' });
  return pick && pick.config;
}

export default checkCommand({
  id: COMMAND_SAVE_PASSWORD,

  async handleCommand() {
    const config = await pickConnection();
    if (!config) {
      return;
    }

    const password = await window.showInputBox({
      password: true,
      ignoreFocusOut: true,
      prompt: `Senha para ${config.username}@${config.host}:${config.port}`,
    });
    if (password === undefined) {
      return;
    }

    await setStoredPassword(config, password);
    window.showInformationMessage(
      `SFTP: senha salva no cofre para ${config.username}@${config.host}. 🔒`
    );
  },
});
