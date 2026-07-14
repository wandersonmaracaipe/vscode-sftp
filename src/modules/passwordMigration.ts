import * as vscode from 'vscode';
import * as path from 'path';
import * as fse from 'fs-extra';
import { CONFIG_PATH } from '../constants';
import logger from '../logger';
import { setStoredPassword } from './secretStorage';
import { collectPlaintextPasswords as collect } from './plaintextPasswords';

const DISMISSED_KEY = 'sftp.plaintextPasswordPromptDismissed';

// Held here (like secretStorage does) because auto-registered commands don't get
// the ExtensionContext handed to them.
let extensionContext: vscode.ExtensionContext | undefined;

export function initPasswordMigration(context: vscode.ExtensionContext) {
  extensionContext = context;
}

async function migrate(configPath: string): Promise<number> {
  const raw = await fse.readJson(configPath);
  const configs = Array.isArray(raw) ? raw : [raw];
  const passwords = collect(configs);

  if (!passwords.length) {
    return 0;
  }

  for (const entry of passwords) {
    await setStoredPassword(entry.identity, entry.password);
    entry.remove();
  }

  // Only rewrite the file once every password is safely in the vault — losing
  // the plaintext without having stored it would lock the user out.
  await fse.writeJson(configPath, raw, { spaces: 2 });
  return passwords.length;
}

export async function checkPlaintextPasswords(
  workspace: string,
  { silent = true }: { silent?: boolean } = {}
): Promise<void> {
  const configPath = path.join(workspace, CONFIG_PATH);

  let configs: any[];
  try {
    const raw = await fse.readJson(configPath);
    configs = Array.isArray(raw) ? raw : [raw];
  } catch {
    return; // no config, or not readable — nothing to migrate
  }

  const passwords = collect(configs);
  if (!passwords.length) {
    if (!silent) {
      vscode.window.showInformationMessage(
        'Nenhuma senha em texto plano encontrada no sftp.json.'
      );
    }
    return;
  }

  if (silent && extensionContext && extensionContext.workspaceState.get(DISMISSED_KEY)) {
    return;
  }

  const count = passwords.length;
  const MOVE = 'Mover para o cofre';
  const LATER = 'Agora não';
  const NEVER = 'Não perguntar mais';

  const choice = await vscode.window.showWarningMessage(
    count > 1
      ? `${count} senhas estão em texto plano no sftp.json.`
      : 'Há uma senha em texto plano no sftp.json.',
    { modal: false },
    MOVE,
    LATER,
    ...(silent ? [NEVER] : [])
  );

  if (choice === NEVER) {
    if (extensionContext) {
      await extensionContext.workspaceState.update(DISMISSED_KEY, true);
    }
    return;
  }

  if (choice !== MOVE) {
    return;
  }

  try {
    const moved = await migrate(configPath);
    vscode.window.showInformationMessage(
      moved > 1
        ? `${moved} senhas movidas para o cofre e removidas do sftp.json.`
        : 'Senha movida para o cofre e removida do sftp.json.'
    );
  } catch (error) {
    logger.error(error, 'migrate plaintext passwords');
    vscode.window.showErrorMessage(
      `Não foi possível migrar as senhas: ${error && error.message}`
    );
  }
}
