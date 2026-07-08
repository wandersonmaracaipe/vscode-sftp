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
