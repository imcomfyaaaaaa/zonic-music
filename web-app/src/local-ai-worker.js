import { pipeline, env } from './transformers.js';
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = false;
env.localModelPath = new URL('./ai/models/', import.meta.url).href;
env.backends.onnx.wasm.wasmPaths = new URL('./ai/runtime/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
let extractor;
const cache = new Map();
const describe = track => `Music: ${String(track.title || '').slice(0, 180)}. Artist: ${String(track.artist || '').slice(0, 120)}.`;
async function embed(track) {
  const text = describe(track); if (cache.has(text)) return cache.get(text);
  const tensor = await extractor(text, { pooling: 'mean', normalize: true });
  const vector = Array.from(tensor.data); tensor.dispose?.();
  if (cache.size >= 256) cache.delete(cache.keys().next().value); cache.set(text, vector); return vector;
}
self.onmessage = async ({ data }) => {
  try {
    if (!extractor) extractor = await pipeline('feature-extraction', 'minilm', { device: 'wasm', dtype: 'q8', progress_callback: progress => { if (progress.status === 'progress') self.postMessage({ type: 'progress', progress: Math.round(progress.progress || 0) }); } });
    const seeds = []; for (const track of data.seeds.slice(0, 4)) seeds.push(await embed(track));
    const scored = [];
    for (const track of data.candidates.slice(0, 48)) {
      const vector = await embed(track);
      const similarity = seeds.reduce((sum, seed) => sum + vector.reduce((dot, v, i) => dot + v * seed[i], 0), 0) / Math.max(1, seeds.length);
      // Semantic matching complements the source's music-related ranking.
      scored.push({ id: track.id, score: .7 * similarity + .3 * Math.min(1, track.recommendation?.score || 0) });
    }
    scored.sort((a, b) => b.score - a.score);
    self.postMessage({ type: 'result', ids: scored.map(t => t.id) });
  } catch (error) { extractor = null; self.postMessage({ type: 'error', error: error.message }); }
};
