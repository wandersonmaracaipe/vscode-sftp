import { Client } from 'basic-ftp';
import RemoteClient, { ConnectOption } from './remoteClient';

export default class FTPClient extends RemoteClient {
  private _disconnectHandlers: Array<(reason: string) => void> = [];

  _initClient() {
    // basic-ftp applies this timeout to the connect handshake and to idle time
    // during transfers; it is read-only after construction. Falls back to the
    // library default (30s) when connectTimeout isn't configured.
    return new Client(this._option.connectTimeout);
  }

  _hasProvideAuth(connectOption: ConnectOption) {
    // eslint-disable-next-line eqeqeq
    return connectOption.password != undefined;
  }

  async _doConnect(connectOption: ConnectOption): Promise<void> {
    const client = this._client as Client;
    const { host, port, username, password, secure, secureOptions, debug } = connectOption;

    // Route basic-ftp's protocol logging through the extension logger.
    // (basic-ftp masks the PASS argument on its own, so no secret leaks here.)
    if (typeof debug === 'function') {
      client.ftp.verbose = true;
      client.ftp.log = debug;
    }

    await client.access({
      host,
      port,
      user: username,
      password,
      // node-ftp accepted true | 'control' | 'implicit'; basic-ftp only knows
      // true (explicit AUTH TLS) and 'implicit'. Treat 'control' as explicit.
      secure: secure === 'control' ? true : secure,
      secureOptions: secureOptions as any,
    });

    // Notify listeners when the control connection drops so the pooled
    // filesystem can be invalidated and transparently reconnected on demand.
    const fire = (reason: string) => {
      this._closed = true;
      this._disconnectHandlers.forEach(cb => cb(reason));
    };
    client.ftp.socket.once('close', () => fire('close'));
    client.ftp.socket.once('end', () => fire('end'));
    client.ftp.socket.once('error', () => fire('error'));
  }

  end() {
    this._closed = true;
    this._client.close();
  }

  // Ask basic-ftp directly instead of trusting our socket listeners. When it
  // closes a client after a task error it calls socket.removeAllListeners()
  // BEFORE socket.destroy() (FtpContext._closeSocket), so the 'close' handler
  // registered below is stripped and never fires. Relying on it alone left the
  // pool serving a dead client forever: every later request failed with
  // "Client is closed because ..." until the window was reloaded.
  isClosed(): boolean {
    if (this._closed) {
      return true;
    }
    try {
      return (this._client as Client).closed;
    } catch {
      // `closed` dereferences the socket, which may already be gone.
      return true;
    }
  }

  // Overrides RemoteClient.onDisconnected: basic-ftp's Client is not an
  // EventEmitter, so we collect handlers here and wire them to the live socket
  // in _doConnect (onDisconnected is always registered before connect()).
  onDisconnected(cb: (reason: string) => void) {
    this._disconnectHandlers.push(cb);
  }

  getFsClient() {
    return this._client;
  }
}
