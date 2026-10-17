import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubePlaylistId, mergePlaylistTracks, isLikedSongsPlaylist, mergeImportedLikes } from '../src/playlist-sync.js';

test('sync accepts only YouTube playlist links and keeps local additions', () => {
  assert.equal(youtubePlaylistId('https://www.youtube.com/playlist?list=PL1234567890'), 'PL1234567890');
  assert.equal(youtubePlaylistId('https://music.youtube.com/playlist?list=PL1234567890'), 'PL1234567890');
  assert.equal(youtubePlaylistId('https://m.youtube.com/playlist?list=PL1234567890&si=share'), 'PL1234567890');
  assert.equal(youtubePlaylistId('Shared from YouTube: https://youtu.be/demo?list=PL1234567890'), 'PL1234567890');
  assert.equal(youtubePlaylistId('PL1234567890'), 'PL1234567890');
  assert.equal(youtubePlaylistId('https://example.com/playlist?list=PL1234567890'), '');
  assert.equal(youtubePlaylistId('http://www.youtube.com/playlist?list=PL1234567890'), '');
  assert.deepEqual(mergePlaylistTracks(['local', 'old'], ['new', 'old']), ['new', 'old', 'local']);
});

test('imported Liked Songs playlists merge into likes without duplicates', () => {
  assert.equal(isLikedSongsPlaylist('  LIKED   SONGS '), true);
  assert.deepEqual(mergeImportedLikes(['a'], 'Liked Songs', ['a', 'b', 'b']), ['a', 'b']);
  assert.deepEqual(mergeImportedLikes(['a'], 'Road trip', ['b']), ['a']);
});
