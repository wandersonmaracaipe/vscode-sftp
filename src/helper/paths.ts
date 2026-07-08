import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { upath } from '../core';
import { pathRelativeToWorkspace, getWorkspaceFolders } from '../host';

// Normalize a filesystem path so that only-casing differences (mostly the
// Windows drive letter) don't break path comparisons.
// Adapted from https://github.com/microsoft/vscode-eslint/blob/d97a8b5e99ad30d2ce32ffa5646447202f873413/server/src/eslintServer.ts#L816
function getFileSystemPath(fsPath: string): string {
	let result = fsPath;
	if (process.platform === 'win32' && result.length >= 2 && result[1] === ':') {
		// Node by default uses an upper case drive letter. Normalizing to upper
		// case keeps `path.relative` from producing wrong results when the two
		// paths only differ by the drive letter casing.
		result = result[0].toUpperCase() + result.substr(1);
	}
	if (process.platform === 'win32' || process.platform === 'darwin') {
		try {
			const realpath = fs.realpathSync.native(result);
			// Only use the real path if only the casing has changed.
			if (realpath.toLowerCase() === result.toLowerCase()) {
				result = realpath;
			}
		} catch {
			// The path may not exist yet (e.g. a file about to be created);
			// fall back to the normalized input in that case.
		}
	}
	return result;
}

export function simplifyPath(absolutePath: string) {
  return pathRelativeToWorkspace(absolutePath);
}

// FIXME: use fs.pathResolver instead of upath
export function toRemotePath(localPath: string, localContext: string, remoteContext: string) {
  return upath.join(remoteContext, path.relative(getFileSystemPath(localContext), getFileSystemPath(localPath)));
}

// FIXME: use fs.pathResolver instead of upath
export function toLocalPath(remotePath: string, remoteContext: string, localContext: string) {
  return path.join(localContext, upath.relative(remoteContext, remotePath));
}

export function isSubpathOf(possiableParentPath: string, pathname: string) {
  return path.normalize(pathname).indexOf(path.normalize(possiableParentPath)) === 0;
}

export function replaceHomePath(pathname: string) {
  return pathname.substr(0, 2) === '~/' ? path.join(os.homedir(), pathname.slice(2)) : pathname;
}

export function resolvePath(from: string, to: string) {
  return path.resolve(from, replaceHomePath(to));
}

export function isInWorkspace(filepath: string) {
  const workspaceFolders = getWorkspaceFolders();
  return (
    workspaceFolders &&
    workspaceFolders.some(
      // vscode can't keep filepath's stable, covert them to toLowerCase before check
      folder => filepath.toLowerCase().indexOf(folder.uri.fsPath.toLowerCase()) === 0
    )
  );
}
