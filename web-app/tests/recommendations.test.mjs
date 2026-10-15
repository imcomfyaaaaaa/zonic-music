import test from 'node:test';
import assert from 'node:assert/strict';
import { blendRecommendations, discoverRecommendations } from '../src/recommendations.js';
import { emptyLibrary } from '../src/library.js';
const song = (id, artist = 'Artist') => ({ id: 'yt:' + id, ytid: id, title: id, artist, kind: 'youtube', duration: 200 });
const originals = Array.from({ length: 12 }, (_, i) => song('original' + i, 'Artist ' + i % 4));
test('inserts recommendations at a bounded ratio without changing original order', () => {
 const picks = [song('new1'), song('new2'), song('new3'), song('new4'), song('new5')];
 const blended = blendRecommendations(originals, picks);
 assert.equal(blended.length, 16); assert.equal(blended[3], picks[0]); assert.equal(blended[7], picks[1]);
 assert.deepEqual(blended.filter(t => originals.includes(t)), originals); assert.equal(originals.length, 12);
 assert.equal(blendRecommendations(originals, [originals[0]]).length, 12);
});
test('filters recent, duplicate, live and long-form results, diversifies seeds', async () => {
 const state = emptyLibrary(); state.history = ['yt:recent']; const calls = [];
 const result = await discoverRecommendations(originals, state, { request: async (route, params) => {
 calls.push(params.id); return [song('recent'), originals[0], { ...song('live'), isLive: true }, { ...song('long'), duration: 3600 }, song('new1'), song('new2'), song('new3', 'Other')];
 } });
 assert.equal(calls.length, 4); assert.equal(new Set(calls).size, 4); assert.deepEqual(result.map(t => t.ytid), ['new1', 'new2', 'new3']);
 assert.ok(result.every(t => t.recommendation.method === 'related'));
});
test('offline and failed sources leave the playlist alone', async () => {
 const state = emptyLibrary(); state.settings.offline = true;
 assert.deepEqual(await discoverRecommendations(originals, state, { request: () => { throw Error('must not call'); } }), []);
 state.settings.offline = false; assert.deepEqual(await discoverRecommendations(originals, state, { request: async () => { throw Error('offline'); } }), []);
});
test('AI hook accepts only verified candidates and has a related-song fallback', async () => {
 const request = async () => [song('new1'), song('new2')];
 const result = await discoverRecommendations(originals, emptyLibrary(), { request, rank: async () => ['invented', 'yt:new2', 'yt:new2'] });
 assert.equal(result[0].ytid, 'new2'); assert.equal(result[0].recommendation.method, 'ai'); assert.equal(result.length, 2);
 const fallback = await discoverRecommendations(originals, emptyLibrary(), { request, rank: async () => { throw Error('unavailable'); } });
 assert.equal(fallback[0].recommendation.method, 'related');
});
