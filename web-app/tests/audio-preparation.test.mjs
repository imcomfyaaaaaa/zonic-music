import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioPreparation } from '../src/audio-preparation.js';

test('prepares the highest quality with a bounded range and avoids repeat work', async () => {
  const original = globalThis.fetch, calls = [];
  let cancelled = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, body: { cancel: async () => { cancelled = true; } } };
  };
  try {
    const preparation = new AudioPreparation(), track = { ytid: 'abcdefghijk' };
    await preparation.prepare(track, { streamingQuality: 'high' });
    await preparation.prepare(track, { streamingQuality: 'high' });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /quality=high/);
    assert.equal(calls[0].options.headers.Range, 'bytes=0-0');
    assert.equal(cancelled, true);
    await preparation.prepare({ ytid: 'lmnopqrstuv' }, { offline: true });
    await preparation.prepare({ ytid: 'lmnopqrstuv', downloaded: true }, {});
    await preparation.prepare({ ytid: 'lmnopqrstuv', isLive: true }, {});
    await preparation.prepare({ ytid: 'lmnopqrstuv' }, { shuffle: true });
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = original; }
});
