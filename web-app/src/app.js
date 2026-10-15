import { icon, decorateButtons } from './icons.js';
import { rankOnDevice } from './local-ai.js';
import { blendRecommendations, discoverRecommendations } from './recommendations.js';
import { smartShuffle, recordEarlySkip } from './smart-shuffle.js';
import { emptyLibrary, safeUrl, validateBackup, nextIndex, openLibraryDatabase, dbRead, dbWrite, parseSpotifyCsv, sortTracks } from './library.js';
import { api, streamUrl } from './sources.js';
import { nativeAudio, nativeRequest, isNative, isTelevision } from './native.js';
import { loadLanguages } from './i18n.js';
import { Features } from './features.js';
import Hls from './hls.js';
const $ = s => document.querySelector(s);
function setQueueOpen(open) { document.body.classList.toggle('queue-open', open); $('.queue-rail').inert = !open; $('#queue-toggle').setAttribute('aria-expanded', String(open)); if (open) $('#queue-close').focus(); else $('#queue-toggle').focus(); }
$('#queue-toggle').onclick = () => setQueueOpen(!document.body.classList.contains('queue-open'));
$('#queue-close').onclick = $('#queue-scrim').onclick = () => setQueueOpen(false);
$('.queue-rail').addEventListener('click', event => { if (event.target.closest('[data-view]')) setQueueOpen(false); });
$('#player-expand').onclick = () => { const open = document.body.classList.toggle('player-expanded'); $('#player-expand').setAttribute('aria-expanded', String(open)); $('#player-expand').setAttribute('aria-label', open ? 'Close expanded player' : 'Expand music player'); $('#player-expand').textContent = open ? '×' : '↗'; };
document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (document.body.classList.contains('queue-open')) { event.preventDefault(); event.stopImmediatePropagation(); setQueueOpen(false); } else if (document.body.classList.contains('player-expanded')) { event.preventDefault(); event.stopImmediatePropagation(); $('#player-expand').click(); } } }, true);
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
let db, state = emptyLibrary(), stations = [], view = 'home', query = '', queue = [], index = -1, current = null, blobUrl = '', context, filters = [], playToken = 0, sleepTimeout, saveChain = Promise.resolve(), toastTimeout;
let onlineResults = [], onlineQuery = '', searching = false, searchGeneration = 0, segments = [], lyricsText = '', spotifyImporting = false;
let radioResults = [], radioQuery = '', radioGenre = 'All', radioLoading = false, radioLoaded = false, radioError = '', radioGeneration = 0, radioTimer;
let searchTimer, searchController;
let homeZone = 'All';
let features, endOfSongTimer = false;
let sessionSeconds = 0, sessionCounted = false;
let fileBackend = false;
let tvRemoteDetails = null;
let hls;
let pendingResumePosition = null;
window.groveBack = () => { const open = document.querySelector('dialog[open]'); if (open) { open.close('cancel'); return true; } if (query) { query = ''; $('#search').value = ''; render(); return true; } if (view !== 'home') { view = 'home'; render(); return true; } return false; };
function toast(message) { $('#toast').textContent = message; $('#toast').style.display = 'block'; clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('#toast').style.display = 'none', 5000); }
function save() { state.queue = { ids: queue.map(t => t.id), tracks: [...new Map(queue.map(t => [t.id, t])).values()], index, position: pendingResumePosition ?? activeAudio.currentTime ?? 0 }; const snapshot = structuredClone(state); saveChain = saveChain.catch(() => {}).then(async () => { await dbWrite(db, 'state', 'library', snapshot); if (isNative) await nativeRequest('library', snapshot); }); saveChain.catch(() => toast('Could not save your library. Check available storage.')); return saveChain; }
const art = t => safeUrl(t?.artwork) ? `<img src="${esc(safeUrl(t.artwork))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : icon(t?.kind === 'radio' ? 'radio' : 'music');
const time = n => !Number.isFinite(n) ? 'LIVE' : `${Math.floor(Math.max(0, n) / 60)}:${String(Math.floor(Math.max(0, n) % 60)).padStart(2, '0')}`;
const trackById = id => state.tracks.find(t => t.id === id) || stations.find(t => t.id === id) || radioResults.find(t => t.id === id) || onlineResults.find(t => t.id === id);
function top(title, description) { return `<div class="page-top"><span class="eyebrow">YOUR MUSIC, YOUR SPACE</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>`; }
function cards(tracks) { return `<div class="cards">${tracks.map(t => `<button class="card" data-play="${esc(t.id)}"><div class="cover">${art(t)}</div><strong>${esc(t.title)}</strong><small>${esc(t.artist || 'Your library')}</small></button>`).join('')}</div>`; }
function radioCards(tracks) { return `<div class="radio-grid">${tracks.map(t => `<div class="radio-tile"><button class="radio-tile-play" data-play="${esc(t.id)}"><div class="cover">${art(t)}</div><span><strong>${esc(t.title)}</strong><small>${esc(t.artist)}${t.countrycode ? ' · ' + esc(t.countrycode) : ''}</small></span><em>LIVE</em></button><button class="radio-tile-like ${state.liked.includes(t.id) ? 'liked' : ''}" data-like="${esc(t.id)}" aria-label="${state.liked.includes(t.id) ? 'Unlike' : 'Like'} ${esc(t.title)}">${state.liked.includes(t.id) ? '♥' : '♡'}</button></div>`).join('')}</div>`; }
function rows(tracks, queueView = false) {
  if (view === 'library') tracks = sortTracks(tracks, state.settings.sort);
  if (!tracks.length) return `<div class="empty"><h3>A little room for your favorites.</h3><p>Import your music files, add an audio link, or explore radio to get started.</p><button class="primary" data-action="import">Import music</button> <button class="secondary" data-action="url">Add audio link</button></div>`;
  return `<div class="rows">${tracks.map((t, n) => `<div class="track ${current?.id === t.id ? 'current' : ''}" data-play-row><span class="number">${String(n + 1).padStart(2, '0')}</span><div class="cover">${art(t)}</div><button class="track-name" ${queueView ? `data-queue-play="${n}"` : `data-play="${esc(t.id)}"`}><strong>${esc(t.title)}</strong><small>${esc(t.artist || (t.kind === 'local' ? 'Offline audio' : 'Audio link'))}${t.recommendation ? (t.recommendation.method === 'ai' ? ' · ✦ On-device AI pick' : ' · ✦ Recommended') : ''}</small></button><button data-like="${esc(t.id)}" class="${state.liked.includes(t.id) ? 'liked' : ''}" aria-label="${state.liked.includes(t.id) ? 'Unlike' : 'Like'} ${esc(t.title)}">${state.liked.includes(t.id) ? '♥' : '♡'}</button>${queueView ? `<div class="queue-actions"><button data-up="${n}" aria-label="Move up" ${n === 0 ? 'disabled' : ''}>↑</button><button data-remove-queue="${n}" aria-label="Remove from queue">×</button></div>` : `<button data-menu="${esc(t.id)}" aria-label="Actions for ${esc(t.title)}">＋</button>`}</div>`).join('')}</div>`;
}
function filtered(tracks) { return tracks.filter(t => `${t.title} ${t.artist}`.toLowerCase().includes(query.toLowerCase())); }
function render() {
  const content = $('#content');
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#playlist-nav').innerHTML = state.playlists.map(p => `<button data-view="playlist:${esc(p.id)}" class="${view === 'playlist:' + p.id ? 'active' : ''}">♫ ${esc(p.name)}</button>`).join('');
  if (!query && features?.custom(view)) { features.enhance(view); updatePlayer(); return; }
  if (query) {
    const localMatches = filtered([...state.tracks, ...stations.filter(s => !state.tracks.some(t => t.id === s.id))]);
    const onlineContent = onlineQuery === query ? (onlineResults.length ? rows(onlineResults) : '<p class="search-empty">No YouTube songs found. Try a different search.</p>') : state.settings.offline ? '<p class="search-empty">Turn off offline mode to search YouTube.</p>' : '<p class="search-empty">Songs will appear here as you type.</p>';
    content.innerHTML = top('Find your next listen', `Music results for “${query}”. Tap a song to play.`)
      + `<div class="section-heading search-heading"><h2>YouTube music</h2></div>`
      + (searching ? '<p class="search-status" role="status">Searching YouTube Music songs…</p>' : '') + onlineContent
      + `<div class="section-heading"><h2>On this device</h2></div>`
      + (localMatches.length ? rows(localMatches) : '<p class="search-empty">No matching songs on this device.</p>');
  }
  else if (view === 'home') {
    const recent = state.history.map(trackById).filter(Boolean).slice(0, 4);
    const hour = new Date().getHours(), greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const featured = current || recent[0];
    const zones = ['All', ...new Set(stations.map(t => t.artist).filter(Boolean))];
    const collection = state.tracks.length ? state.tracks : stations;
    const picks = homeZone === 'All' ? collection : stations.filter(t => t.artist === homeZone);
    content.innerHTML = `<div class="home-heading">${top(greeting, 'A place for everything you love to hear.')}<span class="home-date">${new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</span></div>`
      + `<div class="home-feature"><section class="hero"><div class="hero-copy"><span class="eyebrow">${featured ? 'PICK UP WHERE YOU LEFT OFF' : 'YOUR NEXT FAVORITE IS OUT THERE'}</span><h2>${esc(featured?.title || 'Less scrolling.\nMore listening.')}</h2><p>${esc(featured?.artist || 'A familiar favorite. A station far away. Whatever sounds like you today.')}</p><div class="hero-actions"><button class="primary" ${featured ? `data-play="${esc(featured.id)}"` : 'data-view="browse"'}>${featured ? '▶ Play now' : 'Find your sound ↗'}</button><button class="secondary" data-action="import">＋ Import music</button></div></div><div class="hero-art cover" aria-hidden="true">${featured ? art(featured) : '<img src="./brand/zonic-mark-512.png" alt="">'}</div></section>`
      + `<section class="discovery-panel"><div class="discovery-heading"><span class="eyebrow">ALWAYS SOMETHING ON</span><h2>Live, right now <span>●</span></h2></div>${stations.slice(0,3).map(t => `<button class="live-pick" data-play="${esc(t.id)}"><span class="cover">${art(t)}</span><span><strong>${esc(t.title)}</strong><small>${esc(t.artist)} · Live radio</small></span><span class="live-play">▶</span></button>`).join('')}<button class="discover-all" data-view="radio">Explore all stations ↗</button></section></div>`
      + `<div class="home-shortcuts" aria-label="Quick access"><button data-view="liked"><span class="shortcut-symbol">♥</span><span><strong>Your favorites</strong><small>All your liked songs</small></span><span class="shortcut-arrow">↗</span></button><button data-view="library"><span class="shortcut-symbol">▤</span><span><strong>Your collection</strong><small>Music that goes with you</small></span><span class="shortcut-arrow">↗</span></button><button data-view="browse"><span class="shortcut-symbol">✦</span><span><strong>Something new</strong><small>Discover your next obsession</small></span><span class="shortcut-arrow">↗</span></button></div>`
      + `<div class="section-heading"><h2>${recent.length ? 'Continue listening' : 'Start listening'}</h2><button data-view="${recent.length ? 'recent' : 'radio'}">See all ↗</button></div>`
      + `<div class="music-shelf">${cards(recent.length ? recent : stations.slice(0, 6))}</div>`
      + `<div class="section-heading"><h2>Explore your way</h2><button data-view="library">Open library ↗</button></div><p class="section-subtitle">Choose a sound, then press play.</p><div class="zone-chips">${zones.map(z => `<button class="zone-chip ${z === homeZone ? 'active' : ''}" data-zone="${esc(z)}" aria-pressed="${z === homeZone}">${esc(z)}</button>`).join('')}</div>` + cards(picks.slice(0, 18));
  } else if (view === 'browse') {
    content.innerHTML = top('Browse', 'Search songs and artists, or find a station to fit your mood.') + `<div class="zone-chips">${['Night drive', 'Golden hour', 'Deep focus', 'New releases'].map(q => `<button class="zone-chip" data-browse-query="${q}">${q}</button>`).join('')}</div><div class="section-heading"><h2>Explore radio</h2><button data-view="radio">All stations ↗</button></div>` + cards(stations.slice(0, 6)) + `<div class="section-heading"><h2>Your music</h2><button data-view="library">Open library ↗</button></div>` + rows(state.tracks.slice(0, 12));
  } else if (view === 'library') content.innerHTML = top('Your library', `${state.tracks.length} tracks. A collection that feels like you.`) + `<div class="section-heading"><h2>All your music</h2><div><button data-action="import">＋ Import music</button><button data-action="url">＋ Audio link</button><button data-action="playlist-url">Playlist link</button><button data-action="spotify">Spotify CSV</button></div></div>` + rows(state.tracks);
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
    content.innerHTML = top(p.name, `${p.tracks.length} tracks in your playlist.`) + `<div class="section-heading"><div><button class="primary" data-playlist-play="${esc(p.id)}">▶ Play playlist</button> <button data-rename-playlist="${esc(p.id)}">Rename</button></div><button class="danger" data-delete-playlist="${esc(p.id)}">Delete playlist</button></div>` + rows(p.tracks.map(trackById).filter(Boolean));
  } else if (view === 'recap') {
    const entries = Object.entries(state.stats), seconds = entries.reduce((s, [, v]) => s + v.seconds, 0), plays = entries.reduce((s, [, v]) => s + v.plays, 0);
    content.innerHTML = top('Your listening story', 'Listening totals for this web library, since your first play.') + `<div class="stat-cards"><div class="stat"><strong>${Math.floor(seconds / 60)}</strong><small>Minutes listened</small></div><div class="stat"><strong>${plays}</strong><small>Tracks started</small></div><div class="stat"><strong>${entries.filter(([, s]) => s.seconds > 0).length}</strong><small>Tracks enjoyed</small></div></div><h2>Your most played</h2>` + rows(entries.sort((a, b) => b[1].seconds - a[1].seconds).map(([id]) => trackById(id)).filter(Boolean).slice(0, 10));
  } else if (view === 'settings') {
    const youtubeCount = state.playlists.filter(p => /^https:\/\/(?:www\.|music\.)?youtube\.com\/.*[?&]list=/.test(p.source || '')).length;
    content.innerHTML = top('Settings', 'Shape your sound and keep your music together.')
      + `<div class="settings-intro"><div><span class="settings-kicker">ZONIC CONTROL ROOM</span><h2>Make it yours.</h2><p>Set up your library, choose how music plays, and connect every screen.</p></div><div class="settings-intro-mark" aria-hidden="true">♫</div></div>`
      + `<nav class="settings-jump" aria-label="Settings sections"><a href="#settings-library">Library & sync</a><a href="#settings-playback">Playback</a><a href="#settings-display">Display & TV</a><a href="#settings-about">About</a></nav>`
      + `<div class="settings-grid"><section class="settings-card settings-card-wide" id="settings-library"><span class="settings-card-kicker">01 · YOUR COLLECTION</span><h3>Library & YouTube sync</h3><p>Imported YouTube playlists can collect newly uploaded songs automatically while Zonic is open.</p><div class="settings-sync-summary"><strong>${youtubeCount} linked playlist${youtubeCount === 1 ? '' : 's'}</strong><span>Checked when Zonic opens and every 15 minutes</span></div><div class="settings-actions"><button class="primary" data-action="playlist-url">Import YouTube playlist</button><button data-action="import">Import music</button><button data-action="spotify">Import Spotify CSV</button><button data-action="new-playlist">Create playlist</button></div></section>`
      + `<section class="settings-card" id="settings-playback"><span class="settings-card-kicker">02 · LISTENING</span><h3>Playback</h3><label>Sleep timer <select id="sleep"><option value="0">Off</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></label><label><input type="checkbox" id="sponsor-block" ${state.settings.sponsorBlock ? 'checked' : ''}> SponsorBlock for YouTube tracks</label><label><input type="checkbox" id="eq-enabled" ${state.settings.eqEnabled ? 'checked' : ''}> Equalizer for local audio</label><div class="bands">${[60, 250, 1000, 4000, 12000].map((f, i) => `<label>${f < 1000 ? f : f / 1000 + 'k'} Hz<input type="range" min="-12" max="12" step="1" value="${state.settings.eq[i]}" data-band="${i}" aria-label="${f} Hz gain"><small id="gain-${i}">${state.settings.eq[i]} dB</small></label>`).join('')}</div><button data-action="reset-eq">Reset equalizer</button></section>`
      + `<section class="settings-card" id="settings-display"><span class="settings-card-kicker">03 · EVERY SCREEN</span><h3>Display & TV</h3>${isTelevision ? '<p>TV mode is on automatically for this device.</p>' : `<button data-action="tv">${state.settings.tv ? 'Disable' : 'Enable'} TV mode</button>`}<p>Use arrow keys to move focus, Enter to select, and Escape to return home.</p>${isTelevision ? `<div class="settings-tv-remote"><h4>Control from your phone</h4>${tvRemoteDetails ? `<p>On the same Wi-Fi network, open <strong>${esc(tvRemoteDetails.url)}</strong> on your phone.</p><p>Pairing code: <strong>${esc(tvRemoteDetails.pin)}</strong></p>` : '<p>Connect this TV to Wi-Fi to enable phone control.</p>'}</div>` : ''}</section>`
      + `<section class="settings-card" id="settings-backup"><span class="settings-card-kicker">04 · KEEP IT SAFE</span><h3>Backup & restore</h3><p>Save your playlists, favorites, settings, and listening history. Audio backups can include music stored on this device.</p><div class="settings-actions"><button class="primary" data-action="export">Export library</button><button data-action="restore">Restore backup</button></div></section>`
      + `<section class="settings-card" id="settings-about"><span class="settings-card-kicker">05 · ZONIC</span><h3>About</h3><p>Musify music sources and native background audio, with one interface across desktop, Android, and Android TV.</p><a href="./LICENSE" target="_blank">GPLv3 license ↗</a></section></div>`;
    if (isNative && !isTelevision) content.querySelector('.settings-grid').insertAdjacentHTML('beforeend', '<section class="settings-card"><h3>Connect to TV</h3><p>With your phone and TV on the same network, enter the remote address shown in Zonic Settings on the TV.</p><button class="primary" data-action="connect-tv">Connect to TV</button></section>');
    $('#sleep').value = String(sleepTimeout ? sleepTimeout.minutes : 0);
  }
  updatePlayer();
  features?.enhance(view); decorateButtons();
}
function updatePlayer() {
  $('#now-title').textContent = current?.title || 'Your next favorite awaits';
  $('#now-artist').textContent = current?.artist || (current ? 'Your library' : 'Import music or tune into radio');
  $('#now-art').innerHTML = art(current);
  const upcoming = queue.map((track, position) => ({ track, position })).filter(item => item.position > index).slice(0, 8);
  $('#queue-preview').innerHTML = upcoming.length ? upcoming.map(({ track, position }) => `<button class="queue-preview-track" data-queue-play="${position}"><div class="cover">${art(track)}</div><span><strong>${esc(track.title)}</strong><small>${esc(track.artist || 'Your library')}${track.recommendation ? ' · ✦ Pick' : ''}</small></span></button>`).join('') : `<div class="queue-empty"><span>${icon('music')}</span><p>Your next listen starts here.</p><button data-view="library">Choose some music</button></div>`;
  const palettes = [['#6c5cff', '#ff6b81'], ['#443a93', '#ee7f9d'], ['#426596', '#8973db'], ['#9a526e', '#ffb36b']];
  const palette = palettes[current ? [...current.id].reduce((n, c) => n + c.charCodeAt(0), 0) % palettes.length : 0];
  document.documentElement.style.setProperty('--c1', palette[0]); document.documentElement.style.setProperty('--c2', palette[1]);
  $('#play').textContent = activeAudio.paused ? '▶' : 'Ⅱ'; $('#play').ariaLabel = activeAudio.paused ? 'Play' : 'Pause';
  $('#now-like').textContent = current && state.liked.includes(current.id) ? '♥' : '♡';
  $('#now-like').classList.toggle('liked', !!current && state.liked.includes(current.id));
  for (const key of ['shuffle', 'repeat']) { $('#' + key).classList.toggle('liked', state.settings[key]); $('#' + key).setAttribute('aria-pressed', state.settings[key]); }
  $('#shuffle').textContent = state.settings.smartShuffle ? '✦' : '⤨'; $('#shuffle').ariaLabel = state.settings.smartShuffle ? 'Smart Shuffle on; turn shuffle off' : state.settings.shuffle ? 'Random shuffle on; enable Smart Shuffle' : 'Shuffle off; enable random shuffle'; $('#shuffle').title = $('#shuffle').ariaLabel;
  document.body.classList.toggle('tv', state.settings.tv || isTelevision); $('#tv-mode').setAttribute('aria-pressed', state.settings.tv || isTelevision); $('#tv-mode').hidden = isTelevision;
  decorateButtons();
}
async function ask(title, label, value = '') {
  const dialog = $('#dialog'); $('#dialog-title').textContent = title; $('#dialog-label').textContent = label; $('#dialog-input').value = value; dialog.returnValue = '';
  dialog.showModal(); $('#dialog-input').focus();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm' ? $('#dialog-input').value.trim() : null), { once: true }));
}
async function ensureEq() {
  if (!state.settings.eqEnabled) return;
  if (!context) {
    context = new AudioContext();
    const local = $('#local-audio');
    const source = context.createMediaElementSource(local);
    filters = [60, 250, 1000, 4000, 12000].map(f => { const filter = context.createBiquadFilter(); filter.type = 'peaking'; filter.frequency.value = f; filter.Q.value = 1; return filter; });
    let previous = source; for (const filter of filters) { previous.connect(filter); previous = filter; } previous.connect(context.destination);
  }
  filters.forEach((f, i) => f.gain.value = state.settings.eqEnabled ? state.settings.eq[i] : 0);
  await context.resume();
}
// A separate element keeps cross-origin radio out of Web Audio's CORS restrictions.
const localAudio = document.createElement('audio'); localAudio.id = 'local-audio'; localAudio.preload = 'metadata'; document.body.append(localAudio);
let activeAudio = audio;
async function playTrack(track, list = null, at = null) {
  if (!track) return;
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
  audio.pause(); localAudio.pause();
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
      else if (!blob) { track.downloaded = false; url = streamUrl(track.ytid, state.settings.quality); }
      else {
      blobUrl = URL.createObjectURL(blob); url = blobUrl;
      }
    } else if (track.kind === 'youtube') url = streamUrl(track.ytid, state.settings.quality);
    else if (!safeUrl(url)) throw new Error('This track has no playable audio URL.');
    if (list) { queue = [...list]; index = at ?? queue.findIndex(t => t.id === track.id); }
    else if (at !== null) index = at;
    else { queue = [track]; index = 0; }
    current = track; activeAudio = blobUrl || track.kind === 'youtube' || track.kind === 'local' || track.downloaded ? localAudio : audio;
    activeAudio.volume = state.settings.volume;
    if (track.isLive && track.kind === 'youtube' && Hls.isSupported()) {
      hls = new Hls({ startLevel: 0, maxBufferLength: 30 });
      hls.loadSource(streamUrl(track.ytid, state.settings.quality) + '&live=1'); hls.attachMedia(activeAudio);
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal && token === playToken) toast('Live playback failed: ' + data.details); });
    } else activeAudio.src = track.isLive && track.kind === 'youtube' ? streamUrl(track.ytid, state.settings.quality) + '&live=1' : url;
    if (activeAudio === localAudio) await ensureEq();
    if (token !== playToken) return;
    await activeAudio.play();
    if (token !== playToken) return;
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
    return await advance(automatic);
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
function previous() { if (nativeAudio) return nativeAudio.command('previous').catch(e => toast(e.message)); if (activeAudio.currentTime > 3 && Number.isFinite(activeAudio.duration)) activeAudio.currentTime = 0; else if (index > 0) playTrack(queue[index - 1], null, index - 1); }
async function like(id) { const t = trackById(id); if (!t) return; if (!state.tracks.some(t => t.id === id)) state.tracks.push(t); state.liked = state.liked.includes(id) ? state.liked.filter(x => x !== id) : [...state.liked, id]; await save(); render(); }
async function importFiles(files) {
  let count = 0;
  for (const file of files) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|flac|ogg|wav|m4a|aac|opus)$/i.test(file.name)) continue;
    const existing = state.tracks.find(t => t.kind === 'local' && t.filename === file.name);
    const id = existing?.id || crypto.randomUUID();
    try {
      if (isNative) await nativeRequest('file', undefined, { blob: file, id });
      else if (fileBackend) { const response = await fetch('./api/file?id=' + encodeURIComponent(id), { method: 'POST', body: file }); if (!response.ok) throw new Error('Audio import failed.'); }
      else await dbWrite(db, 'files', id, file);
      if (!existing) { const title = file.name.replace(/\.[^.]+$/, ''), parts = title.split(' - '); state.tracks.push({ id, kind: 'local', filename: file.name, addedAt: Date.now(), title: parts.length > 1 ? parts.slice(1).join(' - ') : title, artist: parts.length > 1 ? parts[0] : 'Local music' }); }
      count++;
    } catch { toast('Storage is full or unavailable. Some files could not be imported.'); break; }
  }
  await save(); view = 'library'; query = ''; $('#search').value = ''; render(); toast(`${count} audio file${count === 1 ? '' : 's'} imported for offline listening.`);
}
async function newPlaylist() { const name = await ask('A playlist of your own', 'Give your playlist a name'); if (!name) return; const p = { id: crypto.randomUUID(), name, tracks: [] }; state.playlists.push(p); save(); view = 'playlist:' + p.id; query = ''; render(); }
async function action(name) {
  if (name === 'import') $('#music-files').click();
  if (name === 'new-playlist') await newPlaylist();
  if (name === 'tv' && !isTelevision) { state.settings.tv = !state.settings.tv; save(); render(); }
  if (name === 'connect-tv') { const address = await ask('Connect to your TV', 'Remote address shown in TV Settings, including http:// and port'); if (!address) return; const url = tvRemoteUrl(address); if (!url) return toast('Enter the local network address shown on your TV.'); location.href = url; }
  if (name === 'url') {
    const url = await ask('Add an audio link', 'Direct HTTP/HTTPS audio URL (not a YouTube page)'); if (!url) return;
    if (!safeUrl(url)) return toast('Enter a valid HTTP or HTTPS audio URL.');
    const title = await ask('Name your audio', 'Track or station name'); if (!title) return;
    state.tracks.push({ id: crypto.randomUUID(), title, artist: 'Audio link', kind: 'url', url: safeUrl(url) }); save(); render();
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
    const input = await ask('Import a YouTube playlist', 'Paste a YouTube playlist link or ID'); if (!input) return;
    let id = input; try { const u = new URL(input); if (!['youtube.com', 'www.youtube.com', 'music.youtube.com'].includes(u.hostname)) throw new Error(); id = u.searchParams.get('list'); } catch { if (input.includes('://')) return toast('Enter a YouTube playlist URL.'); }
    toast('Importing playlist…');
    try { const data = await api('playlist', { id }); for (const t of data.tracks) if (!state.tracks.some(x => x.id === t.id)) state.tracks.push(t); const p = { id: crypto.randomUUID(), name: data.name, tracks: data.tracks.map(t => t.id), source: data.source }; state.playlists.push(p); save(); view = 'playlist:' + p.id; query = ''; $('#search').value = ''; render(); toast(`Imported ${data.tracks.length} tracks.`); } catch (e) { toast(e.message); }
  }
  if (name === 'spotify') { if (spotifyImporting) return toast('A Spotify import is already running.'); $('#spotify-file').click(); }
}
document.addEventListener('click', async event => {
  const b = event.target.closest('button');
  if (!b) { event.target.closest('[data-play-row]')?.querySelector('.track-name')?.click(); return; }
  if (b.dataset.zone) { homeZone = b.dataset.zone; render(); }
  if (b.dataset.browseQuery) { query = b.dataset.browseQuery; $('#search').value = query; render(); action('online-search'); }
  if (b.dataset.view) { view = b.dataset.view; query = ''; $('#search').value = ''; render(); $('main').scrollTo(0, 0); if (view === 'browse') $('#search').focus(); if (view === 'radio' && !radioLoaded && !radioLoading) loadRadio(); }
  if (b.dataset.radioGenre) { radioGenre = b.dataset.radioGenre; radioResults = []; radioLoaded = false; render(); loadRadio(); }
  if (b.hasAttribute('data-radio-search')) { radioQuery = $('#radio-search')?.value.trim() || ''; loadRadio(); }
  if (b.dataset.action) await action(b.dataset.action);
  if (b.dataset.play) {
    const t = trackById(b.dataset.play);
    let list = [t];
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
    if (b.dataset.menu) {
    const track = trackById(b.dataset.menu);
    const choice = await ask('Track actions', `Type “queue” to add to queue${view.startsWith('playlist:') ? ', “remove” to remove from this playlist' : ''}, or a playlist name.`, 'queue');
    if (!choice) return;
    if (choice === 'queue') {
      queue.push(track);
      if (isNative) await nativeRequest('queue-add', { track });
      await save();
      toast('Added to your queue.');
    }
    else if (choice === 'remove' && view.startsWith('playlist:')) { const p = state.playlists.find(p => 'playlist:' + p.id === view); p.tracks = p.tracks.filter(id => id !== track.id); save(); }
    else { const p = state.playlists.find(p => p.name.toLowerCase() === choice.toLowerCase()); if (!p) return toast('Create that playlist first.'); if (!state.tracks.some(t => t.id === track.id)) state.tracks.push(track); if (!p.tracks.includes(track.id)) p.tracks.push(track.id); save(); toast('Added to ' + p.name); }
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
$('#import-music').onclick = () => action('import'); $('#new-playlist').onclick = newPlaylist; $('#tv-mode').onclick = () => action('tv');
$('#music-files').onchange = async e => { await importFiles(e.target.files); e.target.value = ''; };
$('#spotify-file').onchange = async e => {
  const file = e.target.files[0]; if (!file || spotifyImporting) return; spotifyImporting = true;
  try { if (file.size > 2 * 1024 * 1024) throw new Error('CSV must be smaller than 2 MB.'); const rows = parseSpotifyCsv(await file.text()); if (rows.length > 500) throw new Error('Import up to 500 tracks at a time.'); const name = await ask('Import Spotify CSV', 'Name this playlist', file.name.replace(/\.csv$/i, '')); if (!name) return;
    const p = { id: crypto.randomUUID(), name, tracks: [] }; let missed = 0;
    for (const [i, row] of rows.entries()) { toast(`Matching ${i + 1} of ${rows.length} songs…`); try { const t = await api('match', { ...row, q: row.title + ' ' + row.artist }); if (!t) { missed++; continue; } if (!state.tracks.some(x => x.id === t.id)) state.tracks.push(t); if (!p.tracks.includes(t.id)) p.tracks.push(t.id); } catch { missed += rows.length - i; break; } }
    if (p.tracks.length) { state.playlists.push(p); await save(); view = 'playlist:' + p.id; query = ''; $('#search').value = ''; render(); } toast(`Imported ${p.tracks.length} tracks; ${missed} could not be matched.`);
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
$('#seek').oninput = e => { if (Number.isFinite(activeAudio.duration)) activeAudio.currentTime = activeAudio.duration * +e.target.value / 100; };
document.addEventListener('change', async e => {
  if (e.target.id === 'sleep') { if (sleepTimeout) clearTimeout(sleepTimeout.id); const minutes = +e.target.value; sleepTimeout = minutes ? { minutes, id: setTimeout(() => { activeAudio.pause(); sleepTimeout = null; toast('Sleep timer finished.'); }, minutes * 60000) } : null; toast(minutes ? `Playback will pause in ${minutes} minutes.` : 'Sleep timer off.'); }
  if (isNative && e.target.id === 'sleep') nativeRequest('sleep', { minutes: +e.target.value }).catch(e => toast(e.message));
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
for (const element of [audio, localAudio, ...(nativeAudio ? [nativeAudio] : [])]) {
  element.addEventListener('play', () => { updatePlayer(); if (element === activeAudio) { $('#play').ariaLabel = 'Pause'; decorateButtons(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; } });
  element.addEventListener('pause', () => { updatePlayer(); if (element === activeAudio) { $('#play').ariaLabel = 'Play'; decorateButtons(); save(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; } });
  element.addEventListener('ended', () => { if (element !== activeAudio) return; if (endOfSongTimer) { endOfSongTimer = false; activeAudio.pause(); return; } next(true); });
  element.addEventListener('error', () => { if (element === activeAudio) toast('The audio source could not be played. Try another file or station.'); });
  element.addEventListener('timeupdate', () => { if (element !== activeAudio) return; if (state.settings.sponsorBlock) { const skip = segments.find(s => Array.isArray(s.segment) && element.currentTime >= s.segment[0] && element.currentTime < s.segment[1]); if (skip && Number.isFinite(skip.segment[1])) element.currentTime = skip.segment[1]; } $('#elapsed').textContent = time(element.currentTime); $('#duration').textContent = time(element.duration); $('#seek').disabled = !Number.isFinite(element.duration); $('#seek').value = Number.isFinite(element.duration) && element.duration ? element.currentTime / element.duration * 100 : 0; });
}
let lastTick = performance.now();
setInterval(() => { const now = performance.now(), delta = Math.min(2, (now - lastTick) / 1000); lastTick = now; if (current && !activeAudio.paused && !activeAudio.ended && activeAudio.readyState >= 3) { const s = state.stats[current.id]; if (s) s.seconds += delta; const key = new Date().toLocaleDateString('sv-SE').slice(0, 7); const month = state.months[key] ||= { totalSeconds: 0, songs: {} }; month.totalSeconds += delta; const song = month.songs[current.id] ||= { seconds: 0, plays: 0 }; const threshold = current.duration && current.duration < 60 ? Math.max(.5, current.duration / 2) : 30; sessionSeconds += delta; if (!sessionCounted && sessionSeconds >= threshold) { song.plays++; sessionCounted = true; } song.seconds += delta; } }, 1000);
setInterval(() => { if (current && !activeAudio.paused) save(); }, 15000);
document.addEventListener('visibilitychange', () => { if (document.hidden && db) save(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); window.groveBack(); return; }
  if ($('#dialog').open || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
  if (e.key === ' ' && e.target === document.body) { e.preventDefault(); toggle(); }
  if (e.key === 'Escape') { view = 'home'; query = ''; $('#search').value = ''; render(); }
  if (!(state.settings.tv || isTelevision) || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  const visible = [...document.querySelectorAll('button,input,a,select')].filter(x => !x.disabled && x.getClientRects().length);
  const from = document.activeElement.getBoundingClientRect(), cx = from.x + from.width / 2, cy = from.y + from.height / 2;
  const targets = visible.filter(x => x !== document.activeElement).map(x => { const r = x.getBoundingClientRect(); const dx = r.x + r.width / 2 - cx, dy = r.y + r.height / 2 - cy; const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight'; const along = horizontal ? dx : dy, cross = horizontal ? dy : dx; const positive = e.key === 'ArrowRight' || e.key === 'ArrowDown'; return { x, valid: positive ? along > 8 : along < -8, score: Math.abs(along) + Math.abs(cross) * 3 }; }).filter(x => x.valid).sort((a, b) => a.score - b.score);
  if (targets[0]) { e.preventDefault(); targets[0].x.focus(); targets[0].x.scrollIntoView({ block: 'nearest' }); }
});
try {
  db = await openLibraryDatabase(); const saved = await dbRead(db, 'state', 'library') || (isNative ? await nativeRequest('library') : null); if (saved) state = validateBackup(saved);
  await loadLanguages();
  if (!isNative) try { fileBackend = (await api('health', {}, { signal: AbortSignal.timeout(2000) })).fileStorage === true; } catch {}
  features = new Features({ get state() { return state; }, get db() { return db; }, get view() { return view; }, get current() { return current; }, get fileBackend() { return fileBackend; }, findTrack: trackById, top, rows, cards, ask, toast, save, render, playTrack,
    navigate(v) { view = v; query = ''; $('#search').value = ''; render(); }, async replaceState(value) { activeAudio.pause(); if (isNative) { nativeAudio.pending = true; try { await nativeRequest('restore-library', value); } finally { nativeAudio.pending = false; } } else { audio.removeAttribute('src'); localAudio.removeAttribute('src'); audio.load(); localAudio.load(); if (hls) { hls.destroy(); hls = null; } } state = value; pendingResumePosition = state.queue.position; queue = state.queue.ids.map(id => state.queue.tracks?.find(t => t.id === id) || state.tracks.find(t => t.id === id)).filter(Boolean); index = Math.min(state.queue.index, queue.length - 1); current = index >= 0 ? queue[index] : null; audio.volume = localAudio.volume = state.settings.volume; $('#volume').value = state.settings.volume; }, registerResult(t) { if (!onlineResults.some(x => x.id === t.id)) onlineResults.push(t); },
    enqueue(t, next = false) { if (next) queue.splice(index + 1, 0, t); else queue.push(t); if (isNative) nativeRequest('queue-add', { track: t, next }).catch(e => toast(e.message)); save(); toast('Added to queue.'); },
    moveQueue(from, to) { if (from < 0 || from >= queue.length || to < 0 || to >= queue.length) return; const track = queue.splice(from, 1)[0]; queue.splice(to, 0, track); index = queue.findIndex(t => t.id === current?.id); if (isNative) nativeRequest('queue-move', { from, to }).catch(e => toast(e.message)); save(); render(); },
    clearQueue() { queue = []; index = -1; activeAudio.pause(); if (isNative) nativeRequest('queue-clear', {}).catch(e => toast(e.message)); save(); }, endTimer() { endOfSongTimer = true; }, cancelTimer() { endOfSongTimer = false; if (sleepTimeout) clearTimeout(sleepTimeout.id); sleepTimeout = null; },
    async setEq() { if (isNative) await nativeRequest('settings', state.settings); else { if (state.settings.eqEnabled) await ensureEq(); filters.forEach((f, i) => f.gain.value = state.settings.eqEnabled ? state.settings.eq[i] : 0); } }
  });
  queue = state.queue.ids.map(id => state.queue.tracks?.find(t => t.id === id) || trackById(id)).filter(Boolean); index = Math.min(state.queue.index, queue.length - 1); if (index >= 0) { current = queue[index]; pendingResumePosition = state.queue.position; }
  const response = await fetch('./src/radio.json'); if (!response.ok) throw new Error('Could not load radio collection.'); stations = await response.json();
  $('#volume').value = state.settings.volume; audio.volume = localAudio.volume = state.settings.volume; render(); features.startPlaylistSync();
  if (nativeAudio) {
    activeAudio = nativeAudio;
    if (isTelevision) render();
    nativeAudio.addEventListener('nativeerror', e => toast(e.detail));
    nativeAudio.addEventListener('nativestate', e => { const data = e.detail; const remote = data.platform?.remote || null; if (remote?.url !== tvRemoteDetails?.url || remote?.pin !== tvRemoteDetails?.pin) { tvRemoteDetails = remote; if (view === 'settings') render(); } if (!nativeAudio.pending && data.track) { const changed = current?.id !== data.track.id; if (changed) { sessionSeconds = 0; sessionCounted = false; } current = trackById(data.track.id) || data.track; queue = data.queue; index = data.index; if (changed) { if (!state.tracks.some(t => t.id === current.id)) state.tracks.push(current); state.history = [current.id, ...state.history.filter(id => id !== current.id)].slice(0, 100); save(); render(); } if (data.platform?.accent) { features.systemAccent = data.platform.accent; if (state.settings.dynamicColor) document.documentElement.style.setProperty('--accent', data.platform.accent); } } });
    nativeAudio.startPolling();
    let processingIntents = false;
    nativeAudio.addEventListener('nativestate', async e => { if (!e.detail.intentCount || processingIntents) return; processingIntents = true; try { const links = await nativeRequest('intents'); for (const link of links) await features.openLink(link); } catch (error) { toast(error.message); } finally { processingIntents = false; } });
  }
} catch (e) { $('#content').innerHTML = top('Your library needs attention', e.message) + '<p>Use a browser that supports IndexedDB, and check that device storage is available.</p>'; }
