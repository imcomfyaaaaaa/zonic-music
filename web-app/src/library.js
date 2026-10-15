// Copyright 2026. New web interface for Musify, GPL-3.0-or-later.
export const emptyLibrary = () => ({ version: 1, tracks: [], playlists: [], folders: [], liked: [], history: [], stats: {}, months: {}, artistFavorites: [], queue: { ids: [], index: -1, position: 0 }, settings: { volume: 0.8, repeat: false, repeatOne: false, shuffle: false, smartShuffle: false, localAI: true, autoPlaylistSync: true, tv: false, sponsorBlock: false, offline: false, autoplay: false, quality: 'high', sort: 'default', language: 'en', theme: 'dark', accent: '#d6f374', dynamicColor: true, proxy: false, proxyUrl: '', eq: [0, 0, 0, 0, 0], eqEnabled: false } });
export function safeUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function safeArtwork(value) {
  if (typeof value === 'string' && value.length < 600000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  return safeUrl(value);
}
export function validateBackup(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.tracks) || !Array.isArray(value.playlists)) throw new Error('This is not a Musify web library backup.');
  if (value.tracks.length > 50000 || value.playlists.length > 5000) throw new Error('Backup is too large.');
  const tracks = value.tracks.map(t => {
    if (typeof t.id !== 'string' || !t.id || ['__proto__', 'constructor', 'prototype'].includes(t.id) || t.id.length > 200 || typeof t.title !== 'string' || !['local', 'url', 'radio', 'youtube'].includes(t.kind)) throw new Error('Invalid track in backup.');
    if (['url', 'radio'].includes(t.kind) && !safeUrl(t.url)) throw new Error('Invalid audio URL in backup.');
    if (t.kind === 'youtube' && (!/^[a-zA-Z0-9_-]{11}$/.test(t.ytid) || t.id !== 'yt:' + t.ytid)) throw new Error('Invalid YouTube track in backup.');
    return { ...(t.recommendation && typeof t.recommendation.seedId === 'string' ? { recommendation: { seedId: t.recommendation.seedId.slice(0, 200), seedTitle: String(t.recommendation.seedTitle || '').slice(0, 500), method: t.recommendation.method === 'ai' ? 'ai' : 'related' } } : {}), id: t.id, title: t.title.slice(0, 500), artist: String(t.artist || '').slice(0, 500), kind: t.kind, ytid: t.ytid, isLive: t.isLive === true, artistId: typeof t.artistId === 'string' ? t.artistId : '', duration: Number.isFinite(t.duration) ? t.duration : null, addedAt: Number.isFinite(t.addedAt) ? t.addedAt : 0, downloaded: t.downloaded === true, url: ['local', 'youtube'].includes(t.kind) ? '' : safeUrl(t.url), artwork: safeUrl(t.artwork), filename: String(t.filename || '').slice(0, 500) };
  });
  const ids = new Set(tracks.map(t => t.id));
  if (ids.size !== tracks.length) throw new Error('Duplicate track identifiers in backup.');
  const playlists = value.playlists.map(p => {
    if (typeof p.id !== 'string' || typeof p.name !== 'string' || !Array.isArray(p.tracks)) throw new Error('Invalid playlist in backup.');
    return { id: p.id.slice(0, 200), name: p.name.slice(0, 120), tracks: [...new Set(p.tracks.filter(id => ids.has(id)))], folderId: typeof p.folderId === 'string' ? p.folderId.slice(0, 200) : '', artwork: safeArtwork(p.artwork), source: safeUrl(p.source), pinned: p.pinned === true, lastSyncedAt: Number.isFinite(p.lastSyncedAt) && p.lastSyncedAt > 0 ? p.lastSyncedAt : 0 };
  });
  if (new Set(playlists.map(p => p.id)).size !== playlists.length) throw new Error('Duplicate playlist identifiers.');
  const clean = emptyLibrary();
  clean.tracks = tracks; clean.playlists = playlists;
  clean.folders = Array.isArray(value.folders) ? value.folders.filter(f => typeof f.id === 'string' && typeof f.name === 'string').map(f => ({ id: f.id.slice(0, 200), name: f.name.slice(0, 120) })) : [];
  clean.artistFavorites = Array.isArray(value.artistFavorites) ? value.artistFavorites.filter(a => typeof a.id === 'string' && /^UC[\w-]+$/.test(a.id)).map(a => ({ id: a.id, name: String(a.name).slice(0, 200), artwork: safeUrl(a.artwork) })) : [];
  const queueTracks = Array.isArray(value.queue?.tracks) ? validateBackup({ version: 1, tracks: value.queue.tracks, playlists: [] }).tracks : [];
  const queueIds = new Set([...ids, ...queueTracks.map(t => t.id)]);
  clean.queue = { ids: Array.isArray(value.queue?.ids) ? value.queue.ids.filter(id => queueIds.has(id)) : [], tracks: queueTracks, index: Number.isInteger(value.queue?.index) ? value.queue.index : -1, position: Number.isFinite(value.queue?.position) ? Math.max(0, value.queue.position) : 0 };
  clean.liked = Array.isArray(value.liked) ? [...new Set(value.liked.filter(id => ids.has(id)))] : [];
  clean.history = Array.isArray(value.history) ? value.history.filter(id => ids.has(id)).slice(0, 100) : [];
  if (value.stats && typeof value.stats === 'object') for (const [id, s] of Object.entries(value.stats)) {
    if (ids.has(id) && s && Number.isFinite(s.seconds) && s.seconds >= 0 && Number.isFinite(s.plays) && s.plays >= 0) clean.stats[id] = { seconds: s.seconds, plays: s.plays, skips: Number.isFinite(s.skips) ? Math.max(0, Math.min(1000, s.skips)) : 0, lastSkippedAt: Number.isFinite(s.lastSkippedAt) ? Math.max(0, s.lastSkippedAt) : 0 };
  }
  for (const [key, month] of Object.entries(value.months || {})) {
    if (!/^\d{4}-\d{2}$/.test(key) || !month || !Number.isFinite(month.totalSeconds) || month.totalSeconds < 0) continue;
    const songs = {};
    for (const [id, s] of Object.entries(month.songs || {})) if (ids.has(id) && Number.isFinite(s.seconds) && s.seconds >= 0) songs[id] = { seconds: s.seconds, plays: Number.isFinite(s.plays) ? Math.max(0, s.plays) : 0 };
    clean.months[key] = { totalSeconds: month.totalSeconds, songs };
  }
  const s = value.settings || {};
  clean.settings = { ...clean.settings, volume: Number.isFinite(s.volume) ? Math.max(0, Math.min(1, s.volume)) : .8, tv: s.tv === true, repeat: s.repeat === true, repeatOne: s.repeatOne === true, shuffle: s.shuffle === true, smartShuffle: s.shuffle === true && s.smartShuffle === true, localAI: s.localAI !== false, autoPlaylistSync: s.autoPlaylistSync !== false, sponsorBlock: s.sponsorBlock === true, offline: s.offline === true, autoplay: s.autoplay === true, proxy: s.proxy === true, proxyUrl: safeUrl(s.proxyUrl), quality: ['low', 'medium', 'high'].includes(s.quality) ? s.quality : 'high', sort: ['default', 'title', 'artist', 'added'].includes(s.sort) ? s.sort : 'default', theme: ['dark', 'light', 'system', 'black'].includes(s.theme) ? s.theme : 'dark', language: /^[a-z]{2}$/.test(s.language) ? s.language : 'en', accent: /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : '#d6f374', dynamicColor: s.dynamicColor !== false, eqEnabled: s.eqEnabled === true, eq: Array.isArray(s.eq) && s.eq.length === 5 ? s.eq.map(g => Number.isFinite(g) ? Math.max(-12, Math.min(12, g)) : 0) : [0, 0, 0, 0, 0] };
  clean.settings.updateRepository = typeof s.updateRepository === 'string' && /^[\w.-]+\/[\w.-]+$/.test(s.updateRepository) ? s.updateRepository : '';
  clean.settings.autoUpdates = s.autoUpdates === true;
  return clean;
}
export function sortTracks(tracks, sort) {
  if (sort === 'default') return tracks;
  return [...tracks].sort((a, b) => sort === 'added' ? (b.addedAt || 0) - (a.addedAt || 0) : String(a[sort] || '').localeCompare(String(b[sort] || '')));
}
export function eqPreset(name, count = 5) {
  return Array.from({ length: count }, (_, i) => {
    const p = count > 1 ? i / (count - 1) : 0;
    switch (name) {
      case 'bassBoost': return p < .33 ? 8 : p < .66 ? 3 : -2;
      case 'trebleBoost': return p < .33 ? -2 : p < .66 ? 2 : 8;
      case 'vocal': return p < .2 ? 2 : p < .5 ? 6 : p < .8 ? 4 : 1;
      case 'rock': return p < .25 ? 7 : p < .5 ? 2 : p < .75 ? 4 : 6;
      case 'pop': return p < .3 ? 3 : p < .6 ? 4 : 2;
      case 'electronic': return p < .2 ? 9 : p < .5 ? -1 : p < .8 ? 3 : 7;
      default: return 0;
    }
  });
}
export function migrateMusify(raw) {
  const result = emptyLibrary(), seen = new Map();
  const convert = s => {
    const ytid = String(s?.ytid || ''); if (!/^[a-zA-Z0-9_-]{11}$/.test(ytid)) return null;
    const id = 'yt:' + ytid;
    if (!seen.has(id)) { const t = { id, ytid, title: String(s.title || ''), artist: String(s.artist || ''), artistId: s.artistId, artwork: safeUrl(s.highResImage || s.image || s.lowResImage), kind: 'youtube', duration: Number.isFinite(s.duration) ? s.duration : null }; seen.set(id, t); result.tracks.push(t); }
    return id;
  };
  for (const s of raw.likedSongs || []) { const id = convert(s); if (id) result.liked.push(id); }
  for (const s of raw.recentlyPlayedSongs || []) { const id = convert(s); if (id) result.history.push(id); }
  const addPlaylist = (p, folderId = '') => {
    if (!p || typeof p !== 'object') return;
    const id = String(p.ytid || crypto.randomUUID()); if (result.playlists.some(x => x.id === id)) return;
    const ids = (p.list || []).map(convert).filter(Boolean);
    result.playlists.push({ id, name: String(p.title || 'Imported playlist'), tracks: ids, folderId, artwork: safeUrl(p.image), source: /^PL[\w-]+$/.test(id) ? `https://www.youtube.com/playlist?list=${id}` : '', pinned: (raw.pinnedPlaylistIds || []).includes(id) });
  };
  for (const p of raw.customPlaylists || []) addPlaylist(p);
  for (const p of raw.likedPlaylists || []) { if (p.isArtist || p.type === 'artist') { if (p.ytid) result.artistFavorites.push({ id: p.ytid, name: p.title, artwork: p.image }); } else addPlaylist(p); }
  for (const f of raw.playlistFolders || []) { const id = String(f.id || crypto.randomUUID()); result.folders.push({ id, name: String(f.name || 'Imported folder') }); for (const p of f.playlists || []) { addPlaylist(p, id); const found = result.playlists.find(x => x.id === p.ytid); if (found) found.folderId = id; } }
    const stats = raw.wrappedListeningStats || {};
  const months = { ...(stats.history || {}), ...(stats.currentMonthKey ? { [stats.currentMonthKey]: stats.currentMonth } : {}) };
  for (const [key, m] of Object.entries(months)) { if (!m) continue; const songs = {}; for (const s of Object.values(m.songs || {})) { const id = convert(s); if (id) songs[id] = { seconds: s.seconds || s.listenedSeconds || s.totalSeconds || 0, plays: s.playCount || 0 }; } result.months[key] = { totalSeconds: m.totalSeconds || 0, songs }; }
  return validateBackup(result);
}
export function nextIndex(index, length, repeat, shuffle, random = Math.random) {
  if (!length) return -1;
  if (shuffle && length > 1) { const n = Math.floor(random() * (length - 1)); return n >= index ? n + 1 : n; }
  if (index + 1 < length) return index + 1;
  return repeat ? 0 : -1;
}
export function parseSpotifyCsv(input) {
  const rows = []; let row = [], field = '', quoted = false;
  input = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') { if (quoted && input[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(field.trim()); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && input[i + 1] === '\n') i++; row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) throw new Error('CSV contains an unclosed quote.');
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  const headers = (rows.shift() || []).map(s => s.toLowerCase());
  const title = headers.findIndex(s => ['track name', 'track', 'song', 'title', 'name'].includes(s));
  const artist = headers.findIndex(s => ['artist name(s)', 'artist name', 'artist', 'artists'].includes(s));
  if (title < 0 || artist < 0) throw new Error('CSV must have track name and artist columns.');
  return rows.filter(r => r[title] && r[artist]).map(r => ({ title: r[title], artist: r[artist] }));
}
export function openLibraryDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('musify-web', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('files'); request.result.createObjectStore('state'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function dbRead(db, store, key) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
export function dbWrite(db, store, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Storage transaction failed.'));
  });
}
