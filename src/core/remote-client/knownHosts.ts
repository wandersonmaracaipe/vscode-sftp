import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

export enum HostKeyVerdict {
  // The host is listed with exactly this key.
  Known = 'known',
  // The host isn't listed at all — first time connecting.
  Unknown = 'unknown',
  // The host is listed with a DIFFERENT key of the same type. Either the server
  // was rebuilt or someone is impersonating it; never accept this silently.
  Changed = 'changed',
  // The key is explicitly marked @revoked.
  Revoked = 'revoked',
}

interface KnownHostEntry {
  marker?: string;
  hosts: string;
  keyType: string;
  key: string;
}

export function defaultKnownHostsPath(): string {
  return path.join(os.homedir(), '.ssh', 'known_hosts');
}

// OpenSSH writes a bare hostname for port 22 and `[host]:port` for anything
// else — the hashed form hashes that same string, so build it once here.
export function hostAddress(host: string, port: number): string {
  return !port || port === 22 ? host : `[${host}]:${port}`;
}

function parseLine(line: string): KnownHostEntry | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  let fields = trimmed.split(/\s+/);
  let marker;
  if (fields[0].startsWith('@')) {
    marker = fields[0];
    fields = fields.slice(1);
  }

  if (fields.length < 3) {
    return null;
  }

  return { marker, hosts: fields[0], keyType: fields[1], key: fields[2] };
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
}

function hostsFieldMatches(hostsField: string, address: string): boolean {
  // Hashed entry: |1|<base64 salt>|<base64 HMAC-SHA1(salt, address)>
  if (hostsField.startsWith('|1|')) {
    const parts = hostsField.split('|');
    if (parts.length < 4) {
      return false;
    }
    try {
      const salt = Buffer.from(parts[2], 'base64');
      const expected = parts[3];
      const actual = crypto
        .createHmac('sha1', salt)
        .update(address)
        .digest('base64');
      return actual === expected;
    } catch {
      return false;
    }
  }

  return hostsField
    .split(',')
    .some(pattern => (pattern.indexOf('*') !== -1 || pattern.indexOf('?') !== -1
      ? globToRegExp(pattern).test(address)
      : pattern.toLowerCase() === address.toLowerCase()));
}

export function readKnownHosts(knownHostsPath: string): KnownHostEntry[] {
  let content: string;
  try {
    content = fs.readFileSync(knownHostsPath, 'utf8');
  } catch {
    // No known_hosts yet — every host is simply unknown.
    return [];
  }

  return content
    .split(/\r?\n/)
    .map(parseLine)
    .filter((entry): entry is KnownHostEntry => entry !== null);
}

// `key` is the server's public key in SSH wire format, base64-encoded — the same
// encoding known_hosts stores, so they compare directly.
export function verifyHostKey(
  knownHostsPath: string,
  host: string,
  port: number,
  keyType: string,
  key: string
): HostKeyVerdict {
  const address = hostAddress(host, port);
  const entries = readKnownHosts(knownHostsPath).filter(entry =>
    hostsFieldMatches(entry.hosts, address)
  );

  if (entries.some(e => e.marker === '@revoked' && e.key === key)) {
    return HostKeyVerdict.Revoked;
  }

  const usable = entries.filter(e => e.marker !== '@revoked' && e.marker !== '@cert-authority');
  if (usable.some(e => e.keyType === keyType && e.key === key)) {
    return HostKeyVerdict.Known;
  }

  // A different key of the same type is the dangerous case. A key of a type we
  // simply haven't recorded yet (e.g. the host is listed with ssh-rsa and now
  // offers ed25519) is only "unknown", not evidence of tampering.
  if (usable.some(e => e.keyType === keyType)) {
    return HostKeyVerdict.Changed;
  }

  return HostKeyVerdict.Unknown;
}

export interface HostKeyInfo {
  keyType: string;
  key: string;
  fingerprint: string;
}

// ssh2 hands the host key to hostVerifier as a Buffer in SSH wire format:
// uint32 length, then the key-type string, then the key material. known_hosts
// stores that exact blob base64-encoded, so the two compare directly.
export function parseHostKey(blob: Buffer): HostKeyInfo {
  const typeLength = blob.readUInt32BE(0);
  return {
    keyType: blob.slice(4, 4 + typeLength).toString('ascii'),
    key: blob.toString('base64'),
    // Same presentation OpenSSH uses, so users can compare against `ssh-keyscan`.
    fingerprint:
      'SHA256:' +
      crypto
        .createHash('sha256')
        .update(blob)
        .digest('base64')
        .replace(/=+$/, ''),
  };
}

export function addKnownHost(
  knownHostsPath: string,
  host: string,
  port: number,
  keyType: string,
  key: string
): void {
  const line = `${hostAddress(host, port)} ${keyType} ${key}\n`;
  fs.mkdirSync(path.dirname(knownHostsPath), { recursive: true });

  // Don't glue onto a file whose last line has no newline.
  let prefix = '';
  try {
    const existing = fs.readFileSync(knownHostsPath, 'utf8');
    if (existing.length && !existing.endsWith('\n')) {
      prefix = '\n';
    }
  } catch {
    // File doesn't exist yet.
  }

  fs.appendFileSync(knownHostsPath, prefix + line, { mode: 0o600 });
}
