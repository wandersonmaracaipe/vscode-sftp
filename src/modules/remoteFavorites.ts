import * as vscode from 'vscode';
import {
  Favorite,
  containsFavorite,
  withFavorite,
  withoutFavorite,
} from './favoritesStore';

export { Favorite };

const STORAGE_KEY = 'sftp.remoteFavorites';

let extensionContext: vscode.ExtensionContext | undefined;

const onDidChange = new vscode.EventEmitter<void>();
export const onFavoritesChanged = onDidChange.event;

export function initRemoteFavorites(context: vscode.ExtensionContext) {
  extensionContext = context;
}

export function getFavorites(): Favorite[] {
  if (!extensionContext) {
    return [];
  }
  return extensionContext.workspaceState.get<Favorite[]>(STORAGE_KEY, []);
}

async function save(favorites: Favorite[]) {
  if (!extensionContext) {
    return;
  }
  await extensionContext.workspaceState.update(STORAGE_KEY, favorites);
  onDidChange.fire();
}

export function isFavorite(remoteId: number, fsPath: string): boolean {
  return containsFavorite(getFavorites(), remoteId, fsPath);
}

export async function addFavorite(favorite: Favorite): Promise<void> {
  const current = getFavorites();
  const next = withFavorite(current, favorite);
  if (next !== current) {
    await save(next);
  }
}

export async function removeFavorite(remoteId: number, fsPath: string): Promise<void> {
  await save(withoutFavorite(getFavorites(), remoteId, fsPath));
}
