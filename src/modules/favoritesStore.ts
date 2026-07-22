// Pure list operations behind the remote favorites, kept free of the vscode
// import so they can be unit-tested directly. remoteFavorites.ts adds the
// persistence and event glue on top.

export interface Favorite {
  // Identifies the connection this path belongs to. A favorite whose connection
  // no longer exists is simply skipped when opening.
  remoteId: number;
  fsPath: string;
  isDirectory: boolean;
  label: string;
}

// A favorite is identified by connection + path, so this is the equality used
// throughout — a second "add" of the same target is a no-op, not a duplicate.
export function sameTarget(f: Favorite, remoteId: number, fsPath: string): boolean {
  return f.remoteId === remoteId && f.fsPath === fsPath;
}

export function containsFavorite(
  list: Favorite[],
  remoteId: number,
  fsPath: string
): boolean {
  return list.some(f => sameTarget(f, remoteId, fsPath));
}

export function withFavorite(list: Favorite[], favorite: Favorite): Favorite[] {
  if (containsFavorite(list, favorite.remoteId, favorite.fsPath)) {
    return list;
  }
  return list.concat(favorite);
}

export function withoutFavorite(
  list: Favorite[],
  remoteId: number,
  fsPath: string
): Favorite[] {
  return list.filter(f => !sameTarget(f, remoteId, fsPath));
}
