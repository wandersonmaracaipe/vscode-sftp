const {
  containsFavorite,
  withFavorite,
  withoutFavorite,
  sameTarget,
} = require('../../src/modules/favoritesStore');

const fav = (remoteId, fsPath, extra = {}) => ({
  remoteId,
  fsPath,
  isDirectory: false,
  label: `${remoteId}:${fsPath}`,
  ...extra,
});

describe('favoritesStore', () => {
  test('sameTarget matches on connection AND path', () => {
    const f = fav(1, '/a');
    expect(sameTarget(f, 1, '/a')).toBe(true);
    expect(sameTarget(f, 2, '/a')).toBe(false);
    expect(sameTarget(f, 1, '/b')).toBe(false);
  });

  test('withFavorite adds to an empty list', () => {
    const list = withFavorite([], fav(1, '/var/www'));
    expect(list).toHaveLength(1);
    expect(containsFavorite(list, 1, '/var/www')).toBe(true);
  });

  test('withFavorite is a no-op for a duplicate and keeps the same reference', () => {
    const list = [fav(1, '/var/www')];
    const next = withFavorite(list, fav(1, '/var/www', { label: 'other' }));
    // Same reference lets the caller cheaply detect "nothing changed".
    expect(next).toBe(list);
    expect(next).toHaveLength(1);
  });

  test('the same path on a different connection is distinct', () => {
    let list = withFavorite([], fav(1, '/shared'));
    list = withFavorite(list, fav(2, '/shared'));
    expect(list).toHaveLength(2);
    expect(containsFavorite(list, 2, '/shared')).toBe(true);
  });

  test('withoutFavorite removes only the matching entry', () => {
    const list = [fav(1, '/a'), fav(1, '/b')];
    const next = withoutFavorite(list, 1, '/a');
    expect(next).toHaveLength(1);
    expect(next[0].fsPath).toBe('/b');
    expect(containsFavorite(next, 1, '/a')).toBe(false);
  });

  test('withoutFavorite only touches the given connection', () => {
    const list = [fav(1, '/shared'), fav(2, '/shared')];
    const next = withoutFavorite(list, 1, '/shared');
    expect(containsFavorite(next, 1, '/shared')).toBe(false);
    expect(containsFavorite(next, 2, '/shared')).toBe(true);
  });

  test('withoutFavorite on an absent entry is a harmless copy', () => {
    const list = [fav(1, '/a')];
    const next = withoutFavorite(list, 9, '/nope');
    expect(next).toHaveLength(1);
  });
});
