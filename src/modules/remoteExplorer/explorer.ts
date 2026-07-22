import * as vscode from 'vscode';
import { registerCommand } from '../../host';
import {
  COMMAND_REMOTEEXPLORER_REFRESH,
  COMMAND_REMOTEEXPLORER_REFRESH_ACTIVE_FILE,
  COMMAND_REMOTEEXPLORER_VIEW_CONTENT,
  COMMAND_REMOTEEXPLORER_SEARCH,
  COMMAND_REMOTEEXPLORER_ADD_FAVORITE,
  COMMAND_REMOTEEXPLORER_REMOVE_FAVORITE,
  COMMAND_REMOTEEXPLORER_OPEN_FAVORITE,
} from '../../constants';
import { upath, UResource } from '../../core';
import { toRemotePath } from '../../helper';
import { REMOTE_SCHEME } from '../../constants';
import { getFileService } from '../serviceManager';
import { uploadPathToRemote } from '../../fileHandlers';
import {
  addFavorite,
  removeFavorite,
  getFavorites,
  Favorite,
} from '../remoteFavorites';
import RemoteTreeDataProvider, { ExplorerItem, ExplorerRoot } from './treeDataProvider';

// Accepts files dragged from the OS file manager or VS Code's own explorer
// (both expose `text/uri-list`) and uploads them into the remote folder they
// were dropped on. It does not originate drags, so dragMimeTypes is empty.
class RemoteDragAndDropController implements vscode.TreeDragAndDropController<ExplorerItem> {
  readonly dropMimeTypes = ['text/uri-list'];
  readonly dragMimeTypes = [];

  constructor(
    private readonly treeDataProvider: RemoteTreeDataProvider,
    private readonly onDidUpload: (target: ExplorerItem) => void
  ) {}

  async handleDrop(
    target: ExplorerItem | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): Promise<void> {
    if (!target) {
      vscode.window.showInformationMessage(
        'SFTP: solte sobre uma pasta ou conexão remota para enviar.'
      );
      return;
    }

    const root = this.treeDataProvider.findRoot(target.resource.uri);
    if (!root) {
      return;
    }

    const item = dataTransfer.get('text/uri-list');
    if (!item) {
      return;
    }

    const localPaths = (await item.asString())
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        try {
          const uri = vscode.Uri.parse(line, true);
          return uri.scheme === 'file' ? uri.fsPath : undefined;
        } catch {
          return undefined;
        }
      })
      .filter((p): p is string => !!p);

    if (localPaths.length === 0) {
      return;
    }

    // Drop onto a file targets its containing folder, not the file itself.
    const destFolder = target.isDirectory
      ? target.resource.fsPath
      : upath.dirname(target.resource.fsPath);
    const { fileService, config } = root.explorerContext;

    let sent = 0;
    for (const localPath of localPaths) {
      const remotePath = upath.join(destFolder, upath.basename(localPath));
      try {
        await uploadPathToRemote(fileService, config, localPath, remotePath);
        sent += 1;
      } catch (error) {
        vscode.window.showErrorMessage(
          `SFTP: falha ao enviar ${upath.basename(localPath)}: ${error && error.message}`
        );
      }
    }

    if (sent > 0) {
      vscode.window.showInformationMessage(
        sent > 1
          ? `SFTP: ${sent} itens enviados para ${destFolder}.`
          : `SFTP: enviado para ${destFolder}.`
      );
      this.onDidUpload(target);
    }
  }
}

export default class RemoteExplorer {
  private _explorerView: vscode.TreeView<ExplorerItem>;
  private _treeDataProvider: RemoteTreeDataProvider;

  constructor(context: vscode.ExtensionContext) {
    this._treeDataProvider = new RemoteTreeDataProvider();
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(REMOTE_SCHEME, this._treeDataProvider)
    );

    this._explorerView = vscode.window.createTreeView('remoteExplorer', {
      showCollapseAll: true,
      treeDataProvider: this._treeDataProvider,
      canSelectMany: true,
      dragAndDropController: new RemoteDragAndDropController(this._treeDataProvider, item =>
        this.refresh(item)
      ),
    });

