const { isTransientError } = require('../../src/core/transientError');

describe('isTransientError', () => {
  test('retries network-level failures', () => {
    ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'EAI_AGAIN', 'ECONNABORTED'].forEach(
      code => {
        expect(isTransientError({ code, message: 'socket failure' })).toBe(true);
      }
    );
  });

  test('retries the dead-client cascade', () => {
    // These are the follow-up errors every queued file gets once the underlying
    // client dies — re-resolving the file system reconnects, so they must retry.
    expect(isTransientError(new Error('Client is closed'))).toBe(true);
    expect(isTransientError(new Error('Not connected'))).toBe(true);
    expect(isTransientError(new Error('No response from server'))).toBe(true);
    expect(isTransientError(new Error('read ECONNRESET'))).toBe(true);
    expect(isTransientError(new Error('Timeout while waiting for handshake'))).toBe(true);
  });

  test('never retries authentication failures', () => {
    expect(isTransientError(new Error('All configured authentication methods failed'))).toBe(false);
    expect(isTransientError(new Error('Authentication failure'))).toBe(false);
    expect(isTransientError(new Error('Wrong password'))).toBe(false);
    expect(isTransientError(new Error('Permission denied (publickey)'))).toBe(false);
  });

  test('never retries a missing file', () => {
    // A vanished source file fails identically on every attempt.
    expect(isTransientError({ code: 'ENOENT', message: 'no such file or directory' })).toBe(false);
  });

  test('never retries a cancellation', () => {
    expect(isTransientError(new Error('Transfer cancelled by the user'))).toBe(false);
    expect(isTransientError(new Error('aborted'))).toBe(false);
  });

  test('a permanent message wins over a transient code', () => {
    // ssh2 reports auth failures with a socket-ish code attached; the message is
    // the reliable signal, so it must be checked first.
    expect(
      isTransientError({ code: 'ECONNRESET', message: 'All configured authentication methods failed' })
    ).toBe(false);
  });

  test('does not retry an unknown error', () => {
    expect(isTransientError(new Error('EISDIR: illegal operation on a directory'))).toBe(false);
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });
});
