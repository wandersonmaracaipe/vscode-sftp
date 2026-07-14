// End-to-end tests for SFTPFileSystem against a real in-process ssh2 SFTP
// server (no extra dependency — ssh2 is already a runtime dependency).
const os = require('os');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

const { startSftpServer } = require('./sftpServer');
const upath = require('../../src/core/upath').default;
const SFTPFileSystem = require('../../src/core/fs/sftpFileSystem').default;

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

describe('SFTPFileSystem integration (ssh2)', () => {
  let server;
  let root;
  let remoteFs;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sftp-it-'));
    fs.writeFileSync(path.join(root, 'existing.txt'), 'hello-sftp');

    const started = await startSftpServer(root);
    server = started.server;

    const connectOption = {
      host: '127.0.0.1',
      port: started.port,
      username: 'tester',
      password: 'test',
      protocol: 'sftp',
      connectTimeout: 8000,
      // The test server generates a throwaway host key on every run, so it can
      // never be in known_hosts. Verification is what we want in production, but
      // here there is nothing meaningful to verify against.
      hostKeyChecking: 'off',
    };
    remoteFs = new SFTPFileSystem(upath, {
      clientOption: connectOption,
      remoteTimeOffsetInHours: 0,
    });
    await remoteFs.connect(connectOption, { askForPasswd: () => Promise.resolve('test') });
  });

  afterAll(async () => {
    try {
      if (remoteFs) remoteFs.end();
    } catch (_e) {
      /* ignore */
    }
    try {
      if (server) server.close();
    } catch (_e) {
      /* ignore */
    }
  });

  test('list() returns entries with type and size', async () => {
    const entries = await remoteFs.list('/');
    const existing = entries.find(e => e.name === 'existing.txt');
    expect(existing).toBeTruthy();
    expect(existing.size).toBe('hello-sftp'.length);
  });

  test('put() then get() round-trips content', async () => {
    await remoteFs.put(Readable.from(['uploaded-via-sftp']), '/uploaded.txt');
    expect(fs.readFileSync(path.join(root, 'uploaded.txt'), 'utf8')).toBe('uploaded-via-sftp');

    const stream = await remoteFs.get('/existing.txt');
    expect(await streamToString(stream)).toBe('hello-sftp');
  });

  test('lstat() reports a regular file', async () => {
    const stat = await remoteFs.lstat('/existing.txt');
    expect(stat.size).toBe('hello-sftp'.length);
  });

  test('mkdir(), rename() and unlink()/rmdir()', async () => {
    await remoteFs.mkdir('/sub');
    expect(fs.existsSync(path.join(root, 'sub'))).toBe(true);

    await remoteFs.rename('/uploaded.txt', '/sub/moved.txt');
    expect(fs.existsSync(path.join(root, 'sub', 'moved.txt'))).toBe(true);

    await remoteFs.unlink('/sub/moved.txt');
    await remoteFs.rmdir('/sub', false);
    expect(fs.existsSync(path.join(root, 'sub'))).toBe(false);
  });
});

// The server's key is generated per run, so it stands in for any host that isn't
// in known_hosts yet — exactly the case the verifier has to get right.
describe('SFTP host key verification', () => {
  let server;
  let port;
  let root;
  let knownHostsDir;
  let knownHosts;

  const connectOption = extra => ({
    host: '127.0.0.1',
    port,
    username: 'tester',
    password: 'test',
    protocol: 'sftp',
    connectTimeout: 8000,
    knownHosts,
    ...extra,
  });

  const connect = async (option, config) => {
    const fsys = new SFTPFileSystem(upath, {
      clientOption: option,
      remoteTimeOffsetInHours: 0,
    });
    await fsys.connect(option, { askForPasswd: () => Promise.resolve('test'), ...config });
    return fsys;
  };

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sftp-hk-'));
    const started = await startSftpServer(root);
    server = started.server;
    port = started.port;
  });

  beforeEach(() => {
    knownHostsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sftp-kh-'));
    knownHosts = path.join(knownHostsDir, 'known_hosts');
  });

  afterEach(() => {
    fs.rmSync(knownHostsDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    try {
      server.close();
    } catch (e) {
      // already closed
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('refuses an unknown host when the user declines', async () => {
    await expect(
      connect(connectOption({ hostKeyChecking: 'prompt' }), {
        confirmHostKey: () => Promise.resolve(false),
      })
    ).rejects.toThrow();

    expect(fs.existsSync(knownHosts)).toBe(false);
  });

  test('refuses an unknown host outright in strict mode, without asking', async () => {
    const confirmHostKey = jest.fn(() => Promise.resolve(true));

    await expect(
      connect(connectOption({ hostKeyChecking: 'strict' }), { confirmHostKey })
    ).rejects.toThrow();

    expect(confirmHostKey).not.toHaveBeenCalled();
  });

  test('connects and records the key when the user accepts', async () => {
    const confirmHostKey = jest.fn(() => Promise.resolve(true));
    const fsys = await connect(connectOption({ hostKeyChecking: 'prompt' }), { confirmHostKey });

    expect(confirmHostKey).toHaveBeenCalledTimes(1);
    // The user is shown a fingerprint they can compare against the server's.
    expect(confirmHostKey.mock.calls[0][0].fingerprint).toMatch(/^SHA256:/);
    expect(fs.readFileSync(knownHosts, 'utf8')).toContain('127.0.0.1');

    fsys.end();
  });

  test('a recorded host connects again without asking', async () => {
    await (await connect(connectOption({ hostKeyChecking: 'prompt' }), {
      confirmHostKey: () => Promise.resolve(true),
    })).end();

    const confirmHostKey = jest.fn(() => Promise.resolve(true));
    const fsys = await connect(connectOption({ hostKeyChecking: 'strict' }), { confirmHostKey });

    // Now known, so even strict mode connects and nobody is prompted.
    expect(confirmHostKey).not.toHaveBeenCalled();
    fsys.end();
  });

  test('refuses a host whose recorded key no longer matches', async () => {
    // Record the server's real key first, then tamper with the key material
    // while keeping the host and key type intact. That's the man-in-the-middle
    // shape, and it's why we can't just invent an entry: a key of a type we
    // never recorded is legitimately "unknown", not "changed".
    await (await connect(connectOption({ hostKeyChecking: 'prompt' }), {
      confirmHostKey: () => Promise.resolve(true),
    })).end();

    const [host, keyType, key] = fs
      .readFileSync(knownHosts, 'utf8')
      .trim()
      .split(/\s+/);
    const tampered = Buffer.from(key, 'base64');
    tampered[tampered.length - 1] ^= 0xff;
    fs.writeFileSync(knownHosts, `${host} ${keyType} ${tampered.toString('base64')}\n`);

    const confirmHostKey = jest.fn(() => Promise.resolve(true));
    await expect(
      connect(connectOption({ hostKeyChecking: 'prompt' }), { confirmHostKey })
    ).rejects.toThrow();

    // A changed key is never offered for approval — it is refused outright.
    expect(confirmHostKey).not.toHaveBeenCalled();
  });
});
