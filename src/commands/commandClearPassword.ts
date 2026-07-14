import { window } from 'vscode';
import { COMMAND_CLEAR_PASSWORD } from '../constants';
import { checkCommand } from './abstract/createCommand';
import { deleteStoredPassword, deleteStoredPassphrase } from '../modules/secretStorage';
import { pickConnection, pickSecretKind } from './shared';

export default checkCommand({
  id: COMMAND_CLEAR_PASSWORD,

  async handleCommand() {
    const config = await pickConnection();
    if (!config) {
      return;
    }

    const kind = await pickSecretKind(config);
    if (!kind) {
      return;
    }

    if (kind === 'passphrase') {
      await deleteStoredPassphrase(config);
      window.showInformationMessage(
        `SFTP: passphrase removida do cofre para ${config.username}@${config.host}.`
      );
      return;
    }

    await deleteStoredPassword(config);
    window.showInformationMessage(
      `SFTP: senha removida do cofre para ${config.username}@${config.host}.`
    );
  },
});
