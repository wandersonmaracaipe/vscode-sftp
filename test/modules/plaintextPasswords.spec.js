const {
  collectPlaintextPasswords,
  defaultPort,
} = require('../../src/modules/plaintextPasswords');

// secretKeyFor is what the connection looks the password up by. The migration
// has to produce the identical key, or it stores the password somewhere nothing
// ever reads.
const secretKeyFor = identity =>
  `sftp:${identity.username || ''}@${identity.host || ''}:${identity.port || ''}`;

describe('collectPlaintextPasswords', () => {
  test('finds a top-level password', () => {
    const found = collectPlaintextPasswords([
      { host: 'h', port: 22, username: 'u', password: 'secret', protocol: 'sftp' },
    ]);

    expect(found).toHaveLength(1);
    expect(found[0].password).toBe('secret');
    expect(found[0].identity).toEqual({ host: 'h', port: 22, username: 'u' });
  });

  test('defaults the port the same way the connection does', () => {
    // The stored key includes the port, and at connect time the port is already
    // defaulted — so an omitted port must default here too, or the key won't match.
    const [sftp] = collectPlaintextPasswords([
      { host: 'h', username: 'u', password: 'p', protocol: 'sftp' },
    ]);
    const [ftp] = collectPlaintextPasswords([
      { host: 'h', username: 'u', password: 'p', protocol: 'ftp' },
    ]);

    expect(sftp.identity.port).toBe(22);
    expect(ftp.identity.port).toBe(21);
    expect(secretKeyFor(sftp.identity)).toBe('sftp:u@h:22');
    expect(secretKeyFor(ftp.identity)).toBe('sftp:u@h:21');
    expect(defaultPort('ftp')).toBe(21);
    expect(defaultPort(undefined)).toBe(22);
  });

  test('resolves a profile password against its parent', () => {
    const found = collectPlaintextPasswords([
      {
        host: 'base-host',
        username: 'base-user',
        protocol: 'sftp',
        profiles: {
          prod: { password: 'prod-pass' },
          staging: { host: 'staging-host', port: 2222, password: 'staging-pass' },
        },
      },
    ]);

    expect(found).toHaveLength(2);

    const prod = found.find(f => f.password === 'prod-pass');
    // Inherits everything from the parent.
    expect(prod.identity).toEqual({ host: 'base-host', port: 22, username: 'base-user' });

    const staging = found.find(f => f.password === 'staging-pass');
    // Overrides host and port, inherits the username.
    expect(staging.identity).toEqual({
      host: 'staging-host',
      port: 2222,
      username: 'base-user',
    });
  });

  test('walks every config in an array', () => {
    const found = collectPlaintextPasswords([
      { host: 'a', username: 'u', password: 'p1', protocol: 'sftp' },
      { host: 'b', username: 'u', password: 'p2', protocol: 'sftp' },
    ]);
    expect(found.map(f => f.password).sort()).toEqual(['p1', 'p2']);
  });

  test('ignores a config with no password', () => {
    expect(
      collectPlaintextPasswords([
        { host: 'h', username: 'u', protocol: 'sftp' },
        { host: 'h', username: 'u', password: '', protocol: 'sftp' },
        { host: 'h', username: 'u', password: null, protocol: 'sftp' },
      ])
    ).toEqual([]);
  });

  test('skips an entry that has no host or username to key on', () => {
    // Storing under a half-empty identity would be worse than leaving it alone:
    // the plaintext would be deleted and the password unreachable.
    expect(collectPlaintextPasswords([{ password: 'orphan' }])).toEqual([]);
    expect(collectPlaintextPasswords([{ host: 'h', password: 'orphan' }])).toEqual([]);
  });

  test('remove() deletes the password from the parsed config', () => {
    const config = { host: 'h', username: 'u', password: 'p', protocol: 'sftp' };
    const [found] = collectPlaintextPasswords([config]);

    found.remove();

    expect('password' in config).toBe(false);
    expect(config.host).toBe('h'); // nothing else touched
  });

  test('remove() reaches into a profile', () => {
    const config = {
      host: 'h',
      username: 'u',
      protocol: 'sftp',
      profiles: { prod: { password: 'p', remotePath: '/srv' } },
    };
    const [found] = collectPlaintextPasswords([config]);

    found.remove();

    expect('password' in config.profiles.prod).toBe(false);
    expect(config.profiles.prod.remotePath).toBe('/srv');
  });
});
