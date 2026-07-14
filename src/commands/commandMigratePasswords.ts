import { COMMAND_MIGRATE_PASSWORDS } from '../constants';
import { checkCommand } from './abstract/createCommand';
import { getWorkspaceFolders } from '../host';
import { checkPlaintextPasswords } from '../modules/passwordMigration';

export default checkCommand({
  id: COMMAND_MIGRATE_PASSWORDS,

  async handleCommand() {
    const folders = getWorkspaceFolders();
    if (!folders) {
      return;
    }

    // Invoked explicitly, so report even when there's nothing to do — silence
    // would read as "the command didn't work".
    for (const folder of folders) {
      await checkPlaintextPasswords(folder.uri.fsPath, { silent: false });
    }
  },
});
