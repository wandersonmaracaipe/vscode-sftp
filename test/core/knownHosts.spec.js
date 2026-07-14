const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  HostKeyVerdict,
  verifyHostKey,
  addKnownHost,
  parseHostKey,
  hostAddress,
} = require('../../src/core/remote-client/knownHosts');

// A real ed25519 host key blob: uint32 type length, type, uint32 key length, key.
function makeKeyBlob(keyType, seed) {
  const type = Buffer.from(keyType, 'ascii');
  const key = Buffer.alloc(32, seed);
  const blob = Buffer.alloc(4 + type.length + 4 + key.length);
  blob.writeUInt32BE(type.length, 0);
  type.copy(blob, 4);
  blob.writeUInt32BE(key.length, 4 + type.length);
  key.copy(blob, 8 + type.length);
  return blob;
}

const KEY_A = makeKeyBlob('ssh-ed25519', 0xaa).toString('base64');
const KEY_B = makeKeyBlob('ssh-ed25519', 0xbb).toString('base64');

let dir;
let file;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'known-hosts-'));
  file = path.join(dir, 'known_hosts');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(content) {
  fs.writeFileSync(file, content);
}

describe('hostAddress', () => {
  test('bare hostname on port 22, [host]:port otherwise', () => {
    expect(hostAddress('example.com', 22)).toBe('example.com');
    expect(hostAddress('example.com', 2222)).toBe('[example.com]:2222');
  });
});

describe('verifyHostKey', () => {
  test('a recorded key is known', () => {
    write(`example.com ssh-ed25519 ${KEY_A}\n`);
    expect(verifyHostKey(file, 'example.com', 22, 'ssh-ed25519', KEY_A)).toBe(HostKeyVerdict.Known);
  });

  test('a host that is not listed is unknown', () => {
    write(`other.com ssh-ed25519 ${KEY_A}\n`);
    expect(verifyHostKey(file, 'example.com', 22, 'ssh-ed25519', KEY_A)).toBe(
      HostKeyVerdict.Unknown
    );
  });

  test('a missing known_hosts file makes every host unknown', () => {
    expect(verifyHostKey(file, 'example.com', 22, 'ssh-ed25519', KEY_A)).toBe(
      HostKeyVerdict.Unknown
    );
  });

  test('a DIFFERENT key of the same type is a changed key, not an unknown one', () => {
    // This is the man-in-the-middle shape — it must never be reported as merely
    // unknown, because unknown gets offered to the user for approval.
    write(`example.com ssh-ed25519 ${KEY_A}\n`);
    expect(verifyHostKey(file, 'example.com', 22, 'ssh-ed25519', KEY_B)).toBe(
      HostKeyVerdict.Changed
    );
  });

  test('a key type we never recorded is unknown, not changed', () => {
    // The host is listed with rsa and now offers ed25519: no evidence of
    // tampering, so the user should get the normal first-time prompt.
    write(`example.com ssh-rsa ${KEY_A}\n`);
    expect(verifyHostKey(file, 'example.com', 22, 'ssh-ed25519', KEY_B)).toBe(
      HostKeyVerdict.Unknown
    );
  });

  test('a non-standard port is matched as [host]:port', () => {
    write(`[example.com]:2222 ssh-ed25519 ${KEY_A}\n`);
    expect(verifyHostKey(file, 'example.com', 2222, 'ssh-ed25519', KEY_A)).toBe(
      HostKeyVerdict.Known
    );
    // The same key on the default port is a different entry entirely.
    expect(verifyHostKey(file, 'example.com', 22, 'ssh-ed25519', KEY_A)).toBe(
      HostKeyVerdict.Unknown
    );
  });

  test('matches a hashed host entry', () => {
    const salt = crypto.randomBytes(20);
    const hash = crypto
      .createHmac('sha1', salt)
      .update('example.com')
      .digest('base64');
    write(`|1|${salt.toString('base64')}|${hash} ssh-ed25519 ${KEY_A}\n`);

    expect(verifyHostKey(file, 'example.com', 22, 'ssh-ed25519', KEY_A)).toBe(HostKeyVerdict.Known);
    expect(verifyHostKey(file, 'other.com', 22, 'ssh-ed25519', KEY_A)).toBe(HostKeyVerdict.Unknown);
  });

  test('matches one host among several on a line', () => {
    write(`alias.com,example.com,10.0.0.1 ssh-ed25519 ${KEY_A}\n`);
    expect(verifyHostKey(file, 'example.com', 22, 'ssh-ed25519', KEY_A)).toBe(HostKeyVerdict.Known);
  });

  test('honours a @revoked marker', () => {
    write(`@revoked example.com ssh-ed25519 ${KEY_A}\n`);
    expect(verifyHostKey(file, 'example.com', 22, 'ssh-ed25519', KEY_A)).toBe(
      HostKeyVerdict.Revoked
    );
  });

  test('ignores comments and blank lines', () => {
    write(`# a comment\n\n   \nexample.com ssh-ed25519 ${KEY_A}\n`);
    expect(verifyHostKey(file, 'example.com', 22, 'ssh-ed25519', KEY_A)).toBe(HostKeyVerdict.Known);
  });
});

describe('addKnownHost', () => {
  test('appends a key that then verifies as known', () => {
    addKnownHost(file, 'example.com', 22, 'ssh-ed25519', KEY_A);
    expect(verifyHostKey(file, 'example.com', 22, 'ssh-ed25519', KEY_A)).toBe(HostKeyVerdict.Known);
  });

  test('does not glue onto a file whose last line has no newline', () => {
    write(`other.com ssh-ed25519 ${KEY_B}`); // no trailing newline
    addKnownHost(file, 'example.com', 22, 'ssh-ed25519', KEY_A);

    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(verifyHostKey(file, 'example.com', 22, 'ssh-ed25519', KEY_A)).toBe(HostKeyVerdict.Known);
    expect(verifyHostKey(file, 'other.com', 22, 'ssh-ed25519', KEY_B)).toBe(HostKeyVerdict.Known);
  });

  test('creates the .ssh directory when it does not exist', () => {
    const nested = path.join(dir, '.ssh', 'known_hosts');
    addKnownHost(nested, 'example.com', 2222, 'ssh-ed25519', KEY_A);
    expect(verifyHostKey(nested, 'example.com', 2222, 'ssh-ed25519', KEY_A)).toBe(
      HostKeyVerdict.Known
    );
  });
});

describe('parseHostKey', () => {
  test('extracts the key type, the base64 blob and an OpenSSH-style fingerprint', () => {
    const blob = makeKeyBlob('ssh-ed25519', 0xaa);
    const info = parseHostKey(blob);

    expect(info.keyType).toBe('ssh-ed25519');
    // known_hosts stores exactly this blob, base64-encoded.
    expect(info.key).toBe(KEY_A);
    expect(info.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
    expect(info.fingerprint).not.toContain('=');
  });

  test('the parsed key round-trips through verifyHostKey', () => {
    const blob = makeKeyBlob('ssh-rsa', 0x11);
    const { keyType, key } = parseHostKey(blob);
    addKnownHost(file, 'example.com', 22, keyType, key);
    expect(verifyHostKey(file, 'example.com', 22, keyType, key)).toBe(HostKeyVerdict.Known);
  });
});
