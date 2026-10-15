import test from 'node:test';
import assert from 'node:assert/strict';
import { smartShuffle } from '../src/smart-shuffle.js';
import { emptyLibrary, validateBackup } from '../src/library.js';
const a = { id: 'a', title: 'A', artist: 'One', kind: 'local' }, b = { id: 'b', title: 'B', artist: 'Two', kind: 'local' }, c = { id: 'c', title: 'C', artist: 'One', kind: 'local' };
test('spaces artists and preserves duplicate entries', () => {
 const result = smartShuffle([a, b, c, a], emptyLibrary(), a, () => 0);
 assert.equal(result[0], b); assert.deepEqual(result.map(t => t.id).sort(), ['a', 'a', 'b', 'c']);
 assert.deepEqual(smartShuffle([], emptyLibrary()), []); assert.deepEqual(smartShuffle([a], emptyLibrary(), a), [a]);
});
test('weights favorites, recent history, and play counts', () => {
 const state = emptyLibrary(); state.liked = ['b']; assert.equal(smartShuffle([a, b], state, null, () => .45)[0], b);
 state.liked = []; state.history = ['a']; state.stats.a = { plays: 100 }; assert.equal(smartShuffle([a, b], state, null, () => .1)[0], b);
});
test('persists only when shuffle is enabled', () => {
 const state = emptyLibrary(); state.settings.shuffle = true; state.settings.smartShuffle = true; assert.equal(validateBackup(state).settings.smartShuffle, true);
 state.settings.shuffle = false; assert.equal(validateBackup(state).settings.smartShuffle, false);
});
test('spaces multiple artists and preserves every entry over many seeds', () => {
 const tracks = Array.from({ length: 24 }, (_, i) => ({ id: String(i), artist: `Artist ${i % 4}` }));
 for (let seed = 1; seed <= 50; seed++) {
 let value = seed; const random = () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
 const result = smartShuffle(tracks, emptyLibrary(), null, random);
 assert.equal(new Set(result.map(t => t.id)).size, 24);
 for (let i = 1; i < 18; i++) assert.notEqual(result[i].artist, result[i - 1].artist);
 }
});
test('handles unknown artists and single-artist queues', () => {
 for (const artist of ['', 'Same']) { const tracks = Array.from({ length: 100 }, (_, i) => ({ id: `${i}`, artist })); assert.equal(new Set(smartShuffle(tracks, emptyLibrary()).map(t => t.id)).size, 100); }
});
test('favorite weighting stays balanced across deterministic trials', () => {
 const state = emptyLibrary(); state.liked = ['b']; let count = 0;
 for (let i = 0; i < 1000; i++) if (smartShuffle([a, b], state, null, () => (i + .5) / 1000)[0] === b) count++;
 assert.ok(count > 550 && count < 650);
});
test('skip feedback ignores accidental taps and radio, survives backups, and fades', async () => {
 const { recordEarlySkip } = await import('../src/smart-shuffle.js'); const state = emptyLibrary(); const now = 2000000000;
 assert.equal(recordEarlySkip(state, a, 1, 200), false); assert.equal(recordEarlySkip(state, a, 80, 200), false);
 assert.equal(recordEarlySkip(state, { ...a, kind: 'radio' }, 5, Infinity), false);
 for (let i = 0; i < 3; i++) assert.equal(recordEarlySkip(state, a, 5, 200, now), true);
 state.tracks = [a]; assert.equal(validateBackup(state).stats.a.skips, 3);
 assert.equal(smartShuffle([a, b], state, null, () => .3, now)[0], b);
 assert.equal(smartShuffle([a, b], state, null, () => .3, now + 90 * 86400000)[0], a);
});
