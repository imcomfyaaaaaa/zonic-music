const artistKey = track => String(track?.artist || '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const finite = value => Number.isFinite(value) ? Math.max(0, value) : 0;

// Build a complete permutation so native background playback needs no web timer.
// Repeated queue entries remain intentional; only their spacing changes.
export function smartShuffle(tracks, state, previous = null, random = Math.random, now = Date.now()) {
  const remaining = [...tracks], result = [], history = state.history || [];
  const known = new Map((state.tracks || []).map(t => [t.id, t]));
  const recentIds = [previous?.id, ...history].filter(Boolean).slice(0, 8);
  const recentArtists = [artistKey(previous), ...history.slice(0, 3).map(id => artistKey(known.get(id)))].filter(Boolean);
  while (remaining.length) {
    let candidates = remaining.map((track, index) => ({ track, index }));
    // Relax constraints gradually when a small or artist-heavy library cannot meet them.
    for (let distance = Math.min(4, recentIds.length); distance >= 1; distance--) {
      const fresh = candidates.filter(({ track }) => !recentIds.slice(0, distance).includes(track.id));
      if (fresh.length) { candidates = fresh; break; }
    }
    for (let distance = Math.min(2, recentArtists.length); distance >= 1; distance--) {
      const varied = candidates.filter(({ track }) => !artistKey(track) || !recentArtists.slice(0, distance).includes(artistKey(track)));
      if (varied.length) { candidates = varied; break; }
    }
    const weights = candidates.map(({ track }) => {
      const stats = state.stats?.[track.id] || {}, rank = history.indexOf(track.id);
      // Bounded penalties avoid permanently burying old favorites or previously skipped tracks.
      const familiarity = 1 / Math.sqrt(1 + Math.min(100, finite(stats.plays)) / 4);
      const recency = rank < 0 ? 1 : .25 + .75 * Math.min(1, rank / 20);
      const ageDays = Math.max(0, now - finite(stats.lastSkippedAt)) / 86400000;
      const skipPenalty = stats.lastSkippedAt ? 1 / (1 + Math.min(3, finite(stats.skips)) * Math.exp(-ageDays / 7)) : 1;
      const preference = state.liked?.includes(track.id) ? 1.5 : 1;
      return Math.max(.02, preference * familiarity * recency * skipPenalty);
    });
    let draw = Math.max(0, Math.min(.999999999, Number(random()) || 0)) * weights.reduce((a, b) => a + b, 0);
    let chosen = candidates.length - 1;
    for (let i = 0; i < weights.length; i++) { draw -= weights[i]; if (draw < 0) { chosen = i; break; } }
    const next = remaining.splice(candidates[chosen].index, 1)[0]; result.push(next);
    recentIds.unshift(next.id); recentIds.length = Math.min(8, recentIds.length);
    const artist = artistKey(next); if (artist) recentArtists.unshift(artist);
    recentArtists.length = Math.min(3, recentArtists.length);
  }
  return result;
}

export function recordEarlySkip(state, track, listened, duration, now = Date.now()) {
  if (!track || track.isLive || track.kind === 'radio' || !Number.isFinite(listened) || listened < 2) return false;
  const threshold = Math.min(30, Number.isFinite(duration) && duration > 0 ? duration / 4 : 30);
  if (listened >= threshold) return false;
  const stats = state.stats[track.id] ||= { seconds: 0, plays: 0 };
  stats.skips = Math.min(1000, finite(stats.skips) + 1); stats.lastSkippedAt = now;
  return true;
}
