import * as vscode from 'vscode';
import { registerCommand } from '../../host';
import {
  COMMAND_REMOTEEXPLORER_REFRESH,
  COMMAND_REMOTEEXPLORER_REFRESH_ACTIVE_FILE,
  COMMAND_REMOTEEXPLORER_VIEW_CONTENT,
  COMMAND_REMOTEEXPLORER_SEARCH,
} from '../../constants';
import { upath, UResource } from '../../core';
import { toRemotePath } from '../../helper';
import { REMOTE_SCHEME } from '../../constants';
import { getFileService } from '../serviceManager';
import RemoteTreeDataProvider, { ExplorerItem, ExplorerRoot } from './treeDataProvider';

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
    });

    registerCommand(context, COMMAND_REMOTEEXPLORER_REFRESH, () => this._refreshSelection());
    registerCommand(context, COMMAND_REMOTEEXPLORER_REFRESH_ACTIVE_FILE, () => this._refreshActiveRemoteFile());
    registerCommand(context, COMMAND_REMOTEEXPLORER_VIEW_CONTENT, (item: ExplorerItem) =>
      this._treeDataProvider.showItem(item)
    );
    registerCommand(context, COMMAND_REMOTEEXPLORER_SEARCH, (item?: ExplorerItem) =>
      this._search(item)
    );
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
