import { decorateButtons } from './icons.js';
import { api, streamUrl } from './sources.js';
import { isNative, nativeRequest } from './native.js';
import { eqPreset, migrateMusify, validateBackup, safeUrl, safeArtwork, dbRead, dbWrite } from './library.js';
import { t, languageOptions, setLanguage, translateUi } from './i18n.js';
import { zipSync, unzipSync, strToU8, strFromU8 } from './zip.js';
import { checkUpdates } from './updates.js';
import { PLAYLIST_SYNC_INTERVAL, youtubePlaylistId, mergePlaylistTracks } from './playlist-sync.js';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = (key, fallback) => t(key) === key ? fallback : t(key);
export class Features {
  constructor(ctx) {
    this.ctx = ctx; this.pages = new Map(); this.track = null; this.downloads = new Map(); this.suggestionId = 0; this.syncingPlaylists = false; this.playlistSyncError = '';
    document.body.insertAdjacentHTML('beforeend', '<dialog id="track-sheet"></dialog><input id="archive-file" type="file" accept=".zip" hidden><input id="musify-file" type="file" accept=".hive" hidden>');
    document.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.artistPlayAll) {
        e.stopImmediatePropagation();
        const a = this.pages.get('artist:' + b.dataset.artistPlayAll);
        if (a?.tracks?.length) {
          for (const t of a.tracks) ctx.registerResult(t);
          ctx.playTrack(a.tracks[0], a.tracks, 0);
        }
        return;
      }
      if (b.dataset.menu) { e.stopImmediatePropagation(); this.openTrack(ctx.findTrack(b.dataset.menu)); }
      if (b.dataset.feature) { e.stopImmediatePropagation(); this.act(b.dataset.feature, b.dataset).catch(error => ctx.toast(error.message)); }
    }, true);
    document.addEventListener('change', e => this.change(e).catch(error => ctx.toast(error.message)));
    $('#archive-file').onchange = e => this.restoreArchive(e.target.files[0]).catch(error => ctx.toast(error.message));
    $('#musify-file').onchange = e => this.importMusify(e.target.files[0]).catch(error => ctx.toast(error.message));
    $('#search').addEventListener('input', () => {
      clearTimeout(this.suggestionTimer); const query = $('#search').value.trim(), id = ++this.suggestionId;
      this.suggestionTimer = setTimeout(async () => { if (query.length < 2 || ctx.state.settings.offline) return; try { const suggestions = await api('suggestions', { q: query }); if (id !== this.suggestionId) return; let list = $('#search-suggestions'); if (!list) { list = document.createElement('datalist'); list.id = 'search-suggestions'; document.body.append(list); $('#search').setAttribute('list', list.id); } list.innerHTML = suggestions.map(s => `<option value="${esc(s)}">`).join(''); } catch {} }, 350);
    });
    if (ctx.state.settings.autoUpdates && ctx.state.settings.updateRepository && !ctx.state.settings.offline) checkUpdates(ctx.state.settings.updateRepository).then(release => { this.release = release; if (release.available) ctx.toast(text('appUpdateIsAvailable', 'An update is available') + ': ' + release.version); }).catch(() => {});
    window.addEventListener('grove-link', e => this.openLink(e.detail).catch(error => ctx.toast(error.message)));
  }
  startPlaylistSync() {
    this.syncPlaylists().catch(() => {});
    setInterval(() => { if (!document.hidden) this.syncPlaylists().catch(() => {}); }, PLAYLIST_SYNC_INTERVAL);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.syncPlaylists().catch(() => {}); });
  }
  async syncPlaylists({ force = false, notify = false, playlistId = '' } = {}) {
    if (this.syncingPlaylists) { if (notify) this.ctx.toast('Playlist sync is already running.'); return; }
    if (this.state.settings.offline) { if (notify) this.ctx.toast('Turn off offline mode to sync YouTube playlists.'); return; }
    if (!force && this.state.settings.autoPlaylistSync === false) return;
    const eligible = this.state.playlists.filter(p => (!playlistId || p.id === playlistId) && youtubePlaylistId(p.source) && (force || Date.now() - (p.lastSyncedAt || 0) >= PLAYLIST_SYNC_INTERVAL));
    if (!eligible.length) { if (notify) this.ctx.toast('No YouTube playlists need syncing.'); return; }
    this.syncingPlaylists = true; this.playlistSyncError = ''; if (this.ctx.view === 'settings') this.ctx.render();
    let added = 0, completed = 0;
    try {
      for (const playlist of eligible) {
        try {
          const updated = await api('playlist', { id: youtubePlaylistId(playlist.source) });
          if (!Array.isArray(updated.tracks)) throw new Error('Playlist source returned no song list.');
          const current = this.state.playlists.find(p => p.id === playlist.id);
          if (!current) continue;
          for (const track of updated.tracks) if (track?.id && !this.state.tracks.some(t => t.id === track.id)) this.state.tracks.push(track);
          const before = new Set(current.tracks);
          current.tracks = mergePlaylistTracks(current.tracks, updated.tracks.map(t => t.id).filter(Boolean));
          added += current.tracks.filter(id => !before.has(id)).length;
          current.lastSyncedAt = Date.now(); completed++;
          await this.ctx.save();
        } catch (error) { this.playlistSyncError = error.message || 'Playlist sync failed.'; }
      }
      if (notify) this.ctx.toast(this.playlistSyncError ? `Synced ${completed} playlists. ${this.playlistSyncError}` : `Synced ${completed} playlists; ${added} new songs.`);
    } finally { this.syncingPlaylists = false; if (this.ctx.view === 'settings' || this.ctx.view.startsWith('playlist:')) this.ctx.render(); }
  }
  get state() { return this.ctx.state; }
  button(action, label, id = '') { return `<button data-feature="${action}" data-id="${esc(id)}">${esc(label)}</button>`; }
  applyTheme() {
    const s = this.state.settings; document.body.classList.toggle('light', s.theme === 'light' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches)); document.body.classList.toggle('black', s.theme === 'black'); document.documentElement.style.setProperty('--accent', isNative && s.dynamicColor && this.systemAccent ? this.systemAccent : (s.accent === '#c5ed9b' ? '#6c5cff' : s.accent)); setLanguage(s.language);
  }
  enhance(view) {
    this.applyTheme(); const content = $('#content'), s = this.state;
    if (view === 'library') {
      content.insertAdjacentHTML('afterbegin', `<div class="feature-toolbar">${[['downloads', 'Downloads'], ['recent', text('recentlyPlayed', 'Recently played')], ['artists', t('artists')], ['radio-favorites', 'Liked radio'], ['recap', text('timeMachine', 'Listening recap')]].map(([v, name]) => `<button data-view="${v}">${esc(name)}</button>`).join('')}${this.button('link-open', text('open', 'Open music link'))}<label>${text('sort', 'Sort')}<select data-feature-setting="sort">${['default', 'title', 'artist', 'added'].map(v => `<option value="${v}" ${s.settings.sort === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label></div>`);
      content.insertAdjacentHTML('beforeend', `<div class="section-heading"><h2>${esc(t('playlists'))}</h2>${this.button('folder-create', t('createFolder'))}</div><div class="playlist-grid">${[...s.playlists].sort((a, b) => Number(b.pinned) - Number(a.pinned)).map(p => `<div class="settings-card"><button data-view="playlist:${esc(p.id)}"><strong>${p.pinned ? '★ ' : ''}${esc(p.name)}</strong></button><small>${p.tracks.length} ${esc(t('songs'))}</small>${this.button('playlist-options', t('editPlaylist'), p.id)}</div>`).join('')}</div>`);
      for (const f of s.folders) content.insertAdjacentHTML('beforeend', `<section class="settings-card"><h3>${esc(f.name)}</h3>${s.playlists.filter(p => p.folderId === f.id).map(p => `<button data-view="playlist:${esc(p.id)}">${esc(p.name)}</button>`).join('')}${this.button('folder-rename', t('editFolder'), f.id)}${this.button('folder-delete', t('deleteFolder'), f.id)}</section>`);
    }
    if (view === 'radio') content.insertAdjacentHTML('afterbegin', this.button('radio-add', text('addRadioStation', 'Add radio station')));
    if (view.startsWith('playlist:')) { const p = s.playlists.find(p => 'playlist:' + p.id === view); if (p) { content.insertAdjacentHTML('afterbegin', `<div class="feature-toolbar">${this.button('playlist-options', t('editPlaylist'), p.id)}${this.button('playlist-download', t('downloadPlaylist'), p.id)}${p.source ? this.button('playlist-refresh', text('updatePlaylist', 'Refresh playlist'), p.id) : ''}${this.button('playlist-share', text('share', 'Share'), p.id)}</div>`); if (safeArtwork(p.artwork)) content.querySelector('.page-top')?.insertAdjacentHTML('afterbegin', `<div class="cover playlist-cover"><img src="${esc(safeArtwork(p.artwork))}" alt=""></div>`); } }
    if (view === 'queue') {
      content.insertAdjacentHTML('afterbegin', this.button('queue-clear', t('clearQueue')));
      [...content.querySelectorAll('.track')].forEach((row, i) => { row.draggable = true; row.ondragstart = e => e.dataTransfer.setData('text/plain', String(i)); row.ondragover = e => e.preventDefault(); row.ondrop = e => { e.preventDefault(); this.ctx.moveQueue(+e.dataTransfer.getData('text/plain'), i); }; });
    }
    if (view === 'settings') this.settings();
    if (view === 'home' && !s.settings.offline) {
      const seed = s.history.map(this.ctx.findTrack).find(t => t?.ytid), key = seed ? 'related:' + seed.ytid : '';
      if (key && this.pages.has(key)) { const tracks = this.pages.get(key); content.insertAdjacentHTML('beforeend', '<h2>' + esc(text('recommended', 'For you')) + '</h2>' + this.ctx.cards(tracks.slice(0, 8))); }
      else if (key && !this.recommending) { this.recommending = true; api('related', { id: seed.ytid, title: seed.title || '', artist: seed.artist || '' }).then(tracks => { this.pages.set(key, tracks); tracks.forEach(t => this.ctx.registerResult(t)); if (this.ctx.view === 'home') this.ctx.render(); }).catch(() => {}).finally(() => this.recommending = false); }
    }
    if (this.downloads.size) content.insertAdjacentHTML('afterbegin', `<div class="feature-toolbar"><span>${this.downloads.size} ${esc(text('downloading', 'Downloading'))}</span>${this.button('downloads-cancel', t('cancel'))}</div>`);
    translateUi(); decorateButtons();
  }
  custom(view) {
    const ctx = this.ctx, content = $('#content'), s = this.state;
    if (view === 'recap') {
      if (isNative && !this.pages.has('native-recap') && !this.loadingRecap) { this.loadingRecap = true; nativeRequest('recap').then(data => { this.pages.set('native-recap', data); ctx.render(); }).catch(e => ctx.toast(e.message)).finally(() => this.loadingRecap = false); }
      const native = this.pages.get('native-recap'), months = native ? native.monthly : s.months;
      const keys = Object.keys(months).sort().reverse(), years = [...new Set(keys.map(key => key.slice(0, 4)))];
      if (!this.recapPeriod || (!keys.includes(this.recapPeriod) && !years.some(y => this.recapPeriod === y + '-all'))) this.recapPeriod = keys[0] || '';
      const selected = this.recapPeriod.endsWith('-all') ? keys.filter(key => key.startsWith(this.recapPeriod.slice(0, 4))) : keys.filter(key => key === this.recapPeriod);
      const songs = new Map(); let seconds = 0;
      for (const key of selected) { const month = months[key]; seconds += month.totalSeconds || 0; for (const [id, song] of Object.entries(month.songs || {})) { const trackId = native ? 'yt:' + (song.ytid || id) : id; if (native && !ctx.findTrack(trackId)) ctx.registerResult({ id: trackId, ytid: song.ytid || id, title: song.title, artist: song.artist, artwork: song.highResImage, kind: 'youtube' }); const before = songs.get(trackId) || { seconds: 0, plays: 0 }; songs.set(trackId, { seconds: before.seconds + (song.seconds || 0), plays: before.plays + (song.plays || song.playCount || 0) }); } }
      const ranked = [...songs].filter(([, s]) => s.plays > 0).sort((a, b) => b[1].seconds - a[1].seconds);
      content.innerHTML = ctx.top(text('timeMachine', 'Listening recap'), '') + `<label>${esc(text('monthlyRecap', 'Monthly recap'))}<select id="recap-period">${keys.map(key => `<option value="${key}" ${this.recapPeriod === key ? 'selected' : ''}>${key}</option>`).join('')}${years.map(year => `<option value="${year}-all" ${this.recapPeriod === year + '-all' ? 'selected' : ''}>${esc(text('annualRecap', 'Annual recap'))} ${year}</option>`).join('')}</select></label><div class="stat-cards"><div class="stat"><strong>${Math.floor(seconds / 60)}</strong><small>${esc(text('minutes', 'Minutes'))}</small></div><div class="stat"><strong>${ranked.reduce((n, [, song]) => n + song.plays, 0)}</strong><small>${esc(t('songs'))}</small></div><div class="stat"><strong>${ranked.length}</strong><small>${esc(t('allSongs'))}</small></div></div>` + ctx.rows(ranked.slice(0, 30).map(([id]) => ctx.findTrack(id)).filter(Boolean));
      return true;
    }
    if (view === 'downloads') { content.innerHTML = ctx.top('Downloads', t('offlineMode')) + ctx.rows(s.tracks.filter(t => t.kind === 'local' || t.downloaded)); return true; }
    if (view === 'recent') { content.innerHTML = ctx.top(t('recentlyPlayed'), '') + this.button('history-clear', t('clearRecentlyPlayed')) + ctx.rows(s.history.map(ctx.findTrack).filter(Boolean)); return true; }
    if (view === 'radio-favorites') { content.innerHTML = ctx.top('Liked radio', '') + ctx.cards(s.tracks.filter(t => t.kind === 'radio' && s.liked.includes(t.id))); return true; }
    if (view === 'artists') {
      const favs = s.artistFavorites || [];
      const searchResults = this.pages.get('artist-search');
      const popularSeeds = [
        { id: 'UCIaFw5VBEK8qaW6nRpx_qnw', name: 'Coldplay', artwork: 'https://lh3.googleusercontent.com/IOKuXtp8PCQ_Fc-vaRKm3sKIXBxFV51gZheLTH5br-YGnWHFQf_Jywcuk7wbprYRoEbQyS_XZY6-nMJX=w544-h544-p-l90-rj' },
        { id: 'UCqECaJ8Gagnn7YCbPEzWH6g', name: 'Taylor Swift', artwork: 'https://lh3.googleusercontent.com/4q-v1l68W0G2aK5Ue7JpL5R8T_iK1N7Qp7zR8Y_w=w544-h544-p-l90-rj' },
        { id: 'UC0WP5P-ufpRfjbNrmOWwLBQ', name: 'The Weeknd', artwork: 'https://lh3.googleusercontent.com/7p-V1l68W0G2aK5Ue7JpL5R8T_iK1N7Qp7zR8Y_w=w544-h544-p-l90-rj' },
        { id: 'UCiGm_E4ZwYSHV3bcW1pnSeQ', name: 'Billie Eilish', artwork: 'https://lh3.googleusercontent.com/7v-V1l68W0G2aK5Ue7JpL5R8T_iK1N7Qp7zR8Y_w=w544-h544-p-l90-rj' },
        { id: 'UC3lBXqo7qVyW42v074TXHHw', name: 'Kendrick Lamar', artwork: 'https://lh3.googleusercontent.com/3q-V1l68W0G2aK5Ue7JpL5R8T_iK1N7Qp7zR8Y_w=w544-h544-p-l90-rj' },
        { id: 'UC0C-w0YjGpqDXGB8Ufg64dQ', name: 'Adele', artwork: 'https://lh3.googleusercontent.com/2q-V1l68W0G2aK5Ue7JpL5R8T_iK1N7Qp7zR8Y_w=w544-h544-p-l90-rj' },
        { id: 'UCJy2hd1_WnU71p_Jj4N5Hbg', name: 'Queen', artwork: 'https://lh3.googleusercontent.com/9q-V1l68W0G2aK5Ue7JpL5R8T_iK1N7Qp7zR8Y_w=w544-h544-p-l90-rj' },
        { id: 'UCByOQJjav0CUDwxCk-jVNRQ', name: 'Dua Lipa', artwork: 'https://lh3.googleusercontent.com/1q-V1l68W0G2aK5Ue7JpL5R8T_iK1N7Qp7zR8Y_w=w544-h544-p-l90-rj' }
      ];
      content.innerHTML = ctx.top('Artists', 'Discover artists, explore full discographies, and follow your favorites.')
        + `<div class="feature-toolbar"><input id="artist-search" placeholder="Search any artist (e.g. Coldplay, Drake, Queen)" value="${esc(this.lastArtistQuery || '')}"><button data-feature="artist-search">${t('search')}</button></div>`
        + (searchResults ? `<div class="section-heading"><h2>Search Results</h2><span>${searchResults.length} artists</span></div>` + this.artistCards(searchResults, 'artist') : '')
        + (favs.length ? `<div class="section-heading"><h2>Followed Artists</h2><span>${favs.length} artists</span></div>` + this.artistCards(favs, 'artist') : '')
        + `<div class="section-heading"><h2>Popular Artists</h2><span>Tap to view full profile</span></div>`
        + this.artistCards(popularSeeds, 'artist');
      setTimeout(() => {
        $('#artist-search')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.act('artist-search'); } });
      }, 0);
      return true;
    }
    if (view.startsWith('artist:')) {
      const a = this.pages.get(view);
      if (!a) {
        content.innerHTML = `<div class="page-top"><span class="eyebrow">ARTIST PROFILE</span><h1>Loading artist…</h1><p class="search-status">Fetching discography, top tracks, and albums…</p></div>`;
        return true;
      }
      const isFav = s.artistFavorites?.some(x => x.id === a.id);
      const bgBanner = a.artwork ? `background-image: linear-gradient(180deg, rgba(8,9,14,0.3) 0%, rgba(8,9,14,0.92) 85%), url('${esc(safeUrl(a.artwork))}');` : '';
      const heroHtml = `
        <div class="artist-profile-hero">
          <div class="artist-profile-banner" style="${bgBanner}">
            <div class="artist-profile-content">
              <div class="artist-avatar cover">
                ${safeUrl(a.artwork) ? `<img src="${esc(safeUrl(a.artwork))}" alt="${esc(a.name)}">` : '✦'}
              </div>
              <div class="artist-meta">
                <span class="eyebrow"><span class="artist-verified-badge">✓</span> VERIFIED ARTIST</span>
                <h1 class="artist-name">${esc(a.name)}</h1>
                ${a.listeners ? `<p class="artist-listeners">${esc(a.listeners)}</p>` : ''}
                <div class="artist-actions">
                  ${a.tracks?.length ? `<button class="primary" data-artist-play-all="${esc(a.id)}">▶ Play Top Songs</button>` : ''}
                  <button class="secondary artist-fav-btn ${isFav ? 'active' : ''}" data-feature="artist-favorite" data-id="${esc(a.id)}">${isFav ? '♥ Following' : '♡ Follow'}</button>
                  <button class="secondary" data-feature="artist-share" data-id="${esc(a.id)}" data-name="${esc(a.name)}">Share</button>
                </div>
              </div>
            </div>
          </div>
          ${a.description ? `<div class="artist-bio"><p>${esc(a.description)}</p></div>` : ''}
        </div>
      `;

      content.innerHTML = heroHtml
        + (a.tracks?.length ? `<div class="section-heading"><h2>Top Songs</h2><span>${a.tracks.length} tracks</span></div>` + ctx.rows(a.tracks) : '')
        + (a.releases?.length ? `<div class="section-heading"><h2>Albums & Singles</h2><span>${a.releases.length} releases</span></div>` + this.artistCards(a.releases, 'album') : '')
        + (a.related?.length ? `<div class="section-heading"><h2>Fans Also Like</h2><span>Similar artists</span></div>` + this.artistCards(a.related, 'artist') : '');
      return true;
    }
    if (view.startsWith('album:')) {
      const a = this.pages.get(view);
      content.innerHTML = ctx.top(a?.name || 'Album', a?.artist ? `By ${a.artist}${a.year ? ' · ' + a.year : ''}` : '');
      if (!a) { content.insertAdjacentHTML('beforeend', '<p class="search-status">Loading album…</p>'); return true; }
      content.insertAdjacentHTML('beforeend', `<div class="feature-toolbar"><button class="primary" data-feature="album-play" data-id="${esc(a.id)}">▶ Play Album</button>${a.artist ? `<button class="secondary" data-feature="album-artist-open" data-artist="${esc(a.artist)}" data-artist-id="${esc(a.artistId || '')}">View Artist</button>` : ''}</div>` + ctx.rows(a.tracks));
      return true;
    }
    return false;
  }
  artistCards(items, type = 'artist') {
    if (!items?.length) return '<p class="search-empty">None found.</p>';
    return `<div class="cards ${type === 'artist' ? 'artist-cards-grid' : ''}">${items.map(a => `<button class="card ${type === 'artist' ? 'artist-card' : ''}" data-feature="${type}-open" data-id="${esc(a.id)}"><div class="cover ${type === 'artist' ? 'artist-avatar-cover' : ''}">${safeUrl(a.artwork) ? `<img src="${esc(a.artwork)}" alt="${esc(a.name)}" loading="lazy">` : '✦'}</div><strong>${esc(a.name)}</strong>${a.year ? `<small>${esc(a.year)}${a.type ? ' · ' + esc(a.type) : ''}</small>` : type === 'artist' ? '<small>Artist</small>' : ''}</button>`).join('')}</div>`;
  }
  settings() {
    const s = this.state.settings, grid = $('#content .settings-grid');
    const select = (key, values) => `<label>${esc(text(key, key))}<select data-feature-setting="${key}">${values.map(([v, name]) => `<option value="${v}" ${s[key] === v ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`;
    const linked = this.state.playlists.filter(p => youtubePlaylistId(p.source));
    const lastSynced = Math.max(0, ...linked.map(p => p.lastSyncedAt || 0));
    grid.querySelector('#settings-library')?.insertAdjacentHTML('beforeend', `<div class="settings-sync-controls"><label><input type="checkbox" data-feature-setting="autoPlaylistSync" ${s.autoPlaylistSync !== false ? 'checked' : ''}> Automatically sync YouTube playlists</label>${this.button('playlist-sync-all', this.syncingPlaylists ? 'Syncing…' : 'Sync now')}</div><p class="settings-sync-status" role="status">${this.syncingPlaylists ? 'Checking linked playlists…' : this.playlistSyncError ? `Last check failed: ${esc(this.playlistSyncError)}` : lastSynced ? `Last checked: ${esc(new Date(lastSynced).toLocaleString())}` : linked.length ? 'Waiting for the first sync.' : 'Import a YouTube playlist to start syncing.'}</p>`);
    grid.insertAdjacentHTML('beforeend', `<section class="settings-card"><span class="settings-card-kicker">06 · PREFERENCES</span><h3>App preferences</h3>${[['offline', 'offlineMode'], ['autoplay', 'automaticSongPicker'], ['repeatOne', 'repeatOne'], ['dynamicColor', 'dynamicColor'], ['proxy', 'useProxy']].map(([k, label]) => `<label><input type="checkbox" data-feature-setting="${k}" ${s[k] ? 'checked' : ''}>${esc(text(label, k))}</label>`).join('')}${select('quality', ['low', 'medium', 'high'].map(v => [v, t('audioQuality' + v[0].toUpperCase() + v.slice(1))]))}${select('language', languageOptions().map(l => [l.code, l.name]))}${select('theme', ['dark', 'light', 'system', 'black'].map(v => [v, text(v, v)]))}<label>${esc(t('accentColor'))}<input type="color" value="${s.accent}" data-feature-setting="accent"></label><label>HTTP proxy URL<input type="url" id="proxy-url" value="${esc(s.proxyUrl)}"></label><div class="settings-actions">${this.button('proxy-save', t('save'))}${this.button('end-timer', t('endOfSong'))}${this.button('timer-cancel', t('cancel'))}</div></section>`);
    grid.insertAdjacentHTML('beforeend', `<section class="settings-card"><span class="settings-card-kicker">07 · DISCOVERY</span><h3>Smart Shuffle</h3><label><input type="checkbox" data-feature-setting="localAI" ${s.localAI !== false ? 'checked' : ''}>On-device AI matching</label><p>A small model included in Zonic matches song titles and artists on this device. Recommendations appear after every three playlist tracks; offline mode uses stored tracks only.</p></section>`);
    $('.bands')?.insertAdjacentHTML('beforebegin', `<label>${esc(t('equalizer'))}<select id="eq-preset">${['balanced', 'bassBoost', 'trebleBoost', 'vocal', 'rock', 'pop', 'electronic'].map(v => `<option value="${v}">${esc(t('equalizerPreset' + v[0].toUpperCase() + v.slice(1)))}</option>`).join('')}</select></label>`);
    grid.querySelector('#settings-backup')?.insertAdjacentHTML('beforeend', `<div class="settings-actions">${this.button('archive-export', 'Backup with audio')}${this.button('archive-import', 'Restore audio backup')}${this.button('musify-import', 'Import Musify .hive backup')}</div><div class="settings-actions settings-quiet-actions">${this.button('stats-clear', t('clearListeningStats'))}${this.button('cache-clear', t('clearCache'))}</div>`);
    grid.insertAdjacentHTML('beforeend', `<section class="settings-card"><span class="settings-card-kicker">08 · KEEP CURRENT</span><h3>${esc(text('update', 'Updates'))}</h3><label>Zonic release repository<input id="update-repository" placeholder="owner/repository" value="${esc(s.updateRepository || '')}"></label><label><input type="checkbox" data-feature-setting="autoUpdates" ${s.autoUpdates ? 'checked' : ''}>${esc(t('automaticUpdateChecks'))}</label><div class="settings-actions">${this.button('updates-save', t('save'))}${this.button('updates-check', text('checkForUpdates', 'Check for updates'))}${this.release?.available ? this.button('updates-open', text('downloadAppUpdate', 'Download update')) : ''}</div></section>`);
  }
  openTrack(track) {
    if (!track) return this.ctx.toast('Choose a track first.'); this.track = track;
    const sheet = $('#track-sheet'); sheet.innerHTML = `<h2 data-user-text="1">${esc(track.title)}</h2><p data-user-text="1">${esc(track.artist)}</p><div class="track-actions">${[['play', 'play'], ['queue', 'addToQueue'], ['next', 'playNext'], ['download', 'download'], ['lyrics', 'lyrics'], ['artist', 'artist'], ['rename', 'renameSong'], ['share', 'share'], ['remove-download', 'deleteDownloads'], ['delete', 'delete']].map(([name, key]) => this.button('track-' + name, text(key, name))).join('')}</div><label>${esc(t('addToPlaylist'))}<select id="sheet-playlist"><option value="">—</option>${this.state.playlists.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>${this.button('sheet-close', text('close', 'Close'))}`; decorateButtons(sheet); sheet.showModal();
  }
  async change(e) {
    const target = e.target, ctx = this.ctx, s = this.state;
    if (target.dataset.featureSetting) { s.settings[target.dataset.featureSetting] = target.type === 'checkbox' ? target.checked : target.value; await ctx.save(); if (isNative) await nativeRequest('settings', s.settings); if (target.dataset.featureSetting === 'proxy' && !isNative) await this.configureProxy(); ctx.render(); if (target.dataset.featureSetting === 'autoPlaylistSync' && target.checked) this.syncPlaylists().catch(() => {}); }
    if (target.id === 'eq-preset') { s.settings.eq = eqPreset(target.value); await ctx.setEq(); await ctx.save(); ctx.render(); }
    if (target.dataset.band !== undefined && isNative) await nativeRequest('settings', s.settings);
    if (target.id === 'recap-period') { this.recapPeriod = target.value; ctx.render(); }
    if (target.id === 'sheet-playlist' && target.value) { const p = s.playlists.find(p => p.id === target.value); if (!s.tracks.some(t => t.id === this.track.id)) s.tracks.push(this.track); if (!p.tracks.includes(this.track.id)) p.tracks.push(this.track.id); await ctx.save(); $('#track-sheet').close(); ctx.render(); }
    if (target.id === 'playlist-art-file' && target.files[0]) { const bitmap = await createImageBitmap(target.files[0]), canvas = document.createElement('canvas'); const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height)); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); $('#playlist-art-url').value = canvas.toDataURL('image/jpeg', .85); }
  }
  async act(action, data = {}) {
    const ctx = this.ctx, s = this.state, sheet = $('#track-sheet'), track = this.track;
    if (action.startsWith('track-')) sheet.close();
    switch (action) {
      case 'sheet-close': sheet.close(); break;
      case 'current-menu': this.openTrack(ctx.current); break;
      case 'track-play': await ctx.playTrack(track); break;
      case 'track-queue': ctx.enqueue(track); break;
      case 'track-next': ctx.enqueue(track, true); break;
      case 'track-download': await this.download(track); break;
      case 'track-lyrics': { const result = await api('lyrics', { title: track.title, artist: track.artist }); sheet.innerHTML = `<h2>${esc(track.title)}</h2><div class="lyrics">${esc(result.lyrics || 'No lyrics found.')}</div>${this.button('sheet-close', text('close', 'Close'))}`; decorateButtons(sheet); sheet.showModal(); break; }
      case 'track-artist': { const artists = await api('artists', { q: track.artist }); if (!artists.length) throw new Error(t('artistNotFound')); await this.openPage('artist', artists[0].id); break; }
      case 'track-rename': { const name = await ctx.ask(text('renameSong', 'Rename song'), t('name'), track.title); if (name) track.title = name; await ctx.save(); ctx.render(); break; }
      case 'track-share': await this.share(track.ytid ? `https://www.youtube.com/watch?v=${track.ytid}` : track.url || track.title); break;
      case 'track-remove-download': { if (await ctx.ask(t('confirmation'), 'Type DELETE to remove stored audio.') !== 'DELETE') break; const tx = ctx.db.transaction('files', 'readwrite'); tx.objectStore('files').delete(track.id); if (isNative) await nativeRequest('remove-download', track); else if (ctx.fileBackend) await fetch('./api/remove-file?id=' + encodeURIComponent(track.id), { method: 'POST' }); track.downloaded = false; await ctx.save(); ctx.render(); break; }
      case 'track-delete': { if (await ctx.ask(t('confirmation'), 'Type DELETE to remove this library track.') !== 'DELETE') break; s.tracks = s.tracks.filter(t => t.id !== track.id); s.liked = s.liked.filter(id => id !== track.id); s.history = s.history.filter(id => id !== track.id); s.playlists.forEach(p => p.tracks = p.tracks.filter(id => id !== track.id)); await ctx.save(); ctx.render(); break; }
      case 'folder-create': { const name = await ctx.ask(t('createFolder'), t('enterFolderName')); if (name) s.folders.push({ id: crypto.randomUUID(), name }); await ctx.save(); ctx.render(); break; }
      case 'folder-rename': { const f = s.folders.find(f => f.id === data.id), name = await ctx.ask(t('editFolder'), t('name'), f.name); if (name) f.name = name; await ctx.save(); ctx.render(); break; }
      case 'folder-delete': { if (await ctx.ask(t('confirmation'), 'Type DELETE to remove this folder. Playlists are kept.') !== 'DELETE') break; s.folders = s.folders.filter(f => f.id !== data.id); s.playlists.forEach(p => { if (p.folderId === data.id) p.folderId = ''; }); await ctx.save(); ctx.render(); break; }
      case 'playlist-options': { const p = s.playlists.find(p => p.id === data.id); this.editingPlaylist = p.id; sheet.innerHTML = `<h2>${esc(t('editPlaylist'))}</h2><label>${esc(t('customPlaylistName'))}<input id="playlist-edit-name" value="${esc(p.name)}" maxlength="120"></label><label>${esc(t('customPlaylistImgUrl'))}<input id="playlist-art-url" value="${esc(p.artwork || '')}"></label><label>${esc(text('custom', 'Choose artwork'))}<input id="playlist-art-file" type="file" accept="image/png,image/jpeg,image/webp"></label><label>${esc(text('createFolder', 'Folder'))}<select id="playlist-edit-folder"><option value="">—</option>${s.folders.map(f => `<option value="${esc(f.id)}" ${p.folderId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label><label><input type="checkbox" id="playlist-edit-pin" ${p.pinned ? 'checked' : ''}>Pin playlist</label>${this.button('playlist-save', t('save'))}${this.button('sheet-close', t('cancel'))}`; decorateButtons(sheet); sheet.showModal(); break; }
      case 'playlist-save': { const p = s.playlists.find(p => p.id === this.editingPlaylist), name = $('#playlist-edit-name').value.trim(), art = $('#playlist-art-url').value.trim(); if (!name) throw new Error('Enter a playlist name.'); if (art && !safeArtwork(art)) throw new Error('Enter a valid artwork URL or choose an image.'); p.name = name; p.artwork = safeArtwork(art); p.folderId = $('#playlist-edit-folder').value; p.pinned = $('#playlist-edit-pin').checked; await ctx.save(); sheet.close(); ctx.render(); break; }
      case 'playlist-download': this.cancelBatch = false; for (const id of s.playlists.find(p => p.id === data.id).tracks) { if (this.cancelBatch) break; await this.download(ctx.findTrack(id)); } break;
      case 'playlist-refresh': await this.syncPlaylists({ force: true, notify: true, playlistId: data.id }); break;
      case 'playlist-sync-all': await this.syncPlaylists({ force: true, notify: true }); break;
      case 'playlist-share': { const p = s.playlists.find(p => p.id === data.id), tracks = p.tracks.map(ctx.findTrack).filter(Boolean); if (tracks.every(t => t.ytid)) { const bytes = new TextEncoder().encode(JSON.stringify({ title: p.name, image: p.artwork, source: 'user-created', list: tracks.map(t => t.ytid) })); const payload = btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); await this.share('grove://playlist/custom/' + payload); } else this.saveFile(JSON.stringify({ version: 1, tracks, playlists: [{ ...p, folderId: '' }] }), p.name + '.json', 'application/json'); break; }
      case 'queue-clear': ctx.clearQueue(); ctx.render(); break;
      case 'history-clear': s.history = []; await ctx.save(); ctx.render(); break;
      case 'radio-add': { const name = await ctx.ask('Add radio station', t('name')); if (!name) break; const url = await ctx.ask('Add radio station', 'HTTP/HTTPS stream URL'); if (!safeUrl(url)) throw new Error('Enter a valid audio URL.'); s.tracks.push({ id: 'radio:' + crypto.randomUUID(), title: name, artist: 'Radio', url: safeUrl(url), kind: 'radio' }); await ctx.save(); ctx.navigate('library'); break; }
      case 'artist-search': {
        const q = $('#artist-search')?.value.trim();
        if (q) {
          this.lastArtistQuery = q;
          this.pages.set('artist-search', await api('artists', { q }));
          ctx.render();
        }
        break;
      }
      case 'artist-open': await this.openPage('artist', data.id); break;
      case 'album-open': await this.openPage('album', data.id); break;
      case 'album-artist-open': {
        if (data.artistId) await this.openPage('artist', data.artistId);
        else if (data.artist) await this.openArtistByName(data.artist);
        break;
      }
      case 'album-play': { const tracks = this.pages.get('album:' + data.id).tracks; await ctx.playTrack(tracks[0], tracks, 0); break; }
      case 'artist-favorite': { const a = this.pages.get('artist:' + data.id); s.artistFavorites = s.artistFavorites.some(x => x.id === a.id) ? s.artistFavorites.filter(x => x.id !== a.id) : [...s.artistFavorites, { id: a.id, name: a.name, artwork: a.artwork }]; await ctx.save(); ctx.render(); break; }
      case 'artist-share': {
        const url = `https://music.youtube.com/channel/${data.id}`;
        await this.share(url);
        break;
      }
      case 'end-timer': ctx.endTimer(); if (isNative) await nativeRequest('sleep', { endOfSong: true }); ctx.toast(t('endOfSong')); break;
      case 'timer-cancel': ctx.cancelTimer(); if (isNative) await nativeRequest('sleep', { minutes: 0 }); break;
      case 'proxy-save': { const url = $('#proxy-url').value.trim(); if (url && !safeUrl(url)) throw new Error('Enter a valid proxy URL.'); s.settings.proxyUrl = url; await ctx.save(); if (!isNative) await this.configureProxy(); ctx.toast(text('saved', 'Saved')); break; }
      case 'archive-export': await this.exportArchive(); break;
      case 'archive-import': $('#archive-file').click(); break;
      case 'musify-import': $('#musify-file').click(); break;
      case 'stats-clear': if (await ctx.ask(t('confirmation'), 'Type CLEAR to clear listening stats.') === 'CLEAR') { s.stats = {}; s.months = {}; if (isNative) await nativeRequest('clear-stats', {}); await ctx.save(); ctx.render(); } break;
      case 'cache-clear':
        this.pages.clear(); $('#search-suggestions')?.remove();
        if (isNative) await fetch('./api/cache-clear', { method: 'POST' });
        else if (ctx.fileBackend) await fetch('./api/cache-clear', { method: 'POST' });
        ctx.toast(t('cacheMsg')); break;
      case 'updates-save': { const repository = $('#update-repository').value.trim(); if (repository && !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Enter owner/repository.'); s.settings.updateRepository = repository; await ctx.save(); ctx.toast(text('saved', 'Saved')); break; }
      case 'updates-check': this.release = await checkUpdates(s.settings.updateRepository); ctx.toast(this.release.available ? `${text('appUpdateIsAvailable', 'Update available')}: ${this.release.version}` : 'You have the latest available Zonic version.'); ctx.render(); break;
      case 'updates-open': if (this.release?.url && new URL(this.release.url).hostname === 'github.com') { if (isNative) await nativeRequest('open-url', { url: this.release.url }); else window.open(this.release.url, '_blank'); } break;
      case 'link-open': { const link = await ctx.ask('Open music link', 'YouTube song, playlist, or Zonic/Musify playlist link'); if (link) await this.openLink(link); break; }
      case 'downloads-cancel': for (const controller of this.downloads.values()) controller.abort(); if (isNative) await nativeRequest('cancel-downloads', {}); else if (ctx.fileBackend) await fetch('./api/cancel-downloads', { method: 'POST' }); this.cancelBatch = true; ctx.toast(t('downloadCancelled')); break;
    }
  }
  async openPage(kind, id) { const view = kind + ':' + id; this.ctx.navigate(view); const data = await api(kind, { id }); this.pages.set(view, data); for (const t of data.tracks || []) this.ctx.registerResult(t); if (this.ctx.view === view) this.ctx.render(); }
  async openLink(value) {
    if (this.state.settings.offline) throw new Error('Music links require online mode.');
    const match = value.match(/(?:https?:\/\/(?:[\w.-]*youtube\.com|youtu\.be)\/\S+|(?:grove|musify):\/\/playlist\/custom\/\S+)/i);
    const url = new URL((match?.[0] || value).trim());
    if (['grove:', 'musify:'].includes(url.protocol) && url.hostname === 'playlist' && url.pathname.startsWith('/custom/')) {
      const payload = url.pathname.slice(8).replace(/-/g, '+').replace(/_/g, '/');
      if (payload.length > 200000) throw new Error('Playlist link is too large.');
      const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), c => c.charCodeAt(0))));
      const response = await fetch('./api/expand-playlist', { method: 'POST', body: JSON.stringify(data) }); const expanded = await response.json(); if (!response.ok) throw new Error(expanded.error); return this.addPlaylist(expanded);
    }
    if (!['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname)) throw new Error('Unsupported music link.');
    const playlist = url.searchParams.get('list'); if (playlist) return this.addPlaylist(await api('playlist', { id: playlist }));
    const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/\/(?:shorts|live)\/([\w-]{11})/)?.[1];
    if (!/^[\w-]{11}$/.test(id || '')) throw new Error('Enter a valid YouTube music link.'); const track = await api('video', { id }); this.ctx.registerResult(track); await this.ctx.playTrack(track);
  }
  async addPlaylist(data) { for (const track of data.tracks) if (!this.state.tracks.some(t => t.id === track.id)) this.state.tracks.push(track); const p = { id: crypto.randomUUID(), name: data.name || 'Imported playlist', tracks: data.tracks.map(t => t.id), artwork: safeArtwork(data.artwork), source: safeUrl(data.source) }; this.state.playlists.push(p); await this.ctx.save(); this.ctx.navigate('playlist:' + p.id); }
  async configureProxy() { if (this.state.settings.proxy && !this.state.settings.proxyUrl) throw new Error('Enter a proxy URL first.'); const response = await fetch('./api/configure', { method: 'POST', body: JSON.stringify(this.state.settings) }); if (!response.ok) throw new Error('Proxy configuration failed.'); }
  async share(value) { if (isNative) await nativeRequest('share', { text: value }); else if (navigator.share) await navigator.share({ text: value }); else { await navigator.clipboard.writeText(value); this.ctx.toast(text('copied', 'Copied')); } }
  async download(track) {
    if (!track || ['local', 'radio'].includes(track.kind) || this.downloads.has(track.id)) return;
    if (track.isLive) return this.ctx.toast('Live streams cannot be saved as a complete song.');
    const controller = new AbortController(); this.downloads.set(track.id, controller); this.ctx.render(); this.ctx.toast(text('downloading', 'Downloading…'));
    try {
      if (isNative) await nativeRequest('download', track);
      else if (this.ctx.fileBackend) {
        const response = await fetch('./api/download', { method: 'POST', body: JSON.stringify({ ...track, quality: this.state.settings.quality }) }); if (!response.ok) throw new Error(t('downloadFailed'));
        while (true) { const jobs = await api('downloads'), job = jobs[track.id]; if (job?.status === 'complete') break; if (!job || ['failed', 'cancelled'].includes(job.status)) throw new Error(job?.error || t('downloadFailed')); if (controller.signal.aborted) throw new DOMException('Download cancelled', 'AbortError'); this.ctx.toast(`${t('download')}: ${job.total > 0 ? Math.round(job.received / job.total * 100) + '%' : (job.received / 1048576).toFixed(1) + ' MB'}`); await new Promise(resolve => setTimeout(resolve, 500)); }
      }
      else { const response = await fetch(track.ytid ? streamUrl(track.ytid, this.state.settings.quality) : track.url, { signal: controller.signal }); if (!response.ok) throw new Error(t('downloadFailed')); const length = +response.headers.get('Content-Length'); if (length > 256 * 1024 * 1024) throw new Error('Download exceeds 256 MB.'); const reader = response.body.getReader(), chunks = []; let received = 0, last = 0; while (true) { const result = await reader.read(); if (result.done) break; received += result.value.length; if (received > 256 * 1024 * 1024) { controller.abort(); throw new Error('Download exceeds 256 MB.'); } chunks.push(result.value); if (Date.now() - last > 1000) { this.ctx.toast(`${t('download')}: ${length ? Math.round(received / length * 100) + '%' : (received / 1048576).toFixed(1) + ' MB'}`); last = Date.now(); } } await dbWrite(this.ctx.db, 'files', track.id, new Blob(chunks, { type: response.headers.get('Content-Type') || 'audio/mpeg' })); }
      track.downloaded = true; if (!this.state.tracks.some(t => t.id === track.id)) this.state.tracks.push(track); await this.ctx.save(); this.ctx.toast(text('downloaded', 'Downloaded')); this.ctx.render();
    } catch (e) { if (e.name === 'AbortError') this.ctx.toast(t('downloadCancelled')); else throw e; } finally { this.downloads.delete(track.id); }
  }
  async saveFile(data, name, type) { const blob = new Blob([data], { type }); if (isNative) { const response = await fetch('./native/export?name=' + encodeURIComponent(name), { method: 'POST', body: blob }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Export failed.'); if (result.ok) this.ctx.toast(result.location || text('backedupSuccess', 'Backup saved')); return; } const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
  async exportArchive() {
    const files = { 'library.json': strToU8(JSON.stringify(this.state)) }; let size = 0;
    for (const t of this.state.tracks.filter(t => t.kind === 'local' || t.downloaded)) { let blob = await dbRead(this.ctx.db, 'files', t.id); if (!blob && (isNative || this.ctx.fileBackend)) { const r = await fetch(`./${isNative ? 'native' : 'api'}/file?id=` + encodeURIComponent(t.id)); if (r.ok) blob = await r.blob(); } if (!blob) continue; size += blob.size; if (size > 256 * 1024 * 1024) throw new Error('Audio backup is limited to 256 MB per export.'); files['audio/' + encodeURIComponent(t.id)] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }]; }
    await this.saveFile(zipSync(files), 'grove-audio-backup.zip', 'application/zip');
  }
  async restoreArchive(file) {
    if (!file) return; if (file.size > 270 * 1024 * 1024) throw new Error('Backup is too large.'); let expandedSize = 0; const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: f => { if (f.name !== 'library.json' && !f.name.startsWith('audio/')) return false; expandedSize += f.originalSize; if (expandedSize > 270 * 1024 * 1024 || f.originalSize > 256 * 1024 * 1024) throw new Error('Expanded backup is too large.'); return true; } }); if (!files['library.json']) throw new Error('Backup has no library.json.'); const state = validateBackup(JSON.parse(strFromU8(files['library.json']))); if (await this.ctx.ask(t('confirmation'), 'Type RESTORE to replace the library.') !== 'RESTORE') return;
    for (const t of state.tracks) { const bytes = files['audio/' + encodeURIComponent(t.id)]; if (!bytes) continue; const blob = new Blob([bytes], { type: 'audio/mpeg' }); if (isNative) await nativeRequest('file', undefined, { blob, id: t.id }); else if (this.ctx.fileBackend) { const response = await fetch('./api/file?id=' + encodeURIComponent(t.id), { method: 'POST', body: blob }); if (!response.ok) throw new Error('Audio restore failed.'); } else await dbWrite(this.ctx.db, 'files', t.id, blob); } await this.ctx.replaceState(state); await this.ctx.save(); this.ctx.render();
  }
  async importMusify(file) {
    if (!file) return; if (file.size > 20 * 1024 * 1024) throw new Error('Backup is too large.'); const response = await fetch('./api/import-backup', { method: 'POST', body: file }); const data = await response.json(); if (!response.ok) throw new Error(data.error);
    if (/settings/i.test(file.name)) { const s = this.state.settings; Object.assign(s, { quality: data.audioQuality || s.quality, sponsorBlock: data.sponsorBlockSupport === true, offline: data.offlineMode === true, language: data.languageCode || s.language, autoplay: data.playNextSongAutomatically === true, eqEnabled: data.equalizerEnabled === true, eq: Array.isArray(data.equalizerBandGains) && data.equalizerBandGains.length === 5 ? data.equalizerBandGains : s.eq }); }
    else { if (await this.ctx.ask(t('confirmation'), 'Type IMPORT to replace the library with this Musify backup.') !== 'IMPORT') return; await this.ctx.replaceState(migrateMusify(data)); }
    await this.ctx.save(); this.ctx.render();
  }
}
