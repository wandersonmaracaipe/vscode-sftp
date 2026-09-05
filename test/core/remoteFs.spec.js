// Regression tests for the connection pool. Every failure mode here has the
// same user-visible shape: one error and the extension stops transferring
// until the window is reloaded. They are cheap to re-break, so they are
// pinned down individually.

const fsModulePath = '../../src/core/fs';

class FakeRemoteFs {
  constructor() {
    FakeRemoteFs.instances.push(this);
    this.closed = false;
    this.ended = false;
    this._disconnectHandlers = [];
    const connect = FakeRemoteFs.connects.shift();
    this._connect = connect || (() => Promise.resolve());
  }

  connect() {
    return this._connect(this);
  }

  onDisconnected(cb) {
    this._disconnectHandlers.push(cb);
  }

  isClosed() {
    return this.closed;
  }

  end() {
    this.ended = true;
    this.closed = true;
  }

  // Simulates the client reporting the link went away.
  fireDisconnect(reason) {
    this.closed = true;
    this._disconnectHandlers.forEach(cb => cb(reason));
  }
}

FakeRemoteFs.instances = [];
FakeRemoteFs.connects = [];

jest.mock(fsModulePath, () => {
  const actual = jest.requireActual('../../src/core/fs');
  return {
    ...actual,
    SFTPFileSystem: FakeRemoteFs,
    FTPFileSystem: FakeRemoteFs,
  };
});

const { createRemoteIfNoneExist, removeAllRemoteFs } = require('../../src/core/remoteFs');

const OPTION = {
  protocol: 'sftp',
  host: 'example.test',
  port: 22,
  username: 'user',
  password: 'pw',
  connectTimeout: 1000,
  remoteTimeOffsetInHours: 0,
};

// max(connectTimeout, 10s) + 30s, per src/core/remoteFs.ts
const WATCHDOG_MS = 40 * 1000;

function connectOption() {
  // A fresh object each time, with the same values: the pool keys on the
  // values, so every call in a test lands on the same pool entry.
  return { ...OPTION };
}

describe('remoteFs pool', () => {
  beforeEach(() => {
    FakeRemoteFs.instances = [];
    FakeRemoteFs.connects = [];
  });

  afterEach(() => {
    removeAllRemoteFs();
    jest.useRealTimers();
  });

  it('retries the connect after a failure instead of replaying the old error', async () => {
    FakeRemoteFs.connects = [
      () => Promise.reject(new Error('permission denied')),
      () => Promise.resolve(),
    ];

    await expect(createRemoteIfNoneExist(connectOption())).rejects.toThrow('permission denied');

    // The pool must not still be parked on the rejected attempt.
    const fs = await createRemoteIfNoneExist(connectOption());
    expect(fs).toBe(FakeRemoteFs.instances[1]);
  });

  it('gives up on a connect that never settles, and works again afterwards', async () => {
    jest.useFakeTimers();
    FakeRemoteFs.connects = [
      () => new Promise(() => {}), // a prompt nobody answers: never resolves
      () => Promise.resolve(),
    ];

    const stuck = createRemoteIfNoneExist(connectOption());
    const assertion = expect(stuck).rejects.toThrow(/sem resposta/);
    jest.advanceTimersByTime(WATCHDOG_MS + 1);
    await assertion;

    jest.useRealTimers();
    const fs = await createRemoteIfNoneExist(connectOption());
    expect(fs).toBe(FakeRemoteFs.instances[1]);
  });

  it('shares one connect between concurrent callers', async () => {
    let release;
    FakeRemoteFs.connects = [() => new Promise(resolve => (release = resolve))];

    const first = createRemoteIfNoneExist(connectOption());
    const second = createRemoteIfNoneExist(connectOption());
    release();

    expect(await first).toBe(await second);
    expect(FakeRemoteFs.instances).toHaveLength(1);
  });

  it('replaces a connection the server closed', async () => {
    FakeRemoteFs.connects = [() => Promise.resolve(), () => Promise.resolve()];

    const first = await createRemoteIfNoneExist(connectOption());
    first.closed = true; // died without ever telling us

    const second = await createRemoteIfNoneExist(connectOption());
    expect(second).not.toBe(first);
    expect(second).toBe(FakeRemoteFs.instances[1]);
  });

  it('does not let a dead connection tear down the one that replaced it', async () => {
    FakeRemoteFs.connects = [() => Promise.resolve(), () => Promise.resolve()];

    const first = await createRemoteIfNoneExist(connectOption());
    first.fireDisconnect('close');

    const second = await createRemoteIfNoneExist(connectOption());
    expect(second).not.toBe(first);

    // A late (or duplicated) event from the old connection used to end the new
    // one, dropping a live connection the moment it was established.
    first.fireDisconnect('close');
    expect(second.ended).toBe(false);
    expect(await createRemoteIfNoneExist(connectOption())).toBe(second);
  });
});
