import upath from './upath';
import { promptForPassword, showConfirmWarning } from '../host';
import logger from '../logger';
import app from '../app';
import StatusBarItem from '../ui/statusBarItem';
import { getStoredPassword, getStoredPassphrase } from '../modules/secretStorage';
import { isTransientError } from './transientError';
import { ConnectOption, HostKeyPrompt } from './remote-client/remoteClient';
import {
  FileSystem,
  RemoteFileSystem,
  SFTPFileSystem,
  FTPFileSystem,
} from './fs';
import localFs from './localFs';

const MAX_CONNECT_ATTEMPTS = 3; // 1 tentativa inicial + 2 novas tentativas
const RECONNECT_DELAY_MS = 1000;

// Hard ceiling for a single connect attempt, on top of the configured
// connectTimeout. It only fires when the client itself failed to enforce its
// own timeout — a handshake stuck forever, or a credential/host-key prompt the
// user never answers. Without it that attempt never settles, and because every
// caller waits on the same pending connect the extension goes quiet: uploads,
// saves and syncs all hang with no error until the window is reloaded.
const CONNECT_WATCHDOG_EXTRA_MS = 30 * 1000;

const WATCHDOG_MESSAGE_MARK = 'conexão sem resposta';

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    const clear = () => clearTimeout(timer);
    promise.then(
      value => {
        clear();
        resolve(value);
      },
      error => {
        clear();
        reject(error);
      }
    );
  });
}

function hashOption(opiton) {
  return Object.keys(opiton)
    .map(key => opiton[key])
    .join('');
}

class KeepAliveRemoteFs {
  private isValid: boolean = false;

  private pendingPromise: Promise<RemoteFileSystem> | null = null;

  private fs: RemoteFileSystem | undefined;

  async getFs(
    option: ConnectOption & {
      protocol: string;
      remoteTimeOffsetInHours: number;
    }
  ): Promise<RemoteFileSystem> {
    // Don't trust `isValid` alone: it's only cleared by a disconnect event, and
    // those aren't guaranteed to arrive (basic-ftp strips the socket listeners
    // before destroying it). Ask the client whether it's actually usable, so a
    // dead connection is replaced instead of served forever.
    if (this.isValid && (!this.fs || this.fs.isClosed())) {
      logger.info('a conexão foi encerrada pelo servidor; reconectando…');
      this.invalidate('closed');
    }

    if (this.isValid) {
      return Promise.resolve(this.fs!);
    }

    // Only a connect that is still running may be shared. `pendingPromise` is
    // cleared the moment the attempt settles (see below), so a finished one —
    // resolved with a connection that has since died, or rejected with an old
    // error — is never handed out again.
    if (this.pendingPromise) {
      return this.pendingPromise;
    }

    const connectOption = Object.assign({}, option);
    // tslint:disable variable-name
    let FsConstructor: typeof SFTPFileSystem | typeof FTPFileSystem;
    if (option.protocol === 'sftp') {
      connectOption.debug = function debug(str) {
        const log = str.match(/^DEBUG(?:\[SFTP\])?: (.*?): (.*?)$/);

        if (log) {
          if (log[1] === 'Parser') return;
          logger.debug(`${log[1]}: ${log[2]}`);
        } else {
          logger.debug(str);
        }
      };
      FsConstructor = SFTPFileSystem;
    } else if (option.protocol === 'ftp') {
      connectOption.debug = function debug(str) {
        const log = str.match(/^\[connection\] (>|<) (.*?)(\\r\\n)?$/);

        if (!log) return;

        if (log[2].match(/200 NOOP/)) return;

        if (log[2].match(/^PASS /)) log[2] = 'PASS ******';

        logger.debug(`${log[1]} ${log[2]}`);
      };
      FsConstructor = FTPFileSystem;
    } else {
      throw new Error(`Protocolo não suportado: ${option.protocol}`);
    }

    app.sftpBarItem.showMsg('conectando...', connectOption.connectTimeout);

    // Built before the assignment so a synchronous throw can't leave
    // `pendingPromise` holding a rejected promise that nobody ever clears.
    const connecting = this._connect(FsConstructor, connectOption, option);
    this.pendingPromise = connecting;
    const release = () => {
      if (this.pendingPromise === connecting) {
        this.pendingPromise = null;
      }
    };
    // Both branches release: a failed connect must not park the pool on an old
    // error, and a successful one is served from `isValid`/`this.fs` afterwards.
    connecting.then(release, release);

    return connecting;
  }

