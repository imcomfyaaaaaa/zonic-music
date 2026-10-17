import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLibrary, validateBackup, safeUrl, nextIndex, parseSpotifyCsv, migrateMusify, eqPreset } from '../src/library.js';
import { newerVersion, selectApkAsset } from '../src/updates.js';
import { randomId } from '../src/id.js';
test('ID generation works on non-secure phone origins without crypto.randomUUID', () => {
  const id = randomId({ getRandomValues(bytes) { bytes.fill(7); return bytes; } });
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('backup rejects active URLs and duplicate identifiers', () => {
  const value = emptyLibrary();
  value.tracks = [{ id: 'a', title: 'Song', kind: 'url', url: 'javascript:alert(1)' }];
  assert.throws(() => validateBackup(value));
  value.tracks = [{ id: 'a', title: 'Song', kind: 'local' }, { id: 'a', title: 'Song', kind: 'local' }];
  assert.throws(() => validateBackup(value));
  assert.equal(safeUrl('https://user:secret@example.com/song.mp3'), '');
});
test('restored playlists preserve order and remove missing references', () => {
  const value = emptyLibrary();
  value.tracks = [{ id: 'a', title: 'Song', kind: 'local' }];
  value.playlists = [{ id: 'p', name: 'Favorites', tracks: ['missing', 'a', 'a'] }];
  value.liked = ['a', 'missing']; value.settings.eq = [-100, 2, 0, 1, 100];
  const result = validateBackup(value);
  assert.deepEqual(result.playlists[0].tracks, ['a']);
  assert.deepEqual(result.liked, ['a']);
  assert.deepEqual(result.settings.eq, [-12, 2, 0, 1, 12]);
});
test('queue ends, repeats, and shuffles without replaying current track', () => {
  assert.equal(nextIndex(1, 2, false, false), -1);
  assert.equal(nextIndex(1, 2, true, false), 0);
  assert.equal(nextIndex(0, 1, false, true), -1);
  for (const random of [0, .4, .99]) assert.notEqual(nextIndex(1, 3, false, true, () => random), 1);
  assert.equal(nextIndex(-1, 0, true, true), -1);
});
test('Spotify CSV parser preserves quoted titles, commas, and escaped quotes', () => {
  assert.deepEqual(parseSpotifyCsv('\uFEFFTrack name,Artist name(s)\r\n"Song, Part 2","Band ""A"""\r\n'), [{ title: 'Song, Part 2', artist: 'Band "A"' }]);
  assert.throws(() => parseSpotifyCsv('Track name,Artist\n"unfinished,Artist'));
  assert.throws(() => parseSpotifyCsv('Wrong,Headers\nA,B'));
});
test('Musify migration preserves folders, favorites, and monthly listening', () => {
  const song = { ytid: 'abcdefghijk', title: 'Song', artist: 'Artist' };
  const state = migrateMusify({ likedSongs: [song], customPlaylists: [{ ytid: 'custom1', title: 'Mix', list: [song] }], playlistFolders: [{ id: 'f', name: 'Folder', playlists: [{ ytid: 'custom1', title: 'Mix', list: [song] }] }], wrappedListeningStats: { currentMonthKey: '2026-10', currentMonth: { totalSeconds: 90, songs: { abcdefghijk: { ...song, seconds: 90, playCount: 2 } } } } });
  assert.deepEqual(state.liked, ['yt:abcdefghijk']); assert.equal(state.playlists[0].folderId, 'f'); assert.equal(state.months['2026-10'].songs['yt:abcdefghijk'].plays, 2);
});
test('queue metadata preserves repeated entries and validates settings', () => {
  const state = emptyLibrary(); const track = { id: 'a', title: 'Song', kind: 'local' };
  state.queue = { ids: ['a', 'a'], tracks: [track], index: 1, position: 30 }; state.settings.language = 'de'; state.settings.repeatOne = true;
  const restored = validateBackup(state); assert.deepEqual(restored.queue.ids, ['a', 'a']); assert.equal(restored.queue.position, 30); assert.equal(restored.settings.repeatOne, true);
  assert.deepEqual(eqPreset('bassBoost'), [8, 8, 3, -2, -2]);
});
test('quality settings migrate independently from the legacy preference', () => {
  const legacy = emptyLibrary(); legacy.settings.quality = 'medium'; delete legacy.settings.streamingQuality; delete legacy.settings.downloadQuality;
  const migrated = validateBackup(legacy);
  assert.equal(migrated.settings.streamingQuality, 'medium'); assert.equal(migrated.settings.downloadQuality, 'medium');
  const split = emptyLibrary(); split.settings.streamingQuality = 'low'; split.settings.downloadQuality = 'high';
  const restored = validateBackup(split);
  assert.equal(restored.settings.streamingQuality, 'low'); assert.equal(restored.settings.downloadQuality, 'high');
});
test('saved tracks preserve valid high-resolution artwork', () => {
  const state = emptyLibrary();
  state.tracks = [{ id: 'yt:abcdefghijk', ytid: 'abcdefghijk', title: 'Song', kind: 'youtube', artwork: 'https://example.com/medium.jpg', highResImage: 'https://example.com/large.jpg' }];
  const restored = validateBackup(state);
  assert.equal(restored.tracks[0].artwork, 'https://example.com/medium.jpg');
  assert.equal(restored.tracks[0].highResArtwork, 'https://example.com/large.jpg');
});

test('download byte counts survive library validation', () => {
  const state = emptyLibrary();
  state.tracks = [{ id: 'yt:abcdefghijk', ytid: 'abcdefghijk', title: 'Offline song', artist: 'Artist', kind: 'youtube', downloaded: true, downloadBytes: 12_345_678 }];
  assert.equal(validateBackup(state).tracks[0].downloadBytes, 12_345_678);
  state.tracks[0].downloadBytes = -1;
  assert.equal(validateBackup(state).tracks[0].downloadBytes, 0);
});
test('Grove update comparison never treats older or malformed releases as newer', () => {
  assert.equal(newerVersion('0.2.0', 'v0.3.0'), true); assert.equal(newerVersion('0.2.0', 'v0.1.9'), false); assert.equal(newerVersion('0.2.0', 'invalid'), false);
  const selected = selectApkAsset([
    { name: 'Zonic-arm64-v8a.apk', browser_download_url: 'https://github.com/example/app/releases/download/v1/Zonic-arm64-v8a.apk' },
    { name: 'Zonic.apk', browser_download_url: 'https://github.com/example/app/releases/download/v1/Zonic.apk' },
  ]);
  assert.equal(selected.name, 'Zonic.apk');
});
