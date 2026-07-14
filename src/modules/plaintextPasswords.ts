// Pure part of the plaintext-password migration: finding every password sitting
// in a config file and working out the identity it must be stored under. Kept
// free of the vscode import so it can be tested directly.

export interface PlaintextPassword {
  // The identity the connection looks the password up by. This MUST match what
  // getStoredPassword() is called with at connect time — defaulted port included
  // — or the migrated password would be written somewhere it is never read from.
  identity: { host: string; port: number; username: string };
  password: string;
  // Deletes the key from the parsed config, once it's safely in the vault.
  remove: () => void;
}

export function defaultPort(protocol?: string): number {
  return protocol === 'ftp' ? 21 : 22;
}

// A config file is either one object or an array of them, and each may carry
// profiles that override the connection fields.
export function collectPlaintextPasswords(configs: any[]): PlaintextPassword[] {
  const found: PlaintextPassword[] = [];

  const consider = (entry: any, base: any) => {
    if (typeof entry.password !== 'string' || !entry.password) {
      return;
    }

    const host = entry.host || base.host;
    const username = entry.username || base.username;
    if (!host || !username) {
      return;
    }

    found.push({
      identity: {
        host,
        username,
        port: entry.port || base.port || defaultPort(entry.protocol || base.protocol),
      },
      password: entry.password,
      remove: () => delete entry.password,
    });
  };

  configs.forEach(config => {
    if (!config || typeof config !== 'object') {
      return;
    }

    consider(config, config);

    const profiles = config.profiles;
    if (profiles && typeof profiles === 'object') {
      // A profile inherits host/port/username from its parent unless it overrides
      // them, so the identity has to be resolved against the parent too.
      Object.keys(profiles).forEach(name => consider(profiles[name], config));
    }
  });

  return found;
}