  private async _connect(
    FsConstructor: typeof SFTPFileSystem | typeof FTPFileSystem,
    connectOption: ConnectOption,
    option: { remoteTimeOffsetInHours: number }
  ): Promise<RemoteFileSystem> {
    // Prefer a password saved in the OS keychain; fall back to prompting.
    const askForPasswd = async (msg: string) => {
      const saved = await getStoredPassword(connectOption);
      if (saved !== undefined) {
        return saved;
      }
      return promptForPassword(msg);
    };

    // The private key's passphrase lives under its own vault key, so a saved
    // account password can't be handed back in its place.
    const askForPassphrase = async (msg: string) => {
      const saved = await getStoredPassphrase(connectOption);
      if (saved !== undefined) {
        return saved;
      }
      return promptForPassword(msg);
    };

    // Only reached for a host we've never recorded — a key that changed is
    // refused outright by the client, never offered for approval here.
    const confirmHostKey = (prompt: HostKeyPrompt) =>
      showConfirmWarning(
        `O servidor ${prompt.host} não é conhecido. Deseja confiar nele?`,
        `Impressão digital da chave (${prompt.keyType}):\n${prompt.fingerprint}\n\n` +
          `Confirme que ela corresponde à chave do servidor antes de aceitar. ` +
          `Ao aceitar, a chave será registrada em known_hosts e não será perguntado novamente.`,
        'Confiar e conectar'
      );

    const watchdogMs =
      Math.max(connectOption.connectTimeout || 0, 10 * 1000) + CONNECT_WATCHDOG_EXTRA_MS;

    let lastError;
    for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
      // A fresh client per attempt. The handler is bound to the connection it
      // belongs to: a 'close' from an attempt that already failed used to
      // arrive late and tear down the connection that replaced it — a live
      // connection dropped the instant it was established.
      const fs = new FsConstructor(upath, {
        clientOption: connectOption,
        remoteTimeOffsetInHours: option.remoteTimeOffsetInHours,
      });
      fs.onDisconnected((reason: string) => this.invalidate(reason, fs));
      this.fs = fs;

      try {
        await withTimeout(
          fs.connect(connectOption, {
            askForPasswd,
            askForPassphrase,
            confirmHostKey,
          }),
          watchdogMs,
          `[${connectOption.host}]: ${WATCHDOG_MESSAGE_MARK} após ${Math.round(
            watchdogMs / 1000
          )}s. Se houver um pedido de senha/passphrase aberto, responda-o e tente novamente.`
        );
        this.isValid = true;
        app.sftpBarItem.updateStatus(StatusBarItem.Status.ok);
        app.sftpBarItem.reset();
        return fs;
      } catch (err) {
        lastError = err;
        try {
          fs.end();
        } catch {
          // ignore teardown errors
        }

        // A watchdog hit means the attempt is stuck, not that the link
        // flickered — retrying would just re-open the same prompt and stall
        // again. Report it instead, leaving the pool free for the next call.
        const stuck = err && String(err.message || '').indexOf(WATCHDOG_MESSAGE_MARK) !== -1;
        if (stuck || attempt >= MAX_CONNECT_ATTEMPTS || !isTransientError(err)) {
          break;
        }

        logger.warn(
          `Falha ao conectar (tentativa ${attempt}/${MAX_CONNECT_ATTEMPTS}): ` +
            `${err && err.message}. Tentando novamente…`
        );
        app.sftpBarItem.showMsg('reconectando…', connectOption.connectTimeout);
        await delay(RECONNECT_DELAY_MS);
      }
    }

    this.isValid = false;
    app.sftpBarItem.updateStatus(StatusBarItem.Status.error);
    throw lastError;
  }

  // Drops the pooled connection so the next request builds a new one. `source`
  // identifies the connection a disconnect handler belongs to; an event from a
  // connection we have already replaced must not touch the current one.
  invalidate(reason: string, source?: RemoteFileSystem) {
    if (source && source !== this.fs) {
      try {
        source.end();
      } catch {
        // ignore
      }
      return;
    }

    if (!this.isValid) {
      return;
    }

    logger.debug(`connection invalidated (${reason})`);
    this.isValid = false;
    try {
      if (this.fs) {
        this.fs.end();
      }
    } catch {
      // ignore
    }
  }

  end() {
    this.isValid = false;
    try {
      if (this.fs) {
        this.fs.end();
      }
    } catch {
      // ignore teardown errors: the entry is being dropped either way
    }
  }
}

function getLocalFs() {
  return Promise.resolve(localFs);
}

const fsTable: {
  [x: string]: KeepAliveRemoteFs;
} = {};

export function createRemoteIfNoneExist(option): Promise<FileSystem> {
  if (option.protocol === 'local') {
    return getLocalFs();
  }

  const identity = hashOption(option);
  const fs = fsTable[identity];
  if (fs !== undefined) {
    return fs.getFs(option);
  }

  const fsInstance = new KeepAliveRemoteFs();
  fsTable[identity] = fsInstance;
  return fsInstance.getFs(option);
}

export function removeRemoteFs(option) {
  const identity = hashOption(option);
  const fs = fsTable[identity];
  if (fs !== undefined) {
    fs.end();
    delete fsTable[identity];
  }
}

// Drops every pooled connection. Backs the "Reconectar" command: whatever state
// a connection got itself into, the next operation starts from a fresh one.
export function removeAllRemoteFs() {
  Object.keys(fsTable).forEach(identity => {
    fsTable[identity].end();
    delete fsTable[identity];
  });
}
