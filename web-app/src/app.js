import { icon, decorateButtons } from './icons.js';
import { rankOnDevice } from './local-ai.js';
import { blendRecommendations, discoverRecommendations } from './recommendations.js';
import { smartShuffle, recordEarlySkip } from './smart-shuffle.js';
import { emptyLibrary, safeUrl, validateBackup, nextIndex, openLibraryDatabase, dbRead, dbWrite, parseSpotifyCsv, sortTracks } from './library.js';
import { api, streamUrl } from './sources.js';
import { nativeAudio, nativeRequest, isNative, isTelevision as detectedTelevision, isAuto as detectedAuto } from './native.js';
import { loadLanguages } from './i18n.js';
import { Features } from './features.js';
import { renderSettings } from './ui/pages.js';
import { AudioPreparation } from './audio-preparation.js';
import { youtubePlaylistId, mergeImportedLikes, isLikedSongsPlaylist } from './playlist-sync.js';
import { randomId } from './id.js';
import Hls from './hls.js';
const $ = s => document.querySelector(s);
let isTelevision = detectedTelevision;
let isAuto = detectedAuto;
function setQueueOpen(open) { document.body.classList.toggle('queue-open', open); $('.queue-rail').inert = !open; $('#queue-toggle').setAttribute('aria-expanded', String(open)); if (open) $('#queue-close').focus(); else $('#queue-toggle').focus(); }
$('#queue-toggle').onclick = () => setQueueOpen(!document.body.classList.contains('queue-open'));
$('#queue-close').onclick = $('#queue-scrim').onclick = () => setQueueOpen(false);
$('.queue-rail').addEventListener('click', event => { if (event.target.closest('[data-view]')) setQueueOpen(false); });
function setPlayerExpanded(open) { document.body.classList.toggle('player-expanded', open); if (!open) document.body.classList.remove('lyrics-fullscreen'); $('#player-expand').setAttribute('aria-expanded', String(open)); $('#player-expand').setAttribute('aria-label', open ? 'Close expanded player' : 'Expand music player'); $('#player-expand').textContent = open ? '⌄' : '↗'; if (open) loadLyricsPreview(); }
$('#player-expand').onclick = () => setPlayerExpanded(!document.body.classList.contains('player-expanded'));
$('.player').addEventListener('click', event => {
  if (document.body.classList.contains('player-expanded') || event.target.closest('button,input,a,select')) return;
  setPlayerExpanded(true);
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (document.body.classList.contains('queue-open')) { event.preventDefault(); event.stopImmediatePropagation(); setQueueOpen(false); } else if (document.body.classList.contains('lyrics-fullscreen')) { event.preventDefault(); event.stopImmediatePropagation(); document.body.classList.remove('lyrics-fullscreen'); } else if (document.body.classList.contains('player-expanded')) { event.preventDefault(); event.stopImmediatePropagation(); $('#player-expand').click(); } } }, true);
decorateButtons();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function tvRemoteUrl(value) {
  try {
    const url = new URL(value.trim());
    const parts = url.hostname.split('.').map(Number);
    const privateIp = parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255) && (parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
    return url.protocol === 'http:' && privateIp && url.port && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash ? url.href : '';
  } catch { return ''; }
}
const audio = $('#audio');
const audioPreparation = new AudioPreparation();
let db, state = emptyLibrary(), stations = [], view = 'home', query = '', queue = [], index = -1, current = null, blobUrl = '', context, filters = [], playToken = 0, sleepTimeout, saveChain = Promise.resolve(), toastTimeout;
let onlineResults = [], onlineQuery = '', searching = false, searchGeneration = 0, segments = [], lyricsText = '', spotifyImporting = false;
let radioResults = [], radioQuery = '', radioGenre = 'All', radioLoading = false, radioLoaded = false, radioError = '', radioGeneration = 0, radioTimer;
let searchTimer, searchController;
let homeZone = 'All';
let features, endOfSongTimer = false;
if (location.pathname.endsWith('/settings.html')) view = 'settings';
let routedView = view;
window.addEventListener('popstate', event => {
  if (!features) return;
  view = event.state?.zonicView || (location.pathname.endsWith('/settings.html') ? 'settings' : 'home');
  routedView = view; query = ''; $('#search').value = ''; render();
});
let sessionSeconds = 0, sessionCounted = false;
let fileBackend = false;
let tvRemoteDetails = null;
function absorbLikedPlaylists() {
  let changed = false;
  for (const playlist of state.playlists) if (isLikedSongsPlaylist(playlist.name)) {
    const liked = mergeImportedLikes(state.liked, playlist.name, playlist.tracks);
    if (liked.length !== state.liked.length) { state.liked = liked; changed = true; }
    if (!playlist.hidden) { playlist.hidden = true; changed = true; }
  }
  return changed;
}
let hls;
let pendingResumePosition = null;
let lyricsPreviewTrack = '', lyricsPreviewLoading = false, syncedLyrics = [], activeLyricIndex = -1;
let lyricsTimingEstimated = false;
function timedLyrics(raw, duration) {
  const source = String(raw || '').split(/\r?\n/), timed = [];
  for (const row of source) {
    const stamps = [...row.matchAll(/\[(\d{1,2}):(\d{2}(?:\.\d+)?)\]/g)];
    const text = row.replace(/\[[^\]]+\]/g, '').trim();
    if (text && stamps.length) for (const stamp of stamps) timed.push({ time: +stamp[1] * 60 + +stamp[2], text });
  }
  if (timed.length) return timed.sort((a, b) => a.time - b.time);
  const lines = source.map(line => line.trim()).filter(line => line && !line.startsWith('©'));
  const length = Number.isFinite(duration) && duration > 20 ? duration : 180, start = Math.min(12, length * .06), span = Math.max(1, length - start - Math.min(10, length * .04));
  return lines.map((text, index) => ({ time: start + span * index / Math.max(1, lines.length), text, estimated: true }));
}
function renderSyncedLyrics() {
  const preview = $('#lyrics-preview');
  if (!preview) return;
  preview.innerHTML = syncedLyrics.length ? syncedLyrics.map((line, index) => `<button class="synced-lyric-line" data-lyric-time="${line.time}" data-lyric-index="${index}">${esc(line.text)}</button>`).join('') : '<span class="lyrics-unavailable">No lyrics preview is available for this song.</span>';
  preview.classList.toggle('estimated', lyricsTimingEstimated);
  preview.setAttribute('aria-label', lyricsTimingEstimated ? 'Lyrics with estimated timing' : 'Synchronized lyrics');
  activeLyricIndex = -1; updateSyncedLyrics(activeAudio.currentTime || 0, false);
}
function updateSyncedLyrics(position, scroll = true) {
  if (!syncedLyrics.length) return;
  position += (state.settings.lyricsOffsetMs || 0) / 1000;
  let index = -1;
  for (let i = 0; i < syncedLyrics.length; i++) { if (syncedLyrics[i].time <= position + .15) index = i; else break; }
  if (index === activeLyricIndex) return;
  activeLyricIndex = index;
  document.querySelectorAll('[data-lyric-index]').forEach(line => line.classList.toggle('active', +line.dataset.lyricIndex === index));
  if (scroll && index >= 0 && document.body.classList.contains('player-expanded')) {
    const preview = $('#lyrics-preview'), line = document.querySelector(`[data-lyric-index="${index}"]`);
    if (preview && line) {
      const lineTop = line.getBoundingClientRect().top - preview.getBoundingClientRect().top + preview.scrollTop;
      preview.scrollTo({ top: Math.max(0, lineTop - preview.clientHeight * .42), behavior: 'smooth' });
    }
  }
}
async function fetchSyncedLyrics(track) {
  const duration = Math.round(activeAudio.duration || track.duration || 0);
  const params = new URLSearchParams({ artist_name: String(track.artist || '').slice(0, 200), track_name: String(track.title || '').slice(0, 300) });
  if (duration > 0) params.set('duration', String(duration));
  try {
    const response = await fetch(`https://lrclib.net/api/get?${params}`, { signal: AbortSignal.timeout(7000) });
    if (response.ok) { const result = await response.json(); if (result.syncedLyrics) return result.syncedLyrics; }
  } catch {}
  try {
    params.delete('duration');
    const response = await fetch(`https://lrclib.net/api/search?${params}`, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return '';
    const results = await response.json(), matches = Array.isArray(results) ? results.filter(result => result.syncedLyrics) : [];
    matches.sort((a, b) => duration > 0 ? Math.abs((a.duration || 0) - duration) - Math.abs((b.duration || 0) - duration) : 0);
    return matches[0]?.syncedLyrics || '';
  } catch { return ''; }
}
async function loadLyricsPreview() {
  const preview = $('#lyrics-preview');
  if (!preview || !current) { if (preview) preview.textContent = 'Play a song to see a lyrics preview.'; return; }
  if (lyricsPreviewTrack === current.id || lyricsPreviewLoading || current.kind === 'radio') return;
  lyricsPreviewLoading = true; const track = current; syncedLyrics = []; activeLyricIndex = -1; lyricsTimingEstimated = false; preview.textContent = 'Finding synchronized lyrics…';
  try {
    const synchronized = await fetchSyncedLyrics(track);
    const data = synchronized ? { lyrics: synchronized } : await api('lyrics', { artist: track.artist, title: track.title });
    if (current?.id !== track.id) return;
    syncedLyrics = timedLyrics(data.lyrics, activeAudio.duration || track.duration);
    lyricsTimingEstimated = !synchronized;
    renderSyncedLyrics();
    lyricsPreviewTrack = track.id;
  } catch { if (current?.id === track.id) preview.textContent = 'Lyrics are unavailable right now.'; }
  finally { lyricsPreviewLoading = false; if (current && current.id !== track.id && document.body.classList.contains('player-expanded')) loadLyricsPreview(); }
}
window.groveBack = () => { const open = document.querySelector('dialog[open]'); if (open) { open.close('cancel'); return true; } if (document.body.classList.contains('lyrics-fullscreen')) { document.body.classList.remove('lyrics-fullscreen'); return true; } if (document.body.classList.contains('player-expanded')) { setPlayerExpanded(false); return true; } if (query) { query = ''; $('#search').value = ''; render(); return true; } if (view !== 'home') { view = 'home'; render(); return true; } return false; };
function toast(message) { $('#toast').textContent = message; $('#toast').style.display = 'block'; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('#toast').style.display = 'none', 5000); }
function save() { state.queue = { ids: queue.map(t => t.id), tracks: [...new Map(queue.map(t => [t.id, t])).values()], index, position: pendingResumePosition ?? activeAudio.currentTime ?? 0 }; const snapshot = structuredClone(state); saveChain = saveChain.catch(() => {}).then(async () => { await dbWrite(db, 'state', 'library', snapshot); if (isNative) await nativeRequest('library', snapshot); }); saveChain.catch(() => toast('Could not save your library. Check available storage.')); return saveChain; }
const artworkUrl = (t, highResolution = false) => {
  if (!t) return '';
  if (highResolution) return safeUrl(t.highResArtwork) || safeUrl(t.highResImage) || safeUrl(t.image) || (t.ytid ? `https://img.youtube.com/vi/${encodeURIComponent(t.ytid)}/maxresdefault.jpg` : '') || safeUrl(t.artwork);
  return safeUrl(t.artwork) || safeUrl(t.image) || safeUrl(t.lowResImage);
};
const art = (t, highResolution = false) => {
  const source = artworkUrl(t, highResolution), fallback = safeUrl(t?.artwork) || (t?.ytid ? `https://img.youtube.com/vi/${encodeURIComponent(t.ytid)}/hqdefault.jpg` : '');
  return source ? `<img src="${esc(source)}" ${highResolution && fallback && fallback !== source ? `data-art-fallback="${esc(fallback)}"` : ''} alt="" loading="${highResolution ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer">` : icon(t?.kind === 'radio' ? 'radio' : 'music');
};
document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.dataset.artFallback) return;
  const fallback = image.dataset.artFallback;
  delete image.dataset.artFallback;
  image.src = fallback;
}, true);
const time = n => !Number.isFinite(n) ? 'LIVE' : `${Math.floor(Math.max(0, n) / 60)}:${String(Math.floor(Math.max(0, n) % 60)).padStart(2, '0')}`;
const trackById = id => state.tracks.find(t => t.id === id) || stations.find(t => t.id === id) || radioResults.find(t => t.id === id) || onlineResults.find(t => t.id === id);
function top(title, description) { return `<div class="page-top"><span class="eyebrow">YOUR MUSIC, YOUR SPACE</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>`; }
function cards(tracks) { return `<div class="cards">${tracks.map(t => `<div class="card"><button class="card-main" data-play="${esc(t.id)}"><div class="cover">${art(t)}<span class="card-play" aria-hidden="true">▶</span></div><strong>${esc(t.title)}</strong></button><button class="card-artist artist-link" data-artist-track="${esc(t.id)}">${esc(t.artist || 'Your library')}</button></div>`).join('')}</div>`; }
function radioCards(tracks) { return `<div class="radio-grid">${tracks.map(t => `<div class="radio-tile"><button class="radio-tile-play" data-play="${esc(t.id)}"><div class="cover">${art(t)}</div><span><strong>${esc(t.title)}</strong><small>${esc(t.artist)}${t.countrycode ? ' · ' + esc(t.countrycode) : ''}</small></span><em>LIVE</em></button><button class="radio-tile-like ${state.liked.includes(t.id) ? 'liked' : ''}" data-like="${esc(t.id)}" aria-label="${state.liked.includes(t.id) ? 'Unlike' : 'Like'} ${esc(t.title)}">${state.liked.includes(t.id) ? '♥' : '♡'}</button></div>`).join('')}</div>`; }
function rows(tracks, queueView = false, playlistEdit = '') {
  if (view === 'library') tracks = sortTracks(tracks, state.settings.sort);
  if (!tracks.length) return `<div class="empty"><h3>A little room for your favorites.</h3><p>Import your music files, add an audio link, or explore radio to get started.</p><button class="primary" data-action="import">Import music</button> <button class="secondary" data-action="url">Add audio link</button></div>`;
  return `<div class="rows">${tracks.map((t, n) => `<div class="track ${current?.id === t.id ? 'current' : ''}" data-play-row><span class="number">${String(n + 1).padStart(2, '0')}</span><div class="cover">${art(t)}${t.downloaded ? `<span class="downloaded-badge" title="Downloaded · Available offline" aria-label="Downloaded and available offline">${icon('downloaded')}</span>` : ''}</div><div class="track-name"><button class="track-title" ${queueView ? `data-queue-play="${n}"` : `data-play="${esc(t.id)}"`}><strong>${esc(t.title)}</strong></button><button class="track-artist artist" data-artist-track="${esc(t.id)}">${esc(t.artist || (t.kind === 'local' ? 'Offline audio' : 'Audio link'))}${t.recommendation ? (t.recommendation.method === 'ai' ? ' · ✦ On-device AI pick' : ' · ✦ Recommended') : ''}</button></div><button data-like="${esc(t.id)}" class="${state.liked.includes(t.id) ? 'liked' : ''}" aria-label="${state.liked.includes(t.id) ? 'Unlike' : 'Like'} ${esc(t.title)}">${state.liked.includes(t.id) ? '♥' : '♡'}</button>${queueView ? `<div class="queue-actions"><button data-up="${n}" aria-label="Move up" ${n === 0 ? 'disabled' : ''}>↑</button><button data-remove-queue="${n}" aria-label="Remove from queue">×</button></div>` : playlistEdit ? `<div class="queue-actions playlist-order-actions"><button data-playlist-up="${n}" data-playlist-id="${esc(playlistEdit)}" aria-label="Move ${esc(t.title)} up" ${n === 0 ? 'disabled' : ''}>↑</button><button data-playlist-down="${n}" data-playlist-id="${esc(playlistEdit)}" aria-label="Move ${esc(t.title)} down" ${n === tracks.length - 1 ? 'disabled' : ''}>↓</button><button data-menu="${esc(t.id)}" aria-label="Actions for ${esc(t.title)}">＋</button></div>` : `<button data-menu="${esc(t.id)}" aria-label="Actions for ${esc(t.title)}">＋</button>`}</div>`).join('')}</div>`;
}
function filtered(tracks) { return tracks.filter(t => `${t.title} ${t.artist}`.toLowerCase().includes(query.toLowerCase())); }
let carTab = 'player';
function renderCarUI() {
  const timeStr = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
  const elapsed = time(activeAudio.currentTime);
  const dur = time(activeAudio.duration);
  const percent = activeAudio.duration ? Math.min(100, Math.max(0, (activeAudio.currentTime / activeAudio.duration) * 100)) : 0;
  const isPlaying = !activeAudio.paused && !!current;
  const isLiked = current && state.liked.includes(current.id);

  let bodyHtml = '';
  if (carTab === 'player') {
    const contextLabel = current ? (current.kind === 'radio' ? 'Live Radio' : (isLiked ? 'Liked Songs' : (view.startsWith('playlist:') ? 'Playlist' : 'Zonic Library'))) : 'Zonic Auto';
    bodyHtml = `
      <div class="car-player-dashboard">
        <div class="car-art-wrap">
          <div class="car-art-img">${art(current, true)}</div>
        </div>
        <div class="car-controls-pane">
          <div class="car-meta-zone">
            <span class="car-context-tag">${contextLabel}</span>
            <h1 class="car-track-title">${esc(current?.title || 'Nothing Playing')}</h1>
            <p class="car-track-artist">${esc(current?.artist || 'Tap a tab above to choose music')}</p>
          </div>
          <div class="car-timeline-bar">
            <span class="car-time-label" id="car-elapsed">${elapsed}</span>
            <input class="car-scrub-input" id="car-seek" type="range" min="0" max="100" value="${percent}" aria-label="Seek">
            <span class="car-time-label" id="car-duration">${dur}</span>
          </div>
          <div class="car-transport-row">
            <button class="car-btn car-btn-secondary ${state.settings.shuffle ? 'active' : ''}" data-car-action="shuffle" aria-label="Shuffle">${state.settings.smartShuffle ? '✦' : '⤨'}</button>
            <button class="car-btn car-btn-skip" data-car-action="prev" aria-label="Previous">⏮</button>
            <button class="car-btn car-btn-play" data-car-action="play" aria-label="${isPlaying ? 'Pause' : 'Play'}">${isPlaying ? 'Ⅱ' : '▶'}</button>
            <button class="car-btn car-btn-skip" data-car-action="next" aria-label="Next">⏭</button>
            <button class="car-btn car-btn-secondary ${isLiked ? 'liked' : ''}" data-car-action="like" aria-label="Like">${isLiked ? '♥' : '♡'}</button>
          </div>
        </div>
      </div>
    `;
  } else if (carTab === 'liked') {
    const likedTracks = state.liked.map(trackById).filter(Boolean);
    bodyHtml = `<div class="car-list-container">${likedTracks.length ? likedTracks.map(t => `
      <div class="car-track-row ${current?.id === t.id ? 'current' : ''}" data-car-play="${esc(t.id)}">
        <div class="car-row-cover">${art(t)}</div>
        <div class="car-row-info"><div class="car-row-title">${esc(t.title)}</div><div class="car-row-artist">${esc(t.artist || 'Unknown')}</div></div>
        <button class="car-row-action" data-car-play="${esc(t.id)}">▶</button>
      </div>`).join('') : '<p style="text-align:center;font-size:20px;padding:40px 0;color:#8888a0;">No liked songs yet.</p>'}</div>`;
  } else if (carTab === 'recent') {
    const recent = state.history.map(trackById).filter(Boolean).slice(0, 30);
    bodyHtml = `<div class="car-list-container">${recent.length ? recent.map(t => `
      <div class="car-track-row ${current?.id === t.id ? 'current' : ''}" data-car-play="${esc(t.id)}">
        <div class="car-row-cover">${art(t)}</div>
        <div class="car-row-info"><div class="car-row-title">${esc(t.title)}</div><div class="car-row-artist">${esc(t.artist || 'Unknown')}</div></div>
        <button class="car-row-action" data-car-play="${esc(t.id)}">▶</button>
      </div>`).join('') : '<p style="text-align:center;font-size:20px;padding:40px 0;color:#8888a0;">No listening history yet.</p>'}</div>`;
  } else if (carTab === 'playlists') {
    bodyHtml = `<div class="car-list-container">${state.playlists.length ? state.playlists.map(p => `
      <div class="car-track-row" data-car-playlist="${esc(p.id)}">
        <div class="car-row-cover">${icon('music')}</div>
        <div class="car-row-info"><div class="car-row-title">${esc(p.name)}</div><div class="car-row-artist">${p.tracks.length} songs</div></div>
        <button class="car-row-action" data-car-playlist="${esc(p.id)}">▶</button>
      </div>`).join('') : '<p style="text-align:center;font-size:20px;padding:40px 0;color:#8888a0;">No playlists yet.</p>'}</div>`;
  } else if (carTab === 'radio') {
    bodyHtml = `<div class="car-grid-container">${stations.map(t => `
      <div class="car-card-tile" data-car-play="${esc(t.id)}">
        <div class="car-tile-art">${art(t)}</div>
        <div class="car-tile-title">${esc(t.title)}</div>
        <div class="car-tile-subtitle">${esc(t.artist || 'Radio')} · Live</div>
      </div>`).join('')}</div>`;
  } else if (carTab === 'queue') {
    bodyHtml = `<div class="car-list-container">${queue.length ? queue.map((t, n) => `
      <div class="car-track-row ${index === n ? 'current' : ''}" data-car-queue-play="${n}">
        <div class="car-row-cover">${art(t)}</div>
        <div class="car-row-info"><div class="car-row-title">${esc(t.title)}</div><div class="car-row-artist">${esc(t.artist || 'Unknown')}</div></div>
        <button class="car-row-action" data-car-queue-play="${n}">▶</button>
      </div>`).join('') : '<p style="text-align:center;font-size:20px;padding:40px 0;color:#8888a0;">Queue is empty.</p>'}</div>`;
  }

  const miniBar = (carTab !== 'player' && current) ? `
    <div class="car-mini-bar">
      <div class="car-mini-left" data-car-tab="player">
        <div class="car-mini-cover">${art(current)}</div>
        <div class="car-mini-info">
          <div class="car-mini-title">${esc(current.title)}</div>
          <div class="car-mini-artist">${esc(current.artist || 'Zonic')}</div>
        </div>
      </div>
      <div class="car-mini-controls">
        <button class="car-mini-btn-skip" data-car-action="prev" aria-label="Previous">⏮</button>
        <button class="car-mini-btn-play" data-car-action="play" aria-label="${isPlaying ? 'Pause' : 'Play'}">${isPlaying ? 'Ⅱ' : '▶'}</button>
        <button class="car-mini-btn-skip" data-car-action="next" aria-label="Next">⏭</button>
      </div>
    </div>
  ` : '';

  return `
    <div class="car-shell">
      <header class="car-header">
        <div class="car-brand-zone">
          <span class="car-badge">${icon('car')} ANDROID AUTO</span>
          <span class="car-clock">${timeStr}</span>
        </div>
        <nav class="car-tabs" aria-label="Car sections">
          <button class="car-tab ${carTab === 'player' ? 'active' : ''}" data-car-tab="player">${icon('play')} Now Playing</button>
          <button class="car-tab ${carTab === 'liked' ? 'active' : ''}" data-car-tab="liked">${icon('heart')} Liked</button>
          <button class="car-tab ${carTab === 'recent' ? 'active' : ''}" data-car-tab="recent">${icon('history')} Recent</button>
          <button class="car-tab ${carTab === 'playlists' ? 'active' : ''}" data-car-tab="playlists">${icon('library')} Playlists</button>
          <button class="car-tab ${carTab === 'radio' ? 'active' : ''}" data-car-tab="radio">${icon('radio')} Radio</button>
          <button class="car-tab ${carTab === 'queue' ? 'active' : ''}" data-car-tab="queue">${icon('queue')} Queue</button>
        </nav>
      </header>
      <div class="car-body">
        ${bodyHtml}
      </div>
      ${miniBar}
    </div>
  `;
}
function renderTvPlayer() {
  const elapsed = time(activeAudio.currentTime);
  const dur = time(activeAudio.duration);
  const percent = activeAudio.duration ? Math.min(100, Math.max(0, (activeAudio.currentTime / activeAudio.duration) * 100)) : 0;
  const isPlaying = !activeAudio.paused && !!current;
  const isLiked = current && state.liked.includes(current.id);
  const contextLabel = current ? (current.kind === 'radio' ? 'Live Radio' : (isLiked ? 'Liked Songs' : (view.startsWith('playlist:') ? 'Playlist' : 'Zonic TV'))) : 'Android TV';
  const remoteInfo = tvRemoteDetails ? `<div class="tv-remote-badge">📱 Phone remote: <strong>${esc(tvRemoteDetails.url)}</strong> · PIN: <strong>${esc(tvRemoteDetails.pin)}</strong></div>` : '';

  return `
    <div class="tv-leanback-player">
      <button class="tv-close-player" data-tv-action="close-player" aria-label="Close TV player" title="Back to menu">✕</button>
      <div class="tv-player-left">
        <div class="tv-big-cover">${art(current, true)}</div>
        ${remoteInfo}
      </div>
      <div class="tv-player-right">
        <span class="tv-player-context">${contextLabel}</span>
        <h1 class="tv-player-title">${esc(current?.title || 'Nothing Playing')}</h1>
        <p class="tv-player-artist">${esc(current?.artist || 'Choose music from the TV menu')}</p>
        <div class="tv-player-timeline">
          <span class="tv-player-time" id="tv-elapsed">${elapsed}</span>
          <input class="tv-player-seek" id="tv-seek" type="range" min="0" max="100" value="${percent}" aria-label="Seek">
          <span class="tv-player-time" id="tv-duration">${dur}</span>
        </div>
        <div class="tv-player-transport">
          <button class="tv-btn tv-btn-sec ${state.settings.shuffle ? 'active' : ''}" data-tv-action="shuffle" aria-label="Shuffle">${state.settings.smartShuffle ? '✦' : '⤨'}</button>
          <button class="tv-btn tv-btn-skip" data-tv-action="prev" aria-label="Previous">⏮</button>
          <button class="tv-btn tv-btn-play" data-tv-action="play" aria-label="${isPlaying ? 'Pause' : 'Play'}">${isPlaying ? 'Ⅱ' : '▶'}</button>
          <button class="tv-btn tv-btn-skip" data-tv-action="next" aria-label="Next">⏭</button>
          <button class="tv-btn tv-btn-sec ${state.settings.repeat ? 'active' : ''}" data-tv-action="repeat" aria-label="Repeat">↻</button>
          <button class="tv-btn tv-btn-sec ${isLiked ? 'liked' : ''}" data-tv-action="like" aria-label="Like">${isLiked ? '♥' : '♡'}</button>
          <button class="tv-btn tv-btn-sec" data-tv-action="lyrics" aria-label="Lyrics">≋</button>
        </div>
      </div>
    </div>
  `;
}
function render() {
  const tvActive = isTelevision && !isAuto;
  const autoActive = isAuto;
  if (view !== routedView) {
    const page = view === 'settings' ? 'settings.html' : './';
    const url = new URL(page, location.href); url.search = location.search;
    history.pushState({ zonicView: view }, '', url);
    routedView = view;
  }
  document.body.classList.toggle('settings-page', view === 'settings' && !query);
  document.title = view === 'settings' ? 'Settings · Zonic' : (autoActive ? 'Android Auto · Zonic' : (tvActive ? 'Android TV · Zonic' : 'Zonic · Your music, your space'));
  document.body.classList.toggle('artists-page', view === 'artists' && !query);
  const content = $('#content');
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#playlist-nav').innerHTML = state.playlists.filter(p => !p.hidden).map(p => `<button data-view="playlist:${esc(p.id)}" class="${view === 'playlist:' + p.id ? 'active' : ''}">♫ ${esc(p.name)}</button>`).join('');
  if (autoActive && view !== 'settings') {
    content.innerHTML = renderCarUI();
    updatePlayer();
    features?.enhance(view); decorateButtons();
    return;
  }
  if (tvActive && view === 'tv-player') {
    content.innerHTML = renderTvPlayer();
    updatePlayer();
    features?.enhance(view); decorateButtons();
    return;
  }
  if (!query && features?.custom(view)) { features.enhance(view); updatePlayer(); return; }
  if (query) {
    const localMatches = filtered([...state.tracks, ...stations.filter(s => !state.tracks.some(t => t.id === s.id))]);
    const onlineContent = onlineQuery === query ? (onlineResults.length ? rows(onlineResults) : '<p class="search-empty">No songs found. Try a different search.</p>') : state.settings.offline ? '<p class="search-empty">Turn off offline mode to search online.</p>' : '<p class="search-empty">Songs will appear here as you type.</p>';
    content.innerHTML = top('Find your next listen', `Music results for “${query}”. Tap a song to play.`)
      + `<div class="section-heading search-heading"><h2>Songs</h2></div>`
      + (searching ? '<p class="search-status" role="status">Searching for songs…</p>' : '') + onlineContent
      + `<div class="section-heading"><h2>On this device</h2></div>`
      + (localMatches.length ? rows(localMatches) : '<p class="search-empty">No matching songs on this device.</p>');
  }
  else if (view === 'home') {
    const tvPhoneCard = (tvActive && tvRemoteDetails) ? `
      <div class="tv-phone-control-card">
        <div class="tv-phone-control-text">
          <strong>Control Zonic with your phone</strong>
          <p>Connect your phone to Wi-Fi and open <strong>${esc(tvRemoteDetails.url)}</strong></p>
        </div>
        <div class="tv-phone-pin-box">
          <span class="tv-phone-pin-label">Pairing code</span>
          <span class="tv-phone-pin-code">${esc(tvRemoteDetails.pin)}</span>
        </div>
      </div>
    ` : '';
    const recent = state.history.map(trackById).filter(Boolean).slice(0, 8);
    const hour = new Date().getHours(), greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const featured = current || recent[0];
    const zones = ['All', ...new Set(stations.map(t => t.artist).filter(Boolean))];
    const collection = state.tracks.length ? state.tracks : stations;
    const picks = homeZone === 'All' ? collection : stations.filter(t => t.artist === homeZone);
    content.innerHTML = tvPhoneCard + `<div class="home-heading">${top(greeting, 'Jump back in, or find something new.')}<span class="home-date">${new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</span></div>`
      + `<div class="home-feature"><section class="hero"><div class="hero-art cover" aria-hidden="true">${featured ? art(featured) : '<img src="./brand/zonic-mark-512.png" alt="">'}</div><div class="hero-copy"><span class="eyebrow">${featured ? 'NOW FEATURED' : 'WELCOME TO ZONIC'}</span><h2>${esc(featured?.title || 'Your music.\nReady when you are.')}</h2>${featured ? `<button class="hero-artist artist-link" data-artist-track="${esc(featured.id)}">${esc(featured.artist || 'Your library')}</button>` : '<p>Library, radio, and playlists — one place to press play.</p>'}<div class="hero-actions"><button class="primary" ${featured ? `data-play="${esc(featured.id)}"` : 'data-view="browse"'}>${featured ? '▶ Play' : 'Browse music'}</button><button class="secondary" ${featured ? `data-play="${esc(featured.id)}"` : 'data-action="import"'}>${featured ? 'Shuffle' : 'Import music'}</button></div></div></section>`
      + `<section class="discovery-panel"><div class="discovery-heading"><span class="eyebrow">LIVE RADIO</span><h2>On air now <span>●</span></h2></div>${stations.slice(0,3).map(t => `<button class="live-pick" data-play="${esc(t.id)}"><span class="cover">${art(t)}</span><span><strong>${esc(t.title)}</strong><small>${esc(t.artist)} · Live</small></span><span class="live-play">▶</span></button>`).join('')}<button class="discover-all" data-view="radio">See all stations</button></section></div>`
      + `<div class="home-shortcuts" aria-label="Quick access"><button data-view="liked"><span class="shortcut-symbol">♥</span><span><strong>Liked Songs</strong><small>Your favorites</small></span><span class="shortcut-arrow">↗</span></button><button data-view="library"><span class="shortcut-symbol">▤</span><span><strong>Your Library</strong><small>Everything you saved</small></span><span class="shortcut-arrow">↗</span></button><button data-view="browse"><span class="shortcut-symbol">✦</span><span><strong>Browse</strong><small>Find your next listen</small></span><span class="shortcut-arrow">↗</span></button></div>`
      + `<div class="section-heading"><h2>${recent.length ? 'Recently played' : 'Suggested for you'}</h2><button data-view="${recent.length ? 'recent' : 'radio'}">Show all</button></div>`
      + `<div class="music-shelf">${cards(recent.length ? recent : stations.slice(0, 8))}</div>`
      + `<div class="section-heading"><h2>Made for your mood</h2><button data-view="library">Open library</button></div><p class="section-subtitle">Pick a vibe, then press play.</p><div class="zone-chips">${zones.map(z => `<button class="zone-chip ${z === homeZone ? 'active' : ''}" data-zone="${esc(z)}" aria-pressed="${z === homeZone}">${esc(z)}</button>`).join('')}</div>` + cards(picks.slice(0, 18));
  } else if (view === 'browse') {
    content.innerHTML = top('Browse', 'Search songs and artists, or find a station to fit your mood.') + `<div class="zone-chips">${['Night drive', 'Golden hour', 'Deep focus', 'New releases'].map(q => `<button class="zone-chip" data-browse-query="${q}">${q}</button>`).join('')}</div><div class="section-heading"><h2>Popular radio</h2><button data-view="radio">Show all</button></div><div class="music-shelf">${cards(stations.slice(0, 8))}</div><div class="section-heading"><h2>Your music</h2><button data-view="library">Open library</button></div>` + rows(state.tracks.slice(0, 12));
  } else if (view === 'library') {
    const playlistCount = state.playlists.filter(p => !p.hidden).length + 1;
    content.innerHTML = top('Your library', `${playlistCount} playlist${playlistCount === 1 ? '' : 's'} in your collection.`);
  }
  else if (view === 'liked') content.innerHTML = top('Liked songs', 'The ones worth keeping close.') + rows(state.liked.map(trackById).filter(Boolean));
  else if (view === 'radio') content.innerHTML = top('Live radio', 'Find music stations around the world, then press play.')
    + `<div class="radio-browser-panel"><div class="radio-browser-head"><div><span class="settings-card-kicker">POWERED BY RADIO BROWSER</span><h2>Explore live stations</h2></div><span class="radio-live-dot">● Live directory</span></div><label class="radio-search-label" for="radio-search">Search stations</label><div class="radio-search-wrap"><input id="radio-search" type="search" value="${esc(radioQuery)}" placeholder="Station name, like Jazz FM" autocomplete="off"><button data-radio-search>Search</button></div><div class="radio-genres">${['All', 'Pop', 'Rock', 'Jazz', 'Electronic', 'Hip Hop', 'Classical', 'Lofi', 'Country', 'Reggae'].map(genre => `<button class="zone-chip ${radioGenre === genre ? 'active' : ''}" data-radio-genre="${esc(genre)}" aria-pressed="${radioGenre === genre}">${esc(genre)}</button>`).join('')}</div></div>`
    + `<div class="section-heading"><h2>${radioQuery ? 'Search results' : radioGenre === 'All' ? 'Popular music stations' : `${esc(radioGenre)} stations`}</h2><span>${radioResults.length ? `${radioResults.length} stations` : ''}</span></div>`
    + (radioLoading ? '<p class="search-status" role="status">Finding live stations…</p>' : radioError ? `<p class="search-empty" role="status">${esc(radioError)}</p>` : radioLoaded && !radioResults.length ? '<p class="search-empty">No matching music stations. Try another name or genre.</p>' : '')
    + radioCards(radioResults)
    + `<div class="section-heading"><h2>Built-in stations</h2><span>Available when the directory is offline</span></div>` + cards(stations);
  else if (view === 'queue') content.innerHTML = top('Up next', `${queue.length} tracks in this session.`) + rows(queue, true);
  else if (view === 'lyrics') content.innerHTML = top('Words to your soundtrack', current?.title || 'Choose a song first') + `<section class="settings-card"><div class="lyrics">${esc(lyricsText || 'No lyrics loaded.')}</div></section>`;
  else if (view.startsWith('playlist:')) {
    const p = state.playlists.find(p => 'playlist:' + p.id === view);
    if (!p) { view = 'library'; return render(); }
    const protectedYoutube = !!youtubePlaylistId(p.source);
    content.innerHTML = top(p.name, protectedYoutube ? `${p.tracks.length} songs · Synced from YouTube · Songs are protected.` : `${p.tracks.length} tracks in your Zonic playlist.`) + `<div class="section-heading"><div><button class="primary" data-playlist-play="${esc(p.id)}">▶ Play playlist</button> <button data-rename-playlist="${esc(p.id)}">Rename</button>${protectedYoutube ? '' : ` <button data-clean-playlist="${esc(p.id)}">Clean duplicates</button>`}</div><button class="danger" data-delete-playlist="${esc(p.id)}">Delete playlist</button></div>` + rows(p.tracks.map(trackById).filter(Boolean), false, protectedYoutube ? '' : p.id);
  } else if (view === 'recap') {
    const entries = Object.entries(state.stats), seconds = entries.reduce((s, [, v]) => s + v.seconds, 0), plays = entries.reduce((s, [, v]) => s + v.plays, 0);
    content.innerHTML = top('Your listening story', 'Listening totals for this web library, since your first play.') + `<div class="stat-cards"><div class="stat"><strong>${Math.floor(seconds / 60)}</strong><small>Minutes listened</small></div><div class="stat"><strong>${plays}</strong><small>Tracks started</small></div><div class="stat"><strong>${entries.filter(([, s]) => s.seconds > 0).length}</strong><small>Tracks enjoyed</small></div></div><h2>Your most played</h2>` + rows(entries.sort((a, b) => b[1].seconds - a[1].seconds).map(([id]) => trackById(id)).filter(Boolean).slice(0, 10));
  } else if (view === 'settings') {
    const youtubeCount = state.playlists.filter(p => /^https:\/\/(?:www\.|music\.)?youtube\.com\/.*[?&]list=/.test(p.source || '')).length;
    content.innerHTML = renderSettings({ linkedCount: youtubeCount, sponsorBlock: state.settings.sponsorBlock, television: isTelevision, isAuto: isAuto, native: isNative, remote: tvRemoteDetails });
    $('#sleep').value = String(sleepTimeout ? sleepTimeout.minutes : 0);
  }
  updatePlayer();
  features?.enhance(view); decorateButtons();
}
function updatePlayer() {
  document.body.classList.toggle('has-current', !!current);
  $('#now-title').textContent = current?.title || 'Your next favorite awaits';
  $('#now-artist').textContent = current?.artist || (current ? 'Your library' : 'Import music or tune into radio');
  const playlist = view.startsWith('playlist:') ? state.playlists.find(p => 'playlist:' + p.id === view) : null;
  $('#player-context-title').textContent = playlist?.name || (view === 'liked' ? 'Liked Songs' : view === 'queue' ? 'Your Queue' : 'Zonic');
  $('#now-art').innerHTML = art(current, true);
  const upcoming = queue.map((track, position) => ({ track, position })).filter(item => item.position > index).slice(0, 8);
  $('#queue-preview').innerHTML = upcoming.length ? upcoming.map(({ track, position }) => `<button class="queue-preview-track" data-queue-play="${position}"><div class="cover">${art(track)}</div><span><strong>${esc(track.title)}</strong><small>${esc(track.artist || 'Your library')}${track.recommendation ? ' · ✦ Pick' : ''}</small></span></button>`).join('') : `<div class="queue-empty"><span>${icon('music')}</span><p>Your next listen starts here.</p><button data-view="library">Choose some music</button></div>`;
  const palettes = [['#8e80ff', '#ff6b81'], ['#a79cff', '#5b49f0'], ['#ff8a9b', '#7a6bff'], ['#c9c2ff', '#ff5c7a'], ['#6c5cff', '#ff6b81']];
  const palette = palettes[current ? [...current.id].reduce((n, c) => n + c.charCodeAt(0), 0) % palettes.length : 0];
  document.documentElement.style.setProperty('--c1', palette[0]); document.documentElement.style.setProperty('--c2', palette[1]);
  $('#play').textContent = activeAudio.paused ? '▶' : 'Ⅱ'; $('#play').ariaLabel = activeAudio.paused ? 'Play' : 'Pause';
  document.body.classList.toggle('is-playing', !activeAudio.paused && !!current);
  if (document.body.classList.contains('player-expanded') && current && lyricsPreviewTrack !== current.id) loadLyricsPreview();
  $('#now-like').textContent = current && state.liked.includes(current.id) ? '♥' : '♡';
  $('#now-like').classList.toggle('liked', !!current && state.liked.includes(current.id));
  for (const key of ['shuffle', 'repeat']) { $('#' + key).classList.toggle('liked', state.settings[key]); $('#' + key).setAttribute('aria-pressed', state.settings[key]); }
  $('#shuffle').textContent = state.settings.smartShuffle ? '✦' : '⤨'; $('#shuffle').ariaLabel = state.settings.smartShuffle ? 'Smart Shuffle on; turn shuffle off' : state.settings.shuffle ? 'Random shuffle on; enable Smart Shuffle' : 'Shuffle off; enable random shuffle'; $('#shuffle').title = $('#shuffle').ariaLabel;
  const tvActive = isTelevision && !isAuto;
  const autoActive = isAuto;
  document.body.classList.toggle('tv', tvActive);
  document.body.classList.toggle('auto', autoActive);
  decorateButtons();
}
async function ask(title, label, value = '', maxLength = 120) {
  const dialog = $('#dialog'); $('#dialog-title').textContent = title; $('#dialog-label').textContent = label; $('#dialog-input').value = value; dialog.returnValue = '';
  $('#dialog-input').maxLength = maxLength;
  dialog.showModal(); $('#dialog-input').focus();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm' ? $('#dialog-input').value.trim() : null), { once: true }));
}
async function choosePlaylistImportMode(name) {
  const sheet = $('#track-sheet');
  sheet.innerHTML = `<h2>Import ${esc(name)}</h2><p>Choose how this playlist should work in Zonic.</p><div class="playlist-import-choices"><button id="playlist-import-youtube" class="primary"><strong>Keep as YouTube playlist</strong><small>Stays synced. Songs cannot be added or removed.</small></button><button id="playlist-import-zonic"><strong>Copy to Zonic playlist</strong><small>Editable copy. Add or remove songs freely.</small></button></div><button id="playlist-import-cancel">Cancel</button>`;
  decorateButtons(sheet); sheet.showModal();
  return new Promise(resolve => {
    const finish = value => { if (sheet.open) sheet.close(); resolve(value); };
    $('#playlist-import-youtube').onclick = () => finish('youtube');
    $('#playlist-import-zonic').onclick = () => finish('zonic');
    $('#playlist-import-cancel').onclick = () => finish('');
    sheet.addEventListener('cancel', () => resolve(''), { once: true });
  });
}
let audioHeadroom, audioLeveler, audioLimiter, audioOutput;
async function ensureEq() {
  if (!state.settings.eqEnabled && !state.settings.normalization && !context) return;
  if (!context) {
    context = new AudioContext();
    const local = $('#local-audio');
    const source = context.createMediaElementSource(local);
    filters = [60, 250, 1000, 4000, 12000].map(f => { const filter = context.createBiquadFilter(); filter.type = 'peaking'; filter.frequency.value = f; filter.Q.value = 1; return filter; });
    audioHeadroom = context.createGain(); audioLeveler = context.createDynamicsCompressor();
    audioLimiter = context.createDynamicsCompressor(); audioOutput = context.createGain();
    source.connect(audioHeadroom);
    let previous = audioHeadroom; for (const filter of filters) { previous.connect(filter); previous = filter; }
    previous.connect(audioLeveler); audioLeveler.connect(audioLimiter); audioLimiter.connect(audioOutput); audioOutput.connect(context.destination);
  }
  filters.forEach((f, i) => f.gain.value = state.settings.eqEnabled ? state.settings.eq[i] : 0);
  const enabled = state.settings.normalization === true;
  const boost = state.settings.eqEnabled ? state.settings.eq.reduce((sum, gain) => sum + Math.max(0, gain), 0) : 0;
  audioHeadroom.gain.setTargetAtTime(enabled ? 10 ** (-boost / 20) : 1, context.currentTime, .025);
  audioLeveler.threshold.value = enabled ? -18 : 0;
  audioLeveler.knee.value = enabled ? 12 : 0;
  audioLeveler.ratio.value = enabled ? 3 : 1;
  audioLeveler.attack.value = .01; audioLeveler.release.value = .3;
  audioLimiter.threshold.value = enabled ? -3 : 0;
  audioLimiter.knee.value = 0; audioLimiter.ratio.value = enabled ? 20 : 1;
  audioLimiter.attack.value = .001; audioLimiter.release.value = .1;
  audioOutput.gain.setTargetAtTime(enabled ? .89 : 1, context.currentTime, .025);
  await context.resume();
}
// A separate element keeps cross-origin radio out of Web Audio's CORS restrictions.
const localAudio = document.createElement('audio'); localAudio.id = 'local-audio'; localAudio.preload = 'auto'; document.body.append(localAudio);
let activeAudio = audio;
async function playTrack(track, list = null, at = null) {
  if (!track) return;
  audioPreparation.cancel();
  if (!list && at === null) {
    const visible = [...document.querySelectorAll('#content [data-play], #content [data-artist-track]')]
      .map(button => trackById(button.dataset.play || button.dataset.artistTrack)).filter(Boolean);
    const unique = [...new Map(visible.map(song => [song.id, song])).values()];
    if (unique.some(song => song.id === track.id)) list = unique;
  }
  if (state.settings.offline && !track.downloaded && track.kind !== 'local') return toast('Offline mode: select stored audio.');
  const discover = !!list && state.settings.smartShuffle && !state.settings.offline;
  if (list && state.settings.smartShuffle && state.settings.offline) list = list.filter(t => t.kind === 'local' || t.downloaded);
  if (list && state.settings.smartShuffle) { const selected = state.settings.offline ? list.findIndex(t => t.id === track.id) : (at ?? list.findIndex(t => t.id === track.id)); list = [track, ...smartShuffle(list.filter((_, i) => i !== selected), state, track)]; at = 0; }
  pendingResumePosition = null;
  sessionSeconds = 0; sessionCounted = false;
  discoveryController?.abort();
  const token = ++playToken;
  if (nativeAudio) {
    try {
      if (list) { queue = [...list]; index = at ?? queue.findIndex(t => t.id === track.id); }
      else if (at !== null) index = at;
      else { queue = [track]; index = 0; }
      current = track; activeAudio = nativeAudio; updatePlayer();
      await nativeAudio.start(queue, index, state.settings);
      if (token !== playToken) return;
      countRadioClick(track);
      if (!state.tracks.some(t => t.id === track.id)) state.tracks.push(track);
      state.history = [track.id, ...state.history.filter(id => id !== track.id)].slice(0, 100);
      const stats = state.stats[track.id] ||= { seconds: 0, plays: 0 }; stats.plays++;
      await save(); render(); if (discover) enrichSmartQueue(token);
    } catch (e) { toast(e.message); }
    return;
  }
  if (list) { queue = [...list]; index = at ?? queue.findIndex(t => t.id === track.id); }
  else if (at !== null) index = at;
  else { queue = [track]; index = 0; }
  current = track;
  audio.pause(); localAudio.pause();
  updatePlayer();
  if (hls) { hls.destroy(); hls = null; }
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = ''; }
  let url = track.url;
  try {
    segments = [];
    if (track.kind === 'local' || track.downloaded) {
      const blob = await dbRead(db, 'files', track.id);
      if (token !== playToken) return;
      if (!blob && (isNative || fileBackend)) url = './api/file?id=' + encodeURIComponent(track.id);
      else if (!blob && track.kind === 'local') throw new Error('Reimport this audio file to play it on this device.');
      else if (!blob) { track.downloaded = false; url = streamUrl(track.ytid, state.settings.streamingQuality); }
      else {
      blobUrl = URL.createObjectURL(blob); url = blobUrl;
      }
    } else if (track.kind === 'youtube') url = streamUrl(track.ytid, state.settings.streamingQuality);
    else if (!safeUrl(url)) throw new Error('This track has no playable audio URL.');
    if (list) { queue = [...list]; index = at ?? queue.findIndex(t => t.id === track.id); }
    else if (at !== null) index = at;
    else { queue = [track]; index = 0; }
    current = track; activeAudio = blobUrl || track.kind === 'youtube' || track.kind === 'local' || track.downloaded ? localAudio : audio;
    activeAudio.volume = state.settings.volume;
    if (track.isLive && track.kind === 'youtube' && Hls.isSupported()) {
      hls = new Hls({ startLevel: 0, maxBufferLength: 30 });
      hls.loadSource(streamUrl(track.ytid, state.settings.streamingQuality) + '&live=1'); hls.attachMedia(activeAudio);
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal && token === playToken) toast('Live playback failed: ' + data.details); });
    } else activeAudio.src = track.isLive && track.kind === 'youtube' ? streamUrl(track.ytid, state.settings.streamingQuality) + '&live=1' : url;
    if (activeAudio === localAudio) await ensureEq();
    if (token !== playToken) return;
    await activeAudio.play();
    if (token !== playToken) return;
    audioPreparation.prepare(queue[index + 1], state.settings);
    countRadioClick(track);
    if (!state.tracks.some(t => t.id === track.id)) state.tracks.push(track);
    state.history = [track.id, ...state.history.filter(id => id !== track.id)].slice(0, 100);
    const stats = state.stats[track.id] ||= { seconds: 0, plays: 0 }; stats.plays++;
    save(); render(); updateSession(); if (discover) enrichSmartQueue(token);
    if (track.ytid && state.settings.sponsorBlock) api('segments', { id: track.ytid }).then(data => { if (token === playToken) segments = Array.isArray(data) ? data : []; }).catch(() => toast('SponsorBlock is unavailable for this track.'));
  } catch (e) { if (token === playToken) toast(e.message || 'Could not play this audio.'); }
}
function countRadioClick(track) {
  if (track?.id?.startsWith('radio-browser:')) api('radio-click', { id: track.id.slice('radio-browser:'.length) }).catch(() => {});
}
function updateSession() {
  if (!('mediaSession' in navigator) || !current) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist || 'Musify', ...(safeUrl(current.artwork) ? { artwork: [{ src: current.artwork }] } : {}) });
  for (const [action, handler] of Object.entries({ play: () => toggle(true), pause: () => activeAudio.pause(), nexttrack: () => next(), previoustrack: () => previous(), seekto: event => { if (Number.isFinite(activeAudio.duration)) activeAudio.currentTime = Math.min(activeAudio.duration, event.seekTime); } })) try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
}
async function toggle(force = false) { if (!current) return toast('Import a song or choose a radio station first.'); try { if ((!nativeAudio && !activeAudio.src) || (nativeAudio && !nativeAudio._state.track)) { const position = pendingResumePosition ?? state.queue.position ?? 0; await playTrack(current, queue, index); if (position && Number.isFinite(activeAudio.duration)) activeAudio.currentTime = position; await save(); return; } if (activeAudio.paused || force) { if (context) await context.resume(); await activeAudio.play(); } else activeAudio.pause(); } catch { toast('Playback could not start. Choose the track again to retry.'); } }
let discoveryController;
async function enrichSmartQueue(token = playToken) {
  discoveryController?.abort(); const controller = discoveryController = new AbortController();
  const timeout = setTimeout(() => controller.abort(), state.settings.localAI ? 115000 : 25000);
  try {
    const originals = queue.filter(t => !t.recommendation);
    let loadingShown = false;
    const picks = await discoverRecommendations(originals, state, { signal: controller.signal, rank: state.settings.localAI ? (seeds, candidates, signal) => rankOnDevice(seeds, candidates, signal, status => { if (status === 'loading' && !loadingShown) { loadingShown = true; toast('Preparing built-in AI. Music keeps playing.'); } if (status === 'ready') toast('On-device AI matched recommendations to your playlist.'); }) : undefined });
    if (controller.signal.aborted || token !== playToken || !state.settings.smartShuffle || state.settings.offline || !picks.length) return;
    if (nativeAudio) nativeAudio.pending = true;
    const prefix = queue.slice(0, index + 1), tail = queue.slice(index + 1).filter(t => !t.recommendation);
    const blended = blendRecommendations(tail, picks);
    // Insert into the native queue as well, preserving the currently playing song.
    for (let i = 0; i < blended.length; i++) {
      const track = blended[i]; if (!track.recommendation) continue;
      if (token !== playToken || !state.settings.smartShuffle || state.settings.offline) break;
      const to = prefix.length + i;
      if (nativeAudio) { await nativeRequest('queue-add', { track }); if (to !== queue.length) await nativeRequest('queue-move', { from: queue.length, to }); }
      queue.splice(to, 0, track);
    }
    await save(); render(); toast('Smart Shuffle added recommendations to your queue.');
  } catch (error) { if (!controller.signal.aborted) toast('Recommendations unavailable. Your playlist will keep playing.'); }
  finally { clearTimeout(timeout); if (nativeAudio) nativeAudio.pending = false; }
}
let advancing = false;
async function next(automatic = false) {
  automatic = automatic === true;
  if (advancing) return;
  advancing = true;
  try {
    if (!automatic && state.settings.smartShuffle && recordEarlySkip(state, current, sessionSeconds, Number(activeAudio.duration))) await save();
    if (state.settings.smartShuffle && !state.settings.repeatOne) {
      const start = index + 1;
      if (start < queue.length) await reorderSmartQueue(start);
      else if (state.settings.repeat && queue.length > 1) { await reorderSmartQueue(0); index = -1; if (nativeAudio) return playTrack(queue[0], queue, 0); }
    }
    const before = playToken;
    // Queue selection is synchronous; a stalled media play promise must not
    // prevent the listener from skipping again while the source buffers.
    if (!nativeAudio) advancing = false;
    await advance(automatic);
    if (!automatic && !nativeAudio && before === playToken && index >= queue.length - 1) toast('End of queue. Add more songs or turn on Repeat.');
  } catch (error) { toast(error.message || 'Could not advance the queue.'); } finally { advancing = false; }
}
async function reorderSmartQueue(start) {
  const tail = queue.slice(start);
  const ordered = blendRecommendations(smartShuffle(tail.filter(t => !t.recommendation), state, current), tail.filter(t => t.recommendation));
  ordered.push(...tail.filter(t => !ordered.includes(t)));
  if (nativeAudio) nativeAudio.pending = true;
  try {
  for (let i = 0; i < ordered.length; i++) {
    const from = queue.indexOf(ordered[i], start + i), to = start + i;
    if (from !== to) { if (isNative) await nativeRequest('queue-move', { from, to }); queue.splice(to, 0, queue.splice(from, 1)[0]); }
  }
  } finally { if (nativeAudio) nativeAudio.pending = false; }
}
async function advance(automatic) { if (nativeAudio) return nativeAudio.command('next').catch(e => toast(e.message)); if (automatic && state.settings.repeatOne && current) { activeAudio.currentTime = 0; return toggle(true); } const n = nextIndex(index, queue.length, state.settings.repeat, state.settings.shuffle && !state.settings.smartShuffle); if (n >= 0) return playTrack(queue[n], null, n); if (state.settings.autoplay && !state.settings.offline && current?.ytid) { try { const related = await api('related', { id: current.ytid }); const track = related.find(t => !state.history.includes(t.id)); if (track) { queue.push(track); return playTrack(track, null, queue.length - 1); } } catch (e) { toast(e.message); } } }
function previous() {
  if (nativeAudio) return nativeAudio.command('previous').catch(e => toast(e.message));
  if (index > 0) return playTrack(queue[index - 1], null, index - 1);
  if (state.settings.repeat && queue.length > 1) return playTrack(queue[queue.length - 1], null, queue.length - 1);
  if (current && Number.isFinite(activeAudio.duration)) { activeAudio.currentTime = 0; return; }
  toast('No previous song in the queue.');
}
async function like(id) { const t = trackById(id); if (!t) return; if (!state.tracks.some(t => t.id === id)) state.tracks.push(t); state.liked = state.liked.includes(id) ? state.liked.filter(x => x !== id) : [...state.liked, id]; await save(); render(); }
function addToImportedMusic(ids) {
  if (!ids.length) return;
  let playlist = state.playlists.find(p => p.id === 'zonic-imported-music');
  if (!playlist) { playlist = { id: 'zonic-imported-music', name: 'Imported Music', tracks: [], source: '', pinned: true }; state.playlists.unshift(playlist); }
  for (const id of ids) if (!playlist.tracks.includes(id)) playlist.tracks.push(id);
}
async function importFiles(files) {
  let count = 0; const importedIds = [];
  for (const file of files) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|flac|ogg|wav|m4a|aac|opus)$/i.test(file.name)) continue;
    const existing = state.tracks.find(t => t.kind === 'local' && t.filename === file.name);
    const id = existing?.id || randomId();
    try {
      if (isNative) await nativeRequest('file', undefined, { blob: file, id });
      else if (fileBackend) { const response = await fetch('./api/file?id=' + encodeURIComponent(id), { method: 'POST', body: file }); if (!response.ok) throw new Error('Audio import failed.'); }
      else await dbWrite(db, 'files', id, file);
      if (!existing) { const title = file.name.replace(/\.[^.]+$/, ''), parts = title.split(' - '); state.tracks.push({ id, kind: 'local', filename: file.name, addedAt: Date.now(), title: parts.length > 1 ? parts.slice(1).join(' - ') : title, artist: parts.length > 1 ? parts[0] : 'Local music' }); }
      importedIds.push(id); count++;
    } catch { toast('Storage is full or unavailable. Some files could not be imported.'); break; }
  }
  addToImportedMusic(importedIds);
  await save(); view = 'library'; query = ''; $('#search').value = ''; render(); toast(`${count} audio file${count === 1 ? '' : 's'} added to Imported Music.`);
}
async function newPlaylist() { const name = await ask('A playlist of your own', 'Give your playlist a name'); if (!name) return; const p = { id: randomId(), name, tracks: [] }; state.playlists.push(p); save(); view = 'playlist:' + p.id; query = ''; render(); }
async function action(name) {
  if (name === 'import') $('#music-files').click();
  if (name === 'new-playlist') await newPlaylist();
  if (name === 'lyrics-fullscreen') {
    if (!current || current.kind === 'radio') return toast('Choose a song to view full-screen lyrics.');
    setPlayerExpanded(true); document.body.classList.add('lyrics-fullscreen'); await loadLyricsPreview(); return;
  }
  if (name === 'lyrics-close') { document.body.classList.remove('lyrics-fullscreen'); return; }
  if (name === 'connect-tv') { const address = await ask('Connect to your TV', 'Remote address shown in TV Settings, including http:// and port'); if (!address) return; const url = tvRemoteUrl(address); if (!url) return toast('Enter the local network address shown on your TV.'); location.href = url; }
  if (name === 'url') {
    const url = await ask('Add an audio link', 'Direct HTTP/HTTPS audio URL (not a YouTube page)'); if (!url) return;
    if (!safeUrl(url)) return toast('Enter a valid HTTP or HTTPS audio URL.');
    const title = await ask('Name your audio', 'Track or station name'); if (!title) return;
    const track = { id: randomId(), title, artist: 'Audio link', kind: 'url', url: safeUrl(url) };
    state.tracks.push(track); addToImportedMusic([track.id]); await save(); render();
  }
  if (name === 'export') {
    if (features) return features.saveFile(JSON.stringify(state, null, 2), `grove-library-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `musify-library-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  if (name === 'restore') $('#backup-file').click();
  if (name === 'reset-eq') { state.settings.eq = [0, 0, 0, 0, 0]; filters.forEach(f => f.gain.value = 0); save(); render(); }
  if (name === 'online-search') await searchYouTube();
  if (name === 'lyrics') {
    if (!current || current.kind === 'radio') return toast('Choose a song first.');
    const id = current.id; view = 'lyrics'; query = ''; $('#search').value = ''; lyricsText = 'Looking for lyrics…'; render();
    try { const data = await api('lyrics', { artist: current.artist, title: current.title }); if (current?.id === id) lyricsText = data.lyrics || 'No lyrics found for this track.'; }
    catch (e) { lyricsText = e.message; }
    if (view === 'lyrics') render();
  }
  if (name === 'download') {
    if (features) return features.download(current);
    if (!current?.ytid) return toast('Select an online YouTube track to download.');
    const track = current; toast('Downloading audio…');
    if (isNative) { try { await nativeRequest('download', track); track.downloaded = true; await save(); toast('Saved for offline listening.'); } catch (e) { toast(e.message); } return; }
    try { const response = await fetch(streamUrl(track.ytid)); if (!response.ok) throw new Error('Audio download failed.'); const blob = await response.blob(); if (!blob.size || !(blob.type.startsWith('audio/') || blob.type.startsWith('video/'))) throw new Error('Source did not return audio.'); await dbWrite(db, 'files', track.id, blob); track.downloaded = true; await save(); toast('Saved for offline listening on this device.'); }
    catch (e) { toast(e.message); }
  }
  if (name === 'playlist-url') {
    if (state.settings.offline) return toast('Turn off offline mode to import a YouTube playlist.');
    const input = await ask('Import a YouTube playlist', 'Paste a public YouTube playlist link or ID', '', 2048); if (!input) return;
    const id = youtubePlaylistId(input);
    if (!id) return toast('Paste a valid public YouTube playlist link or ID.');
    toast('Importing playlist…');
    try {
      const data = await api('playlist', { id });
      if (!Array.isArray(data.tracks) || !data.tracks.length) throw new Error('This playlist is empty, private, or unavailable.');
      const mode = await choosePlaylistImportMode(data.name || 'this playlist');
      if (!mode) return;
      for (const t of data.tracks) if (!state.tracks.some(x => x.id === t.id)) state.tracks.push(t);
      const existing = mode === 'youtube' ? state.playlists.find(p => youtubePlaylistId(p.source) === id) : null;
      const youtubeName = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Imported playlist';
      const p = existing || { id: randomId(), name: youtubeName, tracks: [], source: mode === 'youtube' ? data.source : '' };
      p.name = youtubeName; p.source = mode === 'youtube' ? data.source : ''; p.artwork = data.artwork || p.artwork; p.tracks = [...new Set([...data.tracks.map(t => t.id), ...p.tracks])];
      state.liked = mergeImportedLikes(state.liked, p.name, p.tracks);
      p.hidden = isLikedSongsPlaylist(p.name);
      if (!existing) state.playlists.push(p);
      await save(); view = p.hidden ? 'liked' : 'playlist:' + p.id; query = ''; $('#search').value = ''; render(); toast(`${existing ? 'Updated' : 'Imported'} ${data.tracks.length} tracks as a ${mode === 'youtube' ? 'protected YouTube' : 'Zonic'} playlist${p.name.trim().toLowerCase() === 'liked songs' ? ' and added them to Liked Songs' : ''}.`);
    } catch (e) { toast(e.message || 'Playlist import failed. Check that the playlist is public.'); }
  }
  if (name === 'spotify') { if (spotifyImporting) return toast('A Spotify import is already running.'); $('#spotify-file').click(); }
}
document.addEventListener('click', async event => {
  const carRow = event.target.closest('[data-car-play]');
  if (carRow) {
    const id = carRow.dataset.carPlay;
    const t = trackById(id);
    if (t) {
      let list = null;
      if (carTab === 'liked') list = state.liked.map(trackById).filter(Boolean);
      else if (carTab === 'recent') list = state.history.map(trackById).filter(Boolean);
      else if (carTab === 'radio') list = stations;
      await playTrack(t, list);
    }
    return;
  }
  const carPl = event.target.closest('[data-car-playlist]');
  if (carPl) {
    const id = carPl.dataset.carPlaylist;
    const p = state.playlists.find(x => x.id === id);
    if (p && p.tracks.length) {
      const list = p.tracks.map(trackById).filter(Boolean);
      if (list.length) await playTrack(list[0], list, 0);
    }
    return;
  }
  const carQ = event.target.closest('[data-car-queue-play]');
  if (carQ) {
    const n = +carQ.dataset.carQueuePlay;
    if (n >= 0 && n < queue.length) await playTrack(queue[n], queue, n);
    return;
  }
  const miniBarLeft = event.target.closest('.car-mini-left');
  if (miniBarLeft) { carTab = 'player'; render(); return; }
  const b = event.target.closest('button');
  if (!b) { event.target.closest('[data-play-row]')?.querySelector('.track-title')?.click(); return; }
  if (b.dataset.carTab) { carTab = b.dataset.carTab; render(); return; }
  if (b.dataset.carAction) {
    const act = b.dataset.carAction;
    if (act === 'play') await toggle();
    if (act === 'prev') previous();
    if (act === 'next') await next();
    if (act === 'shuffle') {
      state.settings.shuffle = !state.settings.shuffle;
      if (!state.settings.shuffle) state.settings.smartShuffle = false;
      await save(); render();
    }
    if (act === 'like') { if (current) await like(current.id); }
    return;
  }
  if (b.dataset.tvAction) {
    const act = b.dataset.tvAction;
    if (act === 'close-player') { view = 'home'; render(); return; }
    if (act === 'play') await toggle();
    if (act === 'prev') previous();
    if (act === 'next') await next();
    if (act === 'shuffle') {
      state.settings.shuffle = !state.settings.shuffle;
      if (!state.settings.shuffle) state.settings.smartShuffle = false;
      await save(); render();
    }
    if (act === 'repeat') { state.settings.repeat = !state.settings.repeat; await save(); render(); }
    if (act === 'like') { if (current) await like(current.id); }
    if (act === 'lyrics') await action('lyrics');
    return;
  }
  if (b.dataset.zone) { homeZone = b.dataset.zone; render(); }
  if (b.dataset.lyricTime !== undefined) { if (Number.isFinite(activeAudio.duration)) { activeAudio.currentTime = Math.max(0, +b.dataset.lyricTime); updateSyncedLyrics(activeAudio.currentTime, false); } return; }
  if (b.dataset.browseQuery) { query = b.dataset.browseQuery; $('#search').value = query; render(); action('online-search'); }
  if (b.dataset.view) { view = b.dataset.view; query = ''; $('#search').value = ''; render(); $('main').scrollTo(0, 0); if (view === 'browse') $('#search').focus(); if (view === 'radio' && !radioLoaded && !radioLoading) loadRadio(); }
  if (b.dataset.radioGenre) { radioGenre = b.dataset.radioGenre; radioResults = []; radioLoaded = false; render(); loadRadio(); }
  if (b.hasAttribute('data-radio-search')) { radioQuery = $('#radio-search')?.value.trim() || ''; loadRadio(); }
  if (b.dataset.action) await action(b.dataset.action);
  if (b.dataset.play) {
    const t = trackById(b.dataset.play);
    let list = [...new Map([...document.querySelectorAll('#content [data-play]')].map(button => trackById(button.dataset.play)).filter(Boolean).map(song => [song.id, song])).values()];
    if (!list.some(song => song.id === t?.id)) list = [t];
    if (query) list = onlineResults.includes(t) ? onlineResults : filtered([...state.tracks, ...stations.filter(s => !state.tracks.some(t => t.id === s.id))]);
    else if (view === 'library') list = state.tracks;
    else if (view === 'liked') list = state.liked.map(trackById).filter(Boolean);
    else if (view.startsWith('playlist:')) list = state.playlists.find(p => 'playlist:' + p.id === view).tracks.map(trackById).filter(Boolean);
    await playTrack(t, list);
  }
  if (b.dataset.queuePlay !== undefined) await playTrack(queue[+b.dataset.queuePlay], null, +b.dataset.queuePlay);
  if (b.dataset.like) await like(b.dataset.like);
  if (b.dataset.playlistPlay) { const list = state.playlists.find(p => p.id === b.dataset.playlistPlay).tracks.map(trackById).filter(Boolean); if (list.length) await playTrack(list[0], list, 0); else toast('Add tracks to this playlist first.'); }
  if (b.dataset.renamePlaylist) { const p = state.playlists.find(p => p.id === b.dataset.renamePlaylist), name = await ask('Rename playlist', 'Playlist name', p.name); if (name) { p.name = name; save(); render(); } }
  if (b.dataset.deletePlaylist) { const p = state.playlists.find(p => p.id === b.dataset.deletePlaylist); if (await ask('Delete playlist', `Type “${p.name}” to delete this playlist. Audio files are kept.`) === p.name) { state.playlists = state.playlists.filter(x => x.id !== p.id); view = 'library'; save(); render(); } }
  if (b.dataset.cleanPlaylist) {
    const p = state.playlists.find(p => p.id === b.dataset.cleanPlaylist);
    if (!p || youtubePlaylistId(p.source)) return;
    const before = p.tracks.length;
    p.tracks = [...new Set(p.tracks)];
    await save(); render();
    toast(before === p.tracks.length ? 'No duplicate songs found.' : `Removed ${before - p.tracks.length} duplicate ${before - p.tracks.length === 1 ? 'song' : 'songs'}.`);
  }
  if (b.dataset.playlistUp !== undefined || b.dataset.playlistDown !== undefined) {
    const p = state.playlists.find(p => p.id === b.dataset.playlistId);
    if (!p || youtubePlaylistId(p.source)) return toast('YouTube playlists are protected. Copy it to Zonic to reorder songs.');
    const from = +(b.dataset.playlistUp ?? b.dataset.playlistDown);
    const to = b.dataset.playlistUp !== undefined ? from - 1 : from + 1;
    if (from >= 0 && from < p.tracks.length && to >= 0 && to < p.tracks.length) {
      p.tracks.splice(to, 0, p.tracks.splice(from, 1)[0]);
      await save(); render();
    }
  }
    if (b.dataset.menu) {
    const track = trackById(b.dataset.menu);
    const viewedPlaylist = view.startsWith('playlist:') ? state.playlists.find(p => 'playlist:' + p.id === view) : null;
    const canRemove = viewedPlaylist && !youtubePlaylistId(viewedPlaylist.source);
    const choice = await ask('Track actions', `Type “queue” to add to queue${canRemove ? ', “remove” to remove from this playlist' : ''}, or a playlist name.`, 'queue');
    if (!choice) return;
    if (choice === 'queue') {
      queue.push(track);
      if (isNative) await nativeRequest('queue-add', { track });
      await save();
      toast('Added to your queue.');
    }
    else if (choice === 'remove' && viewedPlaylist) { if (!canRemove) return toast('YouTube playlists are protected. Copy it to Zonic to remove songs.'); viewedPlaylist.tracks = viewedPlaylist.tracks.filter(id => id !== track.id); save(); }
    else { const p = state.playlists.find(p => p.name.toLowerCase() === choice.toLowerCase()); if (!p) return toast('Create that playlist first.'); if (youtubePlaylistId(p.source)) return toast('YouTube playlists are protected. Copy it to Zonic to edit songs.'); if (!state.tracks.some(t => t.id === track.id)) state.tracks.push(track); if (!p.tracks.includes(track.id)) p.tracks.push(track.id); save(); toast('Added to ' + p.name); }
    render();
  }
  if (b.dataset.up !== undefined) {
    const n = +b.dataset.up;
    if (n > 0) {
      if (isNative) await nativeRequest('queue-move', { from: n, to: n - 1 });
      [queue[n - 1], queue[n]] = [queue[n], queue[n - 1]];
      if (index === n) index--; else if (index === n - 1) index++;
      await save(); render();
    }
  }
  if (b.dataset.removeQueue !== undefined) {
    const n = +b.dataset.removeQueue;
    if (isNative) await nativeRequest('queue-remove', { index: n });
    queue.splice(n, 1);
    if (n < index) index--; else if (n === index) index = Math.min(index, queue.length - 1);
    current = index >= 0 ? queue[index] : null;
    await save(); render();
  }
});
$('#import-music').onclick = () => action('import'); $('#new-playlist').onclick = newPlaylist;
$('#music-files').onchange = async e => { await importFiles(e.target.files); e.target.value = ''; };
$('#spotify-file').onchange = async e => {
  const file = e.target.files[0]; if (!file || spotifyImporting) return; spotifyImporting = true;
  try { if (file.size > 2 * 1024 * 1024) throw new Error('CSV must be smaller than 2 MB.'); const rows = parseSpotifyCsv(await file.text()); if (rows.length > 500) throw new Error('Import up to 500 tracks at a time.'); const name = await ask('Import Spotify CSV', 'Name this playlist', file.name.replace(/\.csv$/i, '')); if (!name) return;
    const p = { id: randomId(), name, tracks: [] }; let missed = 0;
    for (const [i, row] of rows.entries()) { toast(`Matching ${i + 1} of ${rows.length} songs…`); try { const t = await api('match', { ...row, q: row.title + ' ' + row.artist }); if (!t) { missed++; continue; } if (!state.tracks.some(x => x.id === t.id)) state.tracks.push(t); if (!p.tracks.includes(t.id)) p.tracks.push(t.id); } catch { missed += rows.length - i; break; } }
    if (p.tracks.length) { p.hidden = isLikedSongsPlaylist(p.name); state.playlists.push(p); state.liked = mergeImportedLikes(state.liked, p.name, p.tracks); await save(); view = p.hidden ? 'liked' : 'playlist:' + p.id; query = ''; $('#search').value = ''; render(); } toast(`Imported ${p.tracks.length} tracks${p.name.trim().toLowerCase() === 'liked songs' ? ' and added them to Liked Songs' : ''}; ${missed} could not be matched.`);
  } catch (e) { toast(e.message); } finally { spotifyImporting = false; e.target.value = ''; }
};
$('#backup-file').onchange = async e => {
  try { const file = e.target.files[0]; if (!file) return; if (file.size > 20 * 1024 * 1024) throw new Error('Backup must be smaller than 20 MB.'); const restored = validateBackup(JSON.parse(await file.text()));
    if (await ask('Restore your library', 'Type RESTORE to replace library metadata. Stored audio files are kept.') !== 'RESTORE') return;
    await saveChain.catch(() => {});
    await features.ctx.replaceState(restored);
    filters.forEach((f, i) => f.gain.value = state.settings.eqEnabled ? state.settings.eq[i] : 0);
    await save(); render(); toast('Library restored. Reimport any missing local music.');
  } catch (e) { toast(e.message); } finally { e.target.value = ''; }
};
async function searchYouTube() {
  clearTimeout(searchTimer);
  if (state.settings.offline) return toast('Online search is disabled in offline mode.');
  const term = query;
  if (term.length < 2) return;
  searchController?.abort();
  const controller = searchController = new AbortController();
  const generation = ++searchGeneration;
  features?.closeSearchSuggestions?.();
  searching = true; render();
  try {
    const results = await api('search', { q: term }, { signal: controller.signal });
    if (generation !== searchGeneration || term !== query) return;
    onlineResults = results;
    onlineQuery = term;
  } catch (error) {
    if (!controller.signal.aborted && generation === searchGeneration) toast(error.message);
  } finally {
    if (generation === searchGeneration) { searching = false; render(); }
  }
}
async function loadRadio() {
  clearTimeout(radioTimer);
  const generation = ++radioGeneration;
  if (state.settings.offline) { radioLoading = false; radioError = 'Turn off offline mode to browse Radio Browser. Built-in stations are below.'; renderRadio(); return; }
  radioLoading = true; radioError = ''; renderRadio();
  try {
    const results = await api('radio-browser', { q: radioQuery, genre: radioGenre === 'All' ? '' : radioGenre });
    if (generation !== radioGeneration) return;
    radioResults = results; radioLoaded = true;
  } catch (error) {
    if (generation !== radioGeneration) return;
    radioError = `${error.message} Built-in stations are still available below.`;
  } finally { if (generation === radioGeneration) { radioLoading = false; if (view === 'radio') renderRadio(); } }
}
function renderRadio() {
  const input = $('#radio-search'), focused = document.activeElement === input, cursor = input?.selectionStart, focusedTrack = document.activeElement?.dataset.play;
  render();
  if (focused && view === 'radio') { const next = $('#radio-search'); next.focus(); if (cursor !== null) next.setSelectionRange(cursor, cursor); }
  else if (focusedTrack && view === 'radio') [...document.querySelectorAll('[data-play]')].find(button => button.dataset.play === focusedTrack)?.focus();
}
document.addEventListener('input', event => {
  if (event.target.id !== 'radio-search') return;
  radioQuery = event.target.value.trim();
  clearTimeout(radioTimer);
  radioTimer = setTimeout(loadRadio, 500);
});
document.addEventListener('keydown', event => {
  if (event.target.id === 'radio-search' && event.key === 'Enter') { event.preventDefault(); radioQuery = event.target.value.trim(); loadRadio(); }
});
$('#search').oninput = e => {
  query = e.target.value.trim();
  clearTimeout(searchTimer); searchController?.abort(); searchGeneration++; searching = false;
  render();
  if (query.length >= 2 && !state.settings.offline) searchTimer = setTimeout(() => searchYouTube(), 450);
};
$('#search').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); searchYouTube(); } };
$('#play').onclick = () => toggle(); $('#next').onclick = next; $('#previous').onclick = previous; $('#now-like').onclick = () => current && like(current.id);
for (const name of ['shuffle', 'repeat']) $('#' + name).onclick = async () => {
  if (name === 'shuffle') {
    if (!state.settings.shuffle) state.settings.shuffle = true;
    else if (!state.settings.smartShuffle) {
      state.settings.smartShuffle = true;
      const start = Math.max(0, index + 1), remaining = queue.slice(start);
      const ordered = blendRecommendations(smartShuffle(remaining.filter(t => !t.recommendation), state, current), remaining.filter(t => t.recommendation));
      ordered.push(...remaining.filter(t => !ordered.includes(t)));
      try {
        for (let i = 0; i < ordered.length; i++) {
          const from = queue.indexOf(ordered[i], start + i), to = start + i;
          if (from !== to) { if (isNative) await nativeRequest('queue-move', { from, to }); queue.splice(to, 0, queue.splice(from, 1)[0]); }
        }
      } catch (e) { toast(e.message); }
    } else {
      state.settings.shuffle = false; state.settings.smartShuffle = false; discoveryController?.abort();
      for (let i = queue.length - 1; i > index; i--) if (queue[i].recommendation) {
        if (nativeAudio) await nativeRequest('queue-remove', { index: i }); queue.splice(i, 1);
      }
    }
    toast(state.settings.smartShuffle ? 'Smart Shuffle: favorites, variety, fewer recent repeats' : state.settings.shuffle ? 'Random shuffle' : 'Shuffle off');
  } else state.settings[name] = !state.settings[name];
  await save(); if (isNative) await nativeRequest('settings', state.settings).catch(e => toast(e.message)); render(); updatePlayer(); if (name === 'shuffle' && state.settings.smartShuffle) enrichSmartQueue();
};
$('#volume').oninput = e => { state.settings.volume = +e.target.value; audio.volume = localAudio.volume = state.settings.volume; if (nativeAudio) nativeAudio.volume = state.settings.volume; }; $('#volume').onchange = save;
$('#seek').oninput = e => { if (Number.isFinite(activeAudio.duration)) { activeAudio.currentTime = activeAudio.duration * +e.target.value / 100; updateSyncedLyrics(activeAudio.currentTime); } };
document.addEventListener('input', e => { if ((e.target.id === 'car-seek' || e.target.id === 'tv-seek') && Number.isFinite(activeAudio.duration)) { activeAudio.currentTime = activeAudio.duration * +e.target.value / 100; } });
document.addEventListener('change', async e => {
  if (e.target.id === 'sleep') { if (sleepTimeout) clearTimeout(sleepTimeout.id); const minutes = +e.target.value; sleepTimeout = minutes ? { minutes, id: setTimeout(() => { activeAudio.pause(); sleepTimeout = null; toast('Sleep timer finished.'); }, minutes * 60000) } : null; toast(minutes ? `Playback will pause in ${minutes} minutes.` : 'Sleep timer off.'); }
  if (isNative && e.target.id === 'sleep') nativeRequest('sleep', { minutes: +e.target.value }).catch(e => toast(e.message));
  if (e.target.id === 'audio-normalization') {
    state.settings.normalization = e.target.checked;
    try { await ensureEq(); await save(); }
    catch { state.settings.normalization = false; e.target.checked = false; toast('Volume normalization is unavailable in this browser.'); }
  }
  if (e.target.id === 'eq-enabled') { state.settings.eqEnabled = e.target.checked; try { if (current?.kind === 'local') await ensureEq(); filters.forEach((f, i) => f.gain.value = state.settings.eqEnabled ? state.settings.eq[i] : 0); save(); } catch { toast('Equalizer is unavailable in this browser.'); } }
  if (e.target.id === 'sponsor-block') {
    state.settings.sponsorBlock = e.target.checked;
    segments = [];
    if (state.settings.sponsorBlock && current?.ytid) {
      api('segments', { id: current.ytid }).then(result => { segments = Array.isArray(result) ? result : []; }).catch(() => {});
    }
    save();
  }
  if (isNative && ['eq-enabled', 'sponsor-block'].includes(e.target.id)) nativeRequest('settings', state.settings).catch(e => toast(e.message));
});
document.addEventListener('input', e => { if (e.target.dataset.band !== undefined) { const i = +e.target.dataset.band; state.settings.eq[i] = +e.target.value; if (filters[i]) filters[i].gain.value = state.settings.eqEnabled ? state.settings.eq[i] : 0; $('#gain-' + i).textContent = e.target.value + ' dB'; save(); } });
document.addEventListener('input', e => {
  if (e.target.dataset.band !== undefined && state.settings.normalization && !isNative) ensureEq().catch(() => toast('Could not update audio processing.'));
});
document.addEventListener('change', e => {
  if (e.target.id === 'eq-enabled' && state.settings.normalization && !isNative) ensureEq().catch(() => toast('Could not update audio processing.'));
});
for (const element of [audio, localAudio, ...(nativeAudio ? [nativeAudio] : [])]) {
  element.addEventListener('play', () => { updatePlayer(); if (element === activeAudio) { $('#play').ariaLabel = 'Pause'; decorateButtons(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; } });
  element.addEventListener('pause', () => { updatePlayer(); if (element === activeAudio) { $('#play').ariaLabel = 'Play'; decorateButtons(); save(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; } });
  element.addEventListener('ended', () => { if (element !== activeAudio) return; if (endOfSongTimer) { endOfSongTimer = false; activeAudio.pause(); return; } next(true); });
  element.addEventListener('error', () => { if (element === activeAudio) toast('The audio source could not be played. Try another file or station.'); });
  element.addEventListener('timeupdate', () => {
    if (element !== activeAudio) return;
    if (state.settings.sponsorBlock) {
      const skip = segments.find(s => Array.isArray(s.segment) && element.currentTime >= s.segment[0] && element.currentTime < s.segment[1]);
      if (skip && Number.isFinite(skip.segment[1])) element.currentTime = skip.segment[1];
    }
    const curTime = time(element.currentTime);
    const totalTime = time(element.duration);
    const val = Number.isFinite(element.duration) && element.duration ? element.currentTime / element.duration * 100 : 0;
    $('#elapsed').textContent = curTime;
    $('#duration').textContent = totalTime;
    const seek = $('#seek');
    seek.disabled = !Number.isFinite(element.duration);
    seek.value = val;
    seek.style.setProperty('--seek-progress', `${val}%`);
    const carElapsed = $('#car-elapsed'), carDuration = $('#car-duration'), carSeek = $('#car-seek');
    if (carElapsed) carElapsed.textContent = curTime;
    if (carDuration) carDuration.textContent = totalTime;
    if (carSeek) carSeek.value = val;
    const tvElapsed = $('#tv-elapsed'), tvDuration = $('#tv-duration'), tvSeek = $('#tv-seek');
    if (tvElapsed) tvElapsed.textContent = curTime;
    if (tvDuration) tvDuration.textContent = totalTime;
    if (tvSeek) tvSeek.value = val;
    updateSyncedLyrics(element.currentTime);
  });
  if (absorbLikedPlaylists()) await save();
}
let lastTick = performance.now();
setInterval(() => { const now = performance.now(), delta = Math.min(2, (now - lastTick) / 1000); lastTick = now; if (current && !activeAudio.paused && !activeAudio.ended && activeAudio.readyState >= 3) { const s = state.stats[current.id]; if (s) s.seconds += delta; const key = new Date().toLocaleDateString('sv-SE').slice(0, 7); const month = state.months[key] ||= { totalSeconds: 0, songs: {} }; month.totalSeconds += delta; const song = month.songs[current.id] ||= { seconds: 0, plays: 0 }; const threshold = current.duration && current.duration < 60 ? Math.max(.5, current.duration / 2) : 30; sessionSeconds += delta; if (!sessionCounted && sessionSeconds >= threshold) { song.plays++; sessionCounted = true; } song.seconds += delta; } }, 1000);
setInterval(() => { if (current && !activeAudio.paused) save(); }, 15000);
document.addEventListener('visibilitychange', () => { if (document.hidden && db) save(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); window.groveBack(); return; }
  if ($('#dialog').open || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === '/') { e.preventDefault(); (document.body.classList.contains('artists-page') ? $('#artist-search') : $('#search'))?.focus(); }
  if (e.key === ' ' && e.target === document.body) { e.preventDefault(); toggle(); }
  if (e.key === 'Escape') { view = 'home'; query = ''; $('#search').value = ''; render(); }
  if (!isTelevision || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const visible = [...document.querySelectorAll('button,input,a,select')].filter(x => !x.disabled && x.getClientRects().length);
  if (!document.activeElement || document.activeElement === document.body) {
    if (visible[0]) { e.preventDefault(); visible[0].focus(); visible[0].scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); return; }
  }
  const from = document.activeElement.getBoundingClientRect(), cx = from.x + from.width / 2, cy = from.y + from.height / 2;
  const targets = visible.filter(x => x !== document.activeElement).map(x => { const r = x.getBoundingClientRect(); const dx = r.x + r.width / 2 - cx, dy = r.y + r.height / 2 - cy; const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight'; const along = horizontal ? dx : dy, cross = horizontal ? dy : dx; const positive = e.key === 'ArrowRight' || e.key === 'ArrowDown'; return { x, valid: positive ? along > 8 : along < -8, score: Math.abs(along) + Math.abs(cross) * 3 }; }).filter(x => x.valid).sort((a, b) => a.score - b.score);
  if (targets[0]) { e.preventDefault(); targets[0].x.focus(); targets[0].x.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); }
});
try {
  db = await openLibraryDatabase(); const saved = await dbRead(db, 'state', 'library') || (isNative ? await nativeRequest('library') : null); if (saved) state = validateBackup(saved);
  await loadLanguages();
  if (!isNative) try { fileBackend = (await api('health', {}, { signal: AbortSignal.timeout(2000) })).fileStorage === true; } catch {}
  features = new Features({ get state() { return state; }, get db() { return db; }, get view() { return view; }, get current() { return current; }, get queue() { return queue; }, get fileBackend() { return fileBackend; }, findTrack: trackById, top, rows, cards, ask, toast, save, render, playTrack, action,
    navigate(v) { view = v; query = ''; $('#search').value = ''; render(); }, async replaceState(value) { activeAudio.pause(); if (isNative) { nativeAudio.pending = true; try { await nativeRequest('restore-library', value); } finally { nativeAudio.pending = false; } } else { audio.removeAttribute('src'); localAudio.removeAttribute('src'); audio.load(); localAudio.load(); if (hls) { hls.destroy(); hls = null; } } state = value; pendingResumePosition = state.queue.position; queue = state.queue.ids.map(id => state.queue.tracks?.find(t => t.id === id) || state.tracks.find(t => t.id === id)).filter(Boolean); index = Math.min(state.queue.index, queue.length - 1); current = index >= 0 ? queue[index] : null; audio.volume = localAudio.volume = state.settings.volume; $('#volume').value = state.settings.volume; }, registerResult(t) { if (!onlineResults.some(x => x.id === t.id)) onlineResults.push(t); },
    enqueue(t, next = false) { if (next) queue.splice(index + 1, 0, t); else queue.push(t); if (isNative) nativeRequest('queue-add', { track: t, next }).catch(e => toast(e.message)); save(); toast('Added to queue.'); },
    moveQueue(from, to) { if (from < 0 || from >= queue.length || to < 0 || to >= queue.length) return; const track = queue.splice(from, 1)[0]; queue.splice(to, 0, track); index = queue.findIndex(t => t.id === current?.id); if (isNative) nativeRequest('queue-move', { from, to }).catch(e => toast(e.message)); save(); render(); },
    clearQueue() { queue = []; index = -1; activeAudio.pause(); if (isNative) nativeRequest('queue-clear', {}).catch(e => toast(e.message)); save(); }, endTimer() { endOfSongTimer = true; }, cancelTimer() { endOfSongTimer = false; if (sleepTimeout) clearTimeout(sleepTimeout.id); sleepTimeout = null; },
    async setEq() { if (isNative) await nativeRequest('settings', state.settings); else await ensureEq(); }
  });
  if (isNative && isTelevision && features.auth.pairingCode) await nativeRequest('tv-pairing-code', { code: features.auth.pairingCode });
  queue = state.queue.ids.map(id => state.queue.tracks?.find(t => t.id === id) || trackById(id)).filter(Boolean); index = Math.min(state.queue.index, queue.length - 1); if (index >= 0) { current = queue[index]; pendingResumePosition = state.queue.position; }
  const response = await fetch('./src/radio.json'); if (!response.ok) throw new Error('Could not load radio collection.'); stations = await response.json();
  $('#volume').value = state.settings.volume; audio.volume = localAudio.volume = state.settings.volume; render(); features.startPlaylistSync();
  if (nativeAudio) {
    activeAudio = nativeAudio;
    if (isTelevision || isAuto) render();
    nativeAudio.addEventListener('nativeerror', e => toast(e.detail));
    nativeAudio.addEventListener('nativestate', e => { const data = e.detail; const remote = data.platform?.remote || null; if (remote?.url !== tvRemoteDetails?.url || remote?.pin !== tvRemoteDetails?.pin) { tvRemoteDetails = remote; if (view === 'settings') render(); } if (data.platform?.auto && !isAuto) { isAuto = true; render(); } if (data.platform?.tv && !isTelevision) { isTelevision = true; render(); } if (!nativeAudio.pending && data.track) { const changed = current?.id !== data.track.id; if (changed) { sessionSeconds = 0; sessionCounted = false; } current = trackById(data.track.id) || data.track; queue = data.queue; index = data.index; if (changed) { if (!state.tracks.some(t => t.id === current.id)) state.tracks.push(current); state.history = [current.id, ...state.history.filter(id => id !== current.id)].slice(0, 100); save(); render(); } if (data.platform?.accent) { features.systemAccent = data.platform.accent; if (state.settings.dynamicColor) document.documentElement.style.setProperty('--accent', data.platform.accent); } } });
    nativeAudio.startPolling();
    let processingIntents = false;
    nativeAudio.addEventListener('nativestate', async e => { if (!e.detail.intentCount || processingIntents) return; processingIntents = true; try { const links = await nativeRequest('intents'); for (const link of links) await features.openLink(link); } catch (error) { toast(error.message); } finally { processingIntents = false; } });
  }
} catch (e) { $('#content').innerHTML = top('Your library needs attention', e.message) + '<p>Use a browser that supports IndexedDB, and check that device storage is available.</p>'; }
