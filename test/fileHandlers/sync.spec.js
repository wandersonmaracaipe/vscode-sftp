// Tests for the sync algorithm — the most destructive code in the extension
// (`delete: true` removes files on the far side) and, until now, the least
// covered. Both sides are real directories on disk: the "remote" one is served
// by LocalRemoteFileSystem, so these exercise the actual traversal, comparison
// and deletion logic rather than a mock of it.
const os = require('os');
const path = require('path');
const fs = require('fs');

const { sync, TransferDirection } = require('../../src/fileHandlers/transfer/transfer');
const localFs = require('../../src/core/localFs').default;
const upath = require('../../src/core/upath').default;
const LocalRemoteFileSystem = require('../helper/localRemoteFs').default;

let localDir;
let remoteDir;
let remoteFs;

beforeEach(() => {
  localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-local-'));
  remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-remote-'));
  // The helper serves the "remote" side straight off local disk, so the client
  // is never used — but RemoteFileSystem insists on being given one.
  remoteFs = new LocalRemoteFileSystem(upath, { client: {}, remoteTimeOffsetInHours: 0 });
});

afterEach(() => {
  fs.rmSync(localDir, { recursive: true, force: true });
  fs.rmSync(remoteDir, { recursive: true, force: true });
});

function write(root, relPath, content, mtime) {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  if (mtime) {
    fs.utimesSync(full, mtime, mtime);
  }
  return full;
}

function exists(root, relPath) {
  return fs.existsSync(path.join(root, relPath));
}

// Runs sync and returns what it *planned*, without executing transfers: the
// collect callback is where tasks are handed to the scheduler, so capturing it
// shows the decisions. Deletions are NOT deferred this way — sync performs them
// itself and returns what it removed, which is exactly why they need testing.
async function runSync(option = {}) {
  const collected = [];
  const deleted = await sync(
    {
      srcFsPath: localDir,
      targetFsPath: remoteDir,
      srcFs: localFs,
      targetFs: remoteFs,
      transferDirection: TransferDirection.LOCAL_TO_REMOTE,
      transferOption: { perserveTargetMode: false, ...option },
    },
    task => collected.push(task)
  );
  return {
    deleted: deleted.map(d => d.fspath || d.name),
    transferred: collected.map(t => path.relative(localDir, t.srcFsPath).replace(/\\/g, '/')),
  };
}

describe('sync: what gets transferred', () => {
  test('queues a file that exists only on the source', async () => {
    write(localDir, 'new.txt', 'hello');

    const { transferred } = await runSync();

    expect(transferred).toContain('new.txt');
  });

  test('walks into subdirectories', async () => {
    write(localDir, 'a/b/deep.txt', 'deep');

    const { transferred } = await runSync();

    expect(transferred).toContain('a/b/deep.txt');
  });

  test('skips a file that is identical on both sides', async () => {
    const when = new Date('2024-01-01T00:00:00Z');
    write(localDir, 'same.txt', 'identical', when);
    write(remoteDir, 'same.txt', 'identical', when);

    const { transferred } = await runSync();

    expect(transferred).not.toContain('same.txt');
  });

  test('queues a file whose content differs', async () => {
    const when = new Date('2024-01-01T00:00:00Z');
    write(localDir, 'changed.txt', 'aaaa', when);
    write(remoteDir, 'changed.txt', 'bb', when); // different size

    const { transferred } = await runSync();

    expect(transferred).toContain('changed.txt');
  });

  test('skipCreate leaves files missing on the target alone', async () => {
    write(localDir, 'brand-new.txt', 'x');

    const { transferred } = await runSync({ skipCreate: true });

    expect(transferred).not.toContain('brand-new.txt');
  });

  test('ignoreExisting leaves files already on the target alone', async () => {
    write(localDir, 'present.txt', 'new content');
    write(remoteDir, 'present.txt', 'old');

    const { transferred } = await runSync({ ignoreExisting: true });

    expect(transferred).not.toContain('present.txt');
  });
});

describe('sync: deletion (delete: true)', () => {
  test('does NOT delete anything unless asked', async () => {
    write(remoteDir, 'only-remote.txt', 'keep me');

    const { deleted } = await runSync();

    expect(deleted).toEqual([]);
    expect(exists(remoteDir, 'only-remote.txt')).toBe(true);
  });

  test('deletes a target file with no source counterpart', async () => {
    write(localDir, 'keep.txt', 'keep');
    write(remoteDir, 'keep.txt', 'keep');
    write(remoteDir, 'extraneous.txt', 'delete me');

    await runSync({ delete: true });

    expect(exists(remoteDir, 'extraneous.txt')).toBe(false);
    expect(exists(remoteDir, 'keep.txt')).toBe(true);
  });

  test('deletes an extraneous directory and its contents', async () => {
    write(remoteDir, 'stale/nested/file.txt', 'gone');

    await runSync({ delete: true });

    expect(exists(remoteDir, 'stale')).toBe(false);
  });

  test('an ignored target file is NOT deleted', async () => {
    // The dangerous case: `ignore` means "this file is none of sync's
    // business". Deleting it would destroy remote-only data the user
    // deliberately excluded — .env or an upload directory, say.
    write(remoteDir, 'keep.env', 'SECRET=1');
    write(remoteDir, 'go.txt', 'expendable');

    const ignore = fsPath => path.basename(fsPath) === 'keep.env';
    await runSync({ delete: true, ignore });

    expect(exists(remoteDir, 'keep.env')).toBe(true);
    expect(exists(remoteDir, 'go.txt')).toBe(false);
  });

  test('does not resolve until the removals have actually finished', async () => {
    // Regression: the removals were fired with forEach and their promises
    // dropped, so sync() resolved while deletion was still running — the UI
    // reported "done" over work still in flight, and any failure became an
    // unhandled rejection nobody saw. A recursive directory removal is slow
    // enough to expose it; a single file usually finished in time to hide it.
    write(remoteDir, 'gone-a/deep/one.txt', 'x');
    write(remoteDir, 'gone-b/deep/two.txt', 'x');
    write(remoteDir, 'gone-c.txt', 'x');

    await runSync({ delete: true });

    // Checked immediately after the await, with no extra tick to let stragglers land.
    expect(exists(remoteDir, 'gone-a')).toBe(false);
    expect(exists(remoteDir, 'gone-b')).toBe(false);
    expect(exists(remoteDir, 'gone-c.txt')).toBe(false);
  });

  test('reports what it deleted', async () => {
    write(remoteDir, 'reported.txt', 'x');

    const { deleted } = await runSync({ delete: true });

    expect(deleted.some(d => String(d).includes('reported.txt'))).toBe(true);
  });
});

describe('sync: ignore', () => {
  test('an ignored source file is not transferred', async () => {
    write(localDir, 'secret.key', 'nope');
    write(localDir, 'public.txt', 'yes');

    const ignore = fsPath => path.basename(fsPath) === 'secret.key';
    const { transferred } = await runSync({ ignore });

    expect(transferred).not.toContain('secret.key');
    expect(transferred).toContain('public.txt');
  });

  test('an ignored directory is not descended into', async () => {
    write(localDir, 'node_modules/pkg/index.js', 'junk');
    write(localDir, 'src/app.js', 'real');

    const ignore = fsPath => fsPath.split(/[\\/]/).includes('node_modules');
    const { transferred } = await runSync({ ignore });

    expect(transferred).toEqual(['src/app.js']);
  });
});
