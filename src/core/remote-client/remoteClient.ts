import CustomError from '../customError';

export interface ConnectOption {
  // common
  host: string;
  port: number;
  username?: string;
  password?: string;
  connectTimeout?: number;
  debug(x: string): void;

  // ssh-only
  privateKeyPath?: string;
  privateKey?: string;
  passphrase?: string | boolean;
  interactiveAuth?: boolean | string[];
  agent?: string;
  sock?: any;
  hop?: ConnectOption | ConnectOption[];
  limitOpenFilesOnRemote?: boolean | number;
  hostKeyChecking?: 'strict' | 'prompt' | 'off';
  knownHosts?: string;

  // ftp-only
  secure?: any;
  secureOptions?: object;
  passive?: boolean;
}

export enum ErrorCode {
  CONNECT_CANCELLED,
  HOST_KEY_REJECTED,
}

export interface HostKeyPrompt {
  host: string;
  port: number;
  keyType: string;
  fingerprint: string;
  changed: boolean;
}

export interface Config {
  askForPasswd(msg: string): Promise<string | undefined>;
  // The private key's passphrase is a different secret from the account password,
  // so it gets its own callback (and its own vault entry). Falls back to
  // askForPasswd when not supplied.
  askForPassphrase?(msg: string): Promise<string | undefined>;
  // Asked when the server's key isn't in known_hosts. Resolving true accepts and
  // records the key; anything else aborts the connection.
  confirmHostKey?(prompt: HostKeyPrompt): Promise<boolean>;
}

export default abstract class RemoteClient {
  protected _client: any;
  protected _option: ConnectOption;
  protected _closed: boolean = false;

  constructor(option: ConnectOption) {
    this._option = option;
    this._client = this._initClient();
  }

  // Whether this client is dead and every further request would fail. Asked
  // before a pooled connection is handed out, because a disconnect event is not
  // guaranteed to reach us — see FTPClient.isClosed().
  isClosed(): boolean {
    return this._closed;
  }

  abstract end(): void;
  abstract getFsClient(): any;
  protected abstract _doConnect(connectOption: ConnectOption, config: Config): Promise<void>;
  protected abstract _hasProvideAuth(connectOption: ConnectOption): boolean;
  protected abstract _initClient(): any;

  async connect(connectOption: ConnectOption, config: Config) {
    if (this._hasProvideAuth(connectOption)) {
      return this._doConnect(connectOption, config);
    }

    const password = await config.askForPasswd(`[${connectOption.host}]: Enter your password`);

    // cancel connect
    if (password === undefined) {
      throw new CustomError(ErrorCode.CONNECT_CANCELLED, 'cancelled');
    }

    return this._doConnect({ ...connectOption, password }, config);
  }

  onDisconnected(cb) {
    this._client
      .on('end', () => {
        this._closed = true;
        cb('end');
      })
      .on('close', () => {
        this._closed = true;
        cb('close');
      })
      .on('error', err => {
        this._closed = true;
        cb('error');
      });
  }
}
