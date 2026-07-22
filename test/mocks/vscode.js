// Minimal stand-in for the `vscode` module so core logic (transfer, sync,
// config) can be unit-tested outside the extension host. Only the surface the
// non-UI code actually touches is implemented — anything else should fail
// loudly rather than silently pretend to work.

const noop = () => {};

class EventEmitter {
  constructor() {
    this._listeners = [];
    this.event = listener => {
      this._listeners.push(listener);
      return { dispose: () => {} };
    };
  }
  fire(value) {
    this._listeners.forEach(l => l(value));
  }
  dispose() {
    this._listeners = [];
  }
}

class Uri {
  constructor(scheme, fsPath) {
    this.scheme = scheme;
    this.fsPath = fsPath;
    this.path = fsPath;
  }
  static file(p) {
    return new Uri('file', p);
  }
  static parse(value) {
    const [scheme, rest] = String(value).split(':');
    return new Uri(scheme, rest || '');
  }
  toString() {
    return `${this.scheme}://${this.fsPath}`;
  }
}

module.exports = {
  Uri,
  EventEmitter,
  Disposable: class Disposable {
    constructor(fn) {
      this.dispose = fn || noop;
    }
  },
  TreeItem: class TreeItem {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class ThemeIcon {
    constructor(id, color) {
      this.id = id;
      this.color = color;
    }
  },
  ThemeColor: class ThemeColor {
    constructor(id) {
      this.id = id;
    }
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ProgressLocation: { Notification: 15, Window: 10 },
  window: {
    createOutputChannel: () => ({
      appendLine: noop,
      show: noop,
      hide: noop,
      dispose: noop,
    }),
    createStatusBarItem: () => ({ show: noop, hide: noop, dispose: noop }),
    createTreeView: () => ({ dispose: noop }),
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showQuickPick: () => Promise.resolve(undefined),
    showInputBox: () => Promise.resolve(undefined),
    withProgress: (_options, task) =>
      task({ report: noop }, { isCancellationRequested: false, onCancellationRequested: noop }),
    activeTextEditor: undefined,
  },
  workspace: {
    // Settings default to "unset" so code falls back to its own defaults.
    getConfiguration: () => ({ get: () => undefined }),
    workspaceFolders: undefined,
    textDocuments: [],
    onDidSaveTextDocument: () => ({ dispose: noop }),
    onWillSaveTextDocument: () => ({ dispose: noop }),
    onDidOpenTextDocument: () => ({ dispose: noop }),
    registerTextDocumentContentProvider: () => ({ dispose: noop }),
    createFileSystemWatcher: () => ({
      onDidCreate: () => ({ dispose: noop }),
      onDidChange: () => ({ dispose: noop }),
      onDidDelete: () => ({ dispose: noop }),
      dispose: noop,
    }),
  },
  commands: {
    registerCommand: () => ({ dispose: noop }),
    executeCommand: () => Promise.resolve(undefined),
  },
  extensions: { getExtension: () => undefined },
};
