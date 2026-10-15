import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubePlaylistId, mergePlaylistTracks } from '../src/playlist-sync.js';

test('sync accepts only YouTube playlist links and keeps local additions', () => {
  assert.equal(youtubePlaylistId('https://www.youtube.com/playlist?list=PL1234567890'), 'PL1234567890');
  assert.equal(youtubePlaylistId('https://music.youtube.com/playlist?list=PL1234567890'), 'PL1234567890');
  assert.equal(youtubePlaylistId('https://example.com/playlist?list=PL1234567890'), '');
  assert.equal(youtubePlaylistId('http://www.youtube.com/playlist?list=PL1234567890'), '');
  assert.deepEqual(mergePlaylistTracks(['local', 'old'], ['new', 'old']), ['new', 'old', 'local']);
});
