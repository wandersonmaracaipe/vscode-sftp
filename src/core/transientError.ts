import { ErrorCode } from './remote-client/remoteClient';

// Network-level codes that mean "the link failed", not "the request was wrong".
const TRANSIENT_CODES = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'EAI_AGAIN',
  'ECONNABORTED',
];

// Checked before the transient patterns: a wrong password or a missing file
// fails identically on every attempt, and cancelling is the user's decision.
const PERMANENT_PATTERN = /authentication|password|permission denied|all configured|no such file|not a directory|cancel|abort/i;

// Both the "link dropped" errors and the follow-up errors a dead client emits
// for every subsequent request ("Client is closed" from basic-ftp, "Not
// connected" from ssh2) — those are exactly the cascade we want to retry, since
// re-resolving the file system reconnects.
const TRANSIENT_PATTERN = /timeout|socket hang up|econnreset|network|reset by peer|client is closed|not connected|connection closed|socket closed|no response from server|channel open failure/i;

// Whether an operation is worth retrying against a freshly resolved connection.
// Errs on the side of NOT retrying: a retried permanent failure just doubles the
// time before the user sees the real error.
export function isTransientError(err: any): boolean {
  if (!err) {
    return false;
  }

  if (err.code === ErrorCode.CONNECT_CANCELLED) {
    return false;
  }

  const message = String(err.message || '');
  if (PERMANENT_PATTERN.test(message)) {
    return false;
  }

  const code = typeof err.code === 'string' ? err.code : '';
  if (TRANSIENT_CODES.indexOf(code) !== -1) {
    return true;
  }

  return TRANSIENT_PATTERN.test(message);
}
