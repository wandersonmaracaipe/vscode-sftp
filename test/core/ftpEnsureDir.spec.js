// `MKD` on the remote root is answered with "501 No directory name", and that
// error used to abort the whole upload — the walk up the parent chain ran one
// level too far. Auto-upload then failed on every file until the editor was
// restarted, while a manual folder sync (which never took this path) kept
// working.

const upath = require('upath');
const { FileType: FtpFileType } = require('basic-ftp');
const FTPFileSystem = require('../../src/core/fs/ftpFileSystem').default;

function dirEntry(name) {
  return {
    name,
    type: FtpFileType.Directory,
    size: 0,
    modifiedAt: undefined,
    permissions: undefined,
  };
}

// Builds an FTPFileSystem over a fake basic-ftp client that records every
// command it is asked to send.
function makeFs({ listings = [[]], sendError } = {}) {
  const sent = [];
  const queue = listings.slice();
  const ftpClient = {
    async list() {
      return queue.length > 1 ? queue.shift() : queue[0];
    },
    async send(command) {
      sent.push(command);
      if (sendError) {
        throw sendError;
      }
    },
  };

  const fs = new FTPFileSystem(upath, {
    client: {
      getFsClient: () => ftpClient,
      isClosed: () => false,
      end() {},
      onDisconnected() {},
    },
  });

  return { fs, sent };
}

function ftpError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

describe('FTPFileSystem.ensureDir', () => {
  it('never asks the server to create the root', async () => {
    for (const root of ['/', '.', './', '']) {
      const { fs, sent } = makeFs();
      await fs.ensureDir(root);
      expect(sent).toEqual([]);
    }
  });

  it('does not walk past the root when MKD fails', async () => {
    const { fs, sent } = makeFs({
      listings: [[]], // the server never shows the directory
      sendError: ftpError(550, 'Directory already exists'),
    });

    // The original failure is what the user should see...
    await expect(fs.ensureDir('/pasta')).rejects.toThrow('Directory already exists');
    // ...and no bare/root MKD may reach the wire — that is the 501.
    expect(sent).toContain('MKD /pasta');
    expect(sent).not.toContain('MKD /');
    expect(sent).not.toContain('MKD ');
  });

  it('accepts a directory the server reports with an unfamiliar reply code', async () => {
    // First listing hides it, so we try to create it and get a code we don't
    // recognise as "already exists"; the second listing shows it is there.
    const { fs, sent } = makeFs({
      listings: [[], [dirEntry('pasta')]],
      sendError: ftpError(521, 'Directory already exists'),
    });

    await expect(fs.ensureDir('/pasta')).resolves.toBeUndefined();
    expect(sent).not.toContain('MKD /');
  });

  it('creates nothing when the directory is already listed', async () => {
    const { fs, sent } = makeFs({ listings: [[dirEntry('pasta')]] });

    await fs.ensureDir('/pasta');
    expect(sent).toEqual([]);
  });

  it('refuses to send a nameless MKD', async () => {
    const { fs, sent } = makeFs();

    await expect(fs.mkdir('')).rejects.toThrow('não é um nome de diretório válido');
    expect(sent).toEqual([]);
  });
});