    registerCommand(context, COMMAND_REMOTEEXPLORER_REFRESH, () => this._refreshSelection());
    registerCommand(context, COMMAND_REMOTEEXPLORER_REFRESH_ACTIVE_FILE, () => this._refreshActiveRemoteFile());
    registerCommand(context, COMMAND_REMOTEEXPLORER_VIEW_CONTENT, (item: ExplorerItem) =>
      this._treeDataProvider.showItem(item)
    );
    registerCommand(context, COMMAND_REMOTEEXPLORER_SEARCH, (item?: ExplorerItem) =>
      this._search(item)
    );
    registerCommand(context, COMMAND_REMOTEEXPLORER_ADD_FAVORITE, (item: ExplorerItem) =>
      this._addFavorite(item)
    );
    registerCommand(context, COMMAND_REMOTEEXPLORER_REMOVE_FAVORITE, () =>
      this._removeFavorite()
    );
    registerCommand(context, COMMAND_REMOTEEXPLORER_OPEN_FAVORITE, () => this._openFavorite());
  }

  private async _addFavorite(item: ExplorerItem) {
    if (!item) {
      return;
    }
    const root = this._treeDataProvider.findRoot(item.resource.uri);
    if (!root) {
      return;
    }
    const fsPath = item.resource.fsPath;
    const connName = root.explorerContext.fileService.name || root.explorerContext.config.host;
    const favorite: Favorite = {
      remoteId: root.explorerContext.id,
      fsPath,
      isDirectory: item.isDirectory,
      label: `${connName}: ${upath.basename(fsPath) || fsPath}`,
    };
    await addFavorite(favorite);
    vscode.window.showInformationMessage(`SFTP: adicionado aos favoritos — ${favorite.label} ⭐`);
  }

  private async _pickFavorite(placeHolder: string): Promise<Favorite | undefined> {
    const favorites = getFavorites();
    if (favorites.length === 0) {
      vscode.window.showInformationMessage('SFTP: nenhum favorito salvo ainda.');
      return undefined;
    }
    const pick = await vscode.window.showQuickPick(
      favorites.map(favorite => ({
        label: `${favorite.isDirectory ? '$(folder)' : '$(file)'} ${favorite.label}`,
        description: favorite.fsPath,
        favorite,
      })),
      { placeHolder }
    );
    return pick && pick.favorite;
  }

  private async _openFavorite() {
    const favorite = await this._pickFavorite('Abrir favorito remoto');
    if (!favorite) {
      return;
    }

    const root = this._treeDataProvider.findRootById(favorite.remoteId);
    if (!root) {
      vscode.window.showWarningMessage(
        `SFTP: a conexão do favorito "${favorite.label}" não existe mais.`
      );
      return;
    }

    const item = this._treeDataProvider.resourceItem(root, favorite.fsPath, favorite.isDirectory);
    if (favorite.isDirectory) {
      // Reveal and expand the folder in the tree.
      await this._explorerView.reveal(item, { expand: true, select: true });
    } else {
      this._treeDataProvider.openResource(item.resource);
    }
  }

  private async _removeFavorite() {
    const favorite = await this._pickFavorite('Remover favorito remoto');
    if (!favorite) {
      return;
    }
    await removeFavorite(favorite.remoteId, favorite.fsPath);
    vscode.window.showInformationMessage(`SFTP: favorito removido — ${favorite.label}`);
  }

  private async _pickRoot(item?: ExplorerItem): Promise<ExplorerRoot | undefined> {
    if (item) {
      const root = this._treeDataProvider.findRoot(item.resource.uri);
      if (root) {
        return root;
      }
    }

    const roots = this._treeDataProvider.getRoots();
    if (roots.length === 0) {
      vscode.window.showInformationMessage('SFTP: Nenhuma configuração encontrada.');
      return undefined;
    }
    if (roots.length === 1) {
      return roots[0];
    }

    const pick = await vscode.window.showQuickPick(
      roots.map(root => ({
        label: root.explorerContext.fileService.name || root.explorerContext.config.host,
        description: root.explorerContext.config.remotePath,
        root,
      })),
      { placeHolder: 'Buscar em qual conexão?' }
    );
    return pick && pick.root;
  }

  private async _search(item?: ExplorerItem) {
    const root = await this._pickRoot(item);
    if (!root) {
      return;
    }

    const remoteRoot = root.resource.fsPath;
    const collected = await vscode.window.withProgress(
      { location: { viewId: 'remoteExplorer' }, title: 'Buscando arquivos remotos…' },
      () => this._treeDataProvider.collectFiles(root)
    );

    if (collected.files.length === 0) {
      vscode.window.showInformationMessage('SFTP: nenhum arquivo encontrado para buscar.');
      return;
    }

    const items = collected.files.map(resource => ({
      label: `$(file) ${upath.basename(resource.fsPath)}`,
      // Path relative to the remote root, so the matcher works on it too.
      description: upath.relative(remoteRoot, resource.fsPath),
      resource,
    }));

    const placeHolder = collected.truncated
      ? `Digite para filtrar (mostrando os primeiros ${items.length}, refine a busca navegando até uma subpasta)`
      : `Digite para filtrar ${items.length} arquivo(s)`;

    const pick = await vscode.window.showQuickPick(items, {
      placeHolder,
      matchOnDescription: true,
    });
    if (pick) {
      this._treeDataProvider.openResource(pick.resource);
    }
  }

  refresh(item?: ExplorerItem) {
    if (item && !UResource.isRemote(item.resource.uri)) {
      const uri = item.resource.uri;
      const fileService = getFileService(uri);
      if (!fileService) {
        if (uri.toString(true) == "file:///${command:sftp.sync.remoteToLocal}") {
          throw '';
        } else {
          throw new Error(`Configuração não encontrada. (${uri.toString(true)})`);
        }
      }
      const config = fileService.getConfig();
      const localPath = item.resource.fsPath;
      const remotePath = toRemotePath(localPath, config.context, config.remotePath);
      item.resource = UResource.makeResource({
        remote: {
          host: config.host,
          port: config.port,
        },
        fsPath: remotePath,
        remoteId: fileService.id,
      });
    }

    this._treeDataProvider.refresh(item);
  }

  reveal(item: ExplorerItem): Thenable<void> {
    return item ? this._explorerView.reveal(item) : Promise.resolve();
  }

  findRoot(remoteUri: vscode.Uri) {
    return this._treeDataProvider.findRoot(remoteUri);
  }

  private _refreshSelection() {
    if (this._explorerView.selection.length) {
      this._explorerView.selection.forEach(item => this.refresh(item));
    } else {
      this.refresh();
    }
  }

  private _refreshActiveRemoteFile() {
    const focusedEditor = vscode.window.activeTextEditor;
    if (focusedEditor) {

      const remoteFileUri = focusedEditor.document.uri;
      const root = this._treeDataProvider.findRoot(remoteFileUri);
      const incompleteResource = UResource.makeResource(remoteFileUri);

      if (!root) {
        return;
      }
      const remoteFileItem = {
        resource: UResource.updateResource(root.resource, {
          remotePath: incompleteResource.fsPath
        }),
        isDirectory: false
      };

      this.refresh(remoteFileItem);
    }
    
  }
}
