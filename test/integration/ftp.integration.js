// End-to-end tests for FTPFileSystem (basic-ftp based) against a real in-process
// FTP server. Requires the optional dev dependency `ftp-srv`:
//   npm i --no-save ftp-srv
// The suite self-skips when it isn't installed.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

let FtpSrv;
try {
  FtpSrv = require('ftp-srv');
} catch (_e) {
  FtpSrv = null;
}

const upath = require('../../src/core/upath').default;
const FTPFileSystem = require('../../src/core/fs/ftpFileSystem').default;

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

const suite = FtpSrv ? describe : describe.skip;

suite('FTPFileSystem integration (basic-ftp)', () => {
  const PORT = 21801;
  let server;
  let root;
  let remoteFs;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-it-'));
    fs.writeFileSync(path.join(root, 'existing.txt'), 'hello');

    server = new FtpSrv({
      url: `ftp://127.0.0.1:${PORT}`,
      anonymous: true,
      pasv_url: '127.0.0.1',
    });
    server.on('login', (_data, resolve) => resolve({ root }));
    await server.listen();

    const connectOption = {
      host: '127.0.0.1',
      port: PORT,
      username: 'anonymous',
      password: 'test',
      protocol: 'ftp',
      connectTimeout: 8000,
    };
    remoteFs = new FTPFileSystem(upath, {
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
      if (server) await server.close();
    } catch (_e) {
      /* ignore */
    }
  });

  test('list() returns entries with type and size', async () => {
    const entries = await remoteFs.list('/');
    const existing = entries.find(e => e.name === 'existing.txt');
    expect(existing).toBeTruthy();
    expect(existing.size).toBe('hello'.length);
  });

  test('put() then get() round-trips content', async () => {
    await remoteFs.put(Readable.from(['uploaded-via-ftp']), '/uploaded.txt');
    expect(fs.readFileSync(path.join(root, 'uploaded.txt'), 'utf8')).toBe('uploaded-via-ftp');

    const stream = await remoteFs.get('/existing.txt');
    expect(await streamToString(stream)).toBe('hello');
  });

  test('mkdir(), rename() and unlink()/rmdir()', async () => {
    await remoteFs.mkdir('/sub');
    expect(fs.existsSync(path.join(root, 'sub'))).toBe(true);

    await remoteFs.rename('/uploaded.txt', '/sub/moved.txt');
    expect(fs.existsSync(path.join(root, 'sub', 'moved.txt'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'uploaded.txt'))).toBe(false);

    await remoteFs.unlink('/sub/moved.txt');
    expect(fs.existsSync(path.join(root, 'sub', 'moved.txt'))).toBe(false);

    await remoteFs.rmdir('/sub', false);
    expect(fs.existsSync(path.join(root, 'sub'))).toBe(false);
  });

  test('ensureDir() creates nested directories', async () => {
    await remoteFs.ensureDir('/a/b/c');
    expect(fs.existsSync(path.join(root, 'a', 'b', 'c'))).toBe(true);
  });
});
