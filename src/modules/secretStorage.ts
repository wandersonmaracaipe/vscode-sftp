import { SecretStorage } from 'vscode';

// Thin wrapper around VS Code's SecretStorage so SFTP/FTP passwords can be kept
// encrypted in the OS keychain instead of in plaintext inside .vscode/sftp.json.

let storage: SecretStorage | undefined;

interface ConnectionIdentity {
  host?: string;
  port?: number;
  username?: string;
}

export function initSecretStorage(secrets: SecretStorage) {
  storage = secrets;
}

export function secretKeyFor(identity: ConnectionIdentity): string {
  return `sftp:${identity.username || ''}@${identity.host || ''}:${identity.port || ''}`;
}

export async function getStoredPassword(
  identity: ConnectionIdentity
): Promise<string | undefined> {
  if (!storage) {
    return undefined;
  }
  return storage.get(secretKeyFor(identity));
}

export async function setStoredPassword(
  identity: ConnectionIdentity,
  password: string
): Promise<void> {
  if (!storage) {
    return;
  }
  await storage.store(secretKeyFor(identity), password);
}

export async function deleteStoredPassword(identity: ConnectionIdentity): Promise<void> {
  if (!storage) {
    return;
  }
  await storage.delete(secretKeyFor(identity));
}
