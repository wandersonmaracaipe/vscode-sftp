import { window } from 'vscode';
import { COMMAND_SAVE_PASSWORD } from '../constants';
import { checkCommand } from './abstract/createCommand';
import { setStoredPassword, setStoredPassphrase } from '../modules/secretStorage';
import { pickConnection, pickSecretKind } from './shared';

export default checkCommand({
  id: COMMAND_SAVE_PASSWORD,

  async handleCommand() {
    const config = await pickConnection();
    if (!config) {
      return;
    }

    const kind = await pickSecretKind(config);
    if (!kind) {
      return;
    }

    const isPassphrase = kind === 'passphrase';
    const target = `${config.username}@${config.host}:${config.port}`;

    const secret = await window.showInputBox({
      password: true,
      ignoreFocusOut: true,
      prompt: isPassphrase
        ? `Passphrase da chave privada de ${target}`
        : `Senha para ${target}`,
    });
    if (secret === undefined) {
      return;
    }

    if (isPassphrase) {
      await setStoredPassphrase(config, secret);
      window.showInformationMessage(
        `SFTP: passphrase salva no cofre para ${config.username}@${config.host}. 🔒`
      );
      return;
    }

    await setStoredPassword(config, secret);
    window.showInformationMessage(
      `SFTP: senha salva no cofre para ${config.username}@${config.host}. 🔒`
    );
  },
});
