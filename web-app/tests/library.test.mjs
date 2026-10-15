import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLibrary, validateBackup, safeUrl, nextIndex, parseSpotifyCsv, migrateMusify, eqPreset } from '../src/library.js';
import { newerVersion } from '../src/updates.js';
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
test('Grove update comparison never treats older or malformed releases as newer', () => {
  assert.equal(newerVersion('0.2.0', 'v0.3.0'), true); assert.equal(newerVersion('0.2.0', 'v0.1.9'), false); assert.equal(newerVersion('0.2.0', 'invalid'), false);
});
