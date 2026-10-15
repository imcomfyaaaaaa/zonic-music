import { api } from './sources.js';
const key = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').replace(/\b(official|audio|video|lyrics|hd|hq)\b/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const identity = track => `${key(track.artist)}:${key(track.title)}`;
export function blendRecommendations(originals, recommendations, every = 3) {
  const result = [], ids = new Set(originals.map(t => t.id)), songs = new Set(originals.map(identity));
  const picks = recommendations.filter(t => { const song = identity(t); if (ids.has(t.id) || songs.has(song)) return false; ids.add(t.id); songs.add(song); return true; });
  for (let i = 0; i < originals.length; i++) { result.push(originals[i]); if ((i + 1) % every === 0 && picks.length) result.push(picks.shift()); }
  return result;
}
export async function discoverRecommendations(originals, state, { request = api, signal, rank } = {}) {
  if (state.settings.offline || originals.length < 3) return [];
  const excluded = new Set([...originals.map(t => t.id), ...(state.history || []).slice(0, 30)]);
  const existing = new Set(originals.map(identity)), seeds = [], artists = new Set();
  // Sample the whole playlist instead of letting its first artist dominate.
  for (let i = 0; i < Math.min(12, originals.length); i++) {
    const track = originals[Math.floor(i * originals.length / Math.min(12, originals.length))];
    if (track.kind === 'radio' || track.isLive || artists.has(key(track.artist))) continue;
    artists.add(key(track.artist)); seeds.push(track); if (seeds.length === 4) break;
  }
  const batches = await Promise.all(seeds.map(async seed => {
    try {
      let id = seed.ytid;
      if (!id && seed.artist && seed.title) id = (await request('match', { q: `${seed.title} ${seed.artist}`, title: seed.title, artist: seed.artist }, { signal }))?.ytid;
      if (!id) return [];
      const related = await request('related', { id, title: seed.title || '', artist: seed.artist || '' }, { signal });
      return related.filter(t => t.kind === 'youtube' && t.ytid && !t.isLive && (!t.duration || t.duration >= 60 && t.duration <= 900)).slice(0, 15).map((track, position) => ({ ...track, recommendation: { seedId: seed.id, seedTitle: seed.title, method: 'related', score: 1 / (1 + position / 5) } }));
    } catch { return []; }
  }));
  const candidates = new Map();
  for (const track of batches.flat()) {
    if (excluded.has(track.id) || existing.has(identity(track))) continue;
    const old = candidates.get(track.id); if (old) old.recommendation.score += track.recommendation.score; else candidates.set(track.id, track);
  }
  let ordered = [...candidates.values()].sort((a, b) => b.recommendation.score - a.recommendation.score);
  // Provider implementations may rank verified candidates, never invent playable IDs.
  if (rank && ordered.length) {
    try { const ids = await rank(seeds, ordered, signal); const valid = [...new Set(ids)].map(id => candidates.get(id)).filter(Boolean); if (valid.length) ordered = [...valid.map(t => ({ ...t, recommendation: { ...t.recommendation, method: 'ai' } })), ...ordered.filter(t => !ids.includes(t.id))]; } catch { /* Keep related-song discovery available if AI is unavailable. */ }
  }
  const result = [], artistCounts = new Map(), songs = new Set();
  for (const track of ordered) {
    const artist = key(track.artist), song = identity(track);
    if (songs.has(song) || (artistCounts.get(artist) || 0) >= 2) continue;
    songs.add(song); artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1); result.push(track);
    if (result.length >= Math.min(20, Math.floor(originals.length / 3))) break;
  }
  return result;
}
