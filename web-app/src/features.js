import { decorateButtons, icon } from './icons.js';
import { api, streamUrl } from './sources.js';
import { isNative, nativeRequest } from './native.js';
import { eqPreset, migrateMusify, validateBackup, safeUrl, safeArtwork, dbRead, dbWrite } from './library.js';
import { t, languageOptions, setLanguage, translateUi } from './i18n.js';
import { zipSync, unzipSync, strToU8, strFromU8 } from './zip.js';
import { checkUpdates, DEFAULT_UPDATE_REPOSITORY } from './updates.js';
import { PLAYLIST_SYNC_INTERVAL, youtubePlaylistId, mergePlaylistTracks, mergeImportedLikes, isLikedSongsPlaylist } from './playlist-sync.js';
import { CloudSync } from './cloud-sync.js';
import { FirebaseAuth } from './firebase-auth.js';
import { renderEqualizer } from './ui/pages.js';
import { randomId } from './id.js';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const text = (key, fallback) => t(key) === key ? fallback : t(key);
const formatBytes = bytes => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB']; let value = bytes, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
};
export class Features {
  constructor(ctx) {
    this.ctx = ctx; this.pages = new Map(); this.track = null; this.downloads = new Map(); this.suggestionId = 0; this.syncingPlaylists = false; this.playlistSyncError = ''; this.libraryPlaylistFilter = 'all'; this.libraryPlaylistLayout = 'list'; this.auth = new FirebaseAuth(); this.cloud = new CloudSync(ctx); this.cloud.setAccountProvider(() => this.auth);
    document.body.insertAdjacentHTML('beforeend', '<dialog id="track-sheet"></dialog><input id="archive-file" type="file" accept=".zip" hidden><input id="musify-file" type="file" accept=".hive" hidden>');
    $('main > header').insertAdjacentHTML('beforeend', '<button id="account-open" data-feature="account-open">Log in</button>');
    $('#queue-toggle').innerHTML = icon('queue');
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
      if (b.dataset.artistTrack) {
        e.stopImmediatePropagation();
        this.openTrackArtist(ctx.findTrack(b.dataset.artistTrack)).catch(error => ctx.toast(error.message));
        return;
      }
      if (b.dataset.menu) { e.stopImmediatePropagation(); this.openTrack(ctx.findTrack(b.dataset.menu)); }
      if (b.dataset.feature) { e.stopImmediatePropagation(); this.act(b.dataset.feature, b.dataset).catch(error => ctx.toast(error.message)); }
    }, true);
    document.addEventListener('change', e => this.change(e).catch(error => ctx.toast(error.message)));
    $('#archive-file').onchange = e => this.restoreArchive(e.target.files[0]).catch(error => ctx.toast(error.message));
    $('#musify-file').onchange = e => this.importMusify(e.target.files[0]).catch(error => ctx.toast(error.message));
    const search = $('#search'), suggestionList = $('#search-suggestions');
    const closeSuggestions = () => { suggestionList.hidden = true; suggestionList.innerHTML = ''; search.setAttribute('aria-expanded', 'false'); search.removeAttribute('aria-activedescendant'); this.suggestionIndex = -1; };
    this.closeSearchSuggestions = closeSuggestions;
    const chooseSuggestion = value => { search.value = value; closeSuggestions(); search.dispatchEvent(new Event('input', { bubbles: true })); search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); };
    search.addEventListener('input', () => {
      clearTimeout(this.suggestionTimer); const query = search.value.trim(), id = ++this.suggestionId;
      if (query.length < 2 || ctx.state.settings.offline) { closeSuggestions(); return; }
      this.suggestionTimer = setTimeout(async () => { try {
        const suggestions = (await api('suggestions', { q: query })).filter(Boolean).slice(0, 8);
        if (id !== this.suggestionId || search.value.trim() !== query) return;
        suggestionList.innerHTML = suggestions.map((s, i) => `<button type="button" role="option" id="search-suggestion-${i}" data-search-suggestion="${esc(s)}"><span>⌕</span>${esc(s)}</button>`).join('');
        suggestionList.hidden = !suggestions.length; search.setAttribute('aria-expanded', String(!!suggestions.length)); this.suggestionIndex = -1;
      } catch { if (id === this.suggestionId) closeSuggestions(); } }, 220);
    });
    suggestionList.addEventListener('pointerdown', event => { const option = event.target.closest('[data-search-suggestion]'); if (option) { event.preventDefault(); chooseSuggestion(option.dataset.searchSuggestion); } });
    search.addEventListener('keydown', event => {
      const options = [...suggestionList.querySelectorAll('[data-search-suggestion]')];
      if (!options.length || suggestionList.hidden) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); this.suggestionIndex = (this.suggestionIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length; options.forEach((option, i) => option.setAttribute('aria-selected', String(i === this.suggestionIndex))); search.setAttribute('aria-activedescendant', options[this.suggestionIndex].id); }
      else if (event.key === 'Enter' && this.suggestionIndex >= 0) { event.preventDefault(); event.stopImmediatePropagation(); chooseSuggestion(options[this.suggestionIndex].dataset.searchSuggestion); }
      else if (event.key === 'Escape') closeSuggestions();
    });
    search.addEventListener('blur', () => setTimeout(closeSuggestions, 120));
    if (ctx.state.settings.autoUpdates && ctx.state.settings.updateRepository && !ctx.state.settings.offline) checkUpdates(ctx.state.settings.updateRepository).then(release => { this.release = release; if (release.available) ctx.toast(text('appUpdateIsAvailable', 'An update is available') + ': ' + release.version); }).catch(() => {});
    window.addEventListener('grove-link', e => this.openLink(e.detail).catch(error => ctx.toast(error.message)));
  }
  startPlaylistSync() {
    this.cloud.completeCallback().catch(error => this.ctx.toast(error.message)).then(() => this.cloud.refreshStatus()).then(() => { if (this.ctx.view === 'settings') this.ctx.render(); }).catch(() => {});
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
          if (typeof updated.name === 'string' && updated.name.trim()) current.name = updated.name.trim();
          current.hidden = isLikedSongsPlaylist(current.name);
          if (safeArtwork(updated.artwork)) current.artwork = safeArtwork(updated.artwork);
          if (youtubePlaylistId(updated.source)) current.source = updated.source;
          for (const track of updated.tracks) if (track?.id && !this.state.tracks.some(t => t.id === track.id)) this.state.tracks.push(track);
          const before = new Set(current.tracks);
          current.tracks = mergePlaylistTracks(current.tracks, updated.tracks.map(t => t.id).filter(Boolean));
          this.state.liked = mergeImportedLikes(this.state.liked, current.name, current.tracks);
          added += current.tracks.filter(id => !before.has(id)).length;
          current.lastSyncedAt = Date.now(); completed++;
          await this.ctx.save();
        } catch (error) { this.playlistSyncError = error.message || 'Playlist sync failed.'; }
      }
      if (notify) this.ctx.toast(this.playlistSyncError ? `Synced ${completed} playlists. ${this.playlistSyncError}` : `Synced ${completed} playlists; ${added} new songs.`);
    } finally { this.syncingPlaylists = false; if (completed || this.ctx.view === 'settings' || this.ctx.view.startsWith('playlist:')) this.ctx.render(); }
  }
  get state() { return this.ctx.state; }
  button(action, label, id = '') { return `<button data-feature="${action}" data-id="${esc(id)}">${esc(label)}</button>`; }
  applyTheme() {
    const s = this.state.settings; document.body.classList.toggle('light', s.theme === 'light' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches)); document.body.classList.toggle('black', s.theme === 'black'); const legacyAccent = ['#c5ed9b', '#d6f374', '#1ed760'].includes(String(s.accent).toLowerCase()); document.documentElement.style.setProperty('--accent', isNative && s.dynamicColor && this.systemAccent ? this.systemAccent : (legacyAccent ? '#8e80ff' : s.accent)); setLanguage(s.language);
  }
  enhance(view) {
    $('#account-open').textContent = this.auth.signedIn ? 'Account' : 'Log in';
    this.applyTheme(); const content = $('#content'), s = this.state;
    const downloadCollectionButton = (id, tracks, label) => {
      const downloadable = tracks.filter(track => track?.ytid && !track.isLive), remaining = downloadable.filter(track => !track.downloaded).length, downloading = this.downloadingPlaylistId === id;
      const buttonLabel = downloading ? `Downloading ${label} · ${remaining} left` : remaining ? `Download ${label} · ${downloadable.length - remaining}/${downloadable.length} saved` : downloadable.length ? `${label} downloaded · Available offline` : `No downloadable songs in ${label}`;
      return `<section class="collection-download-bar"><div><strong>Offline listening</strong><small>${remaining ? `Save ${remaining} remaining song${remaining === 1 ? '' : 's'} to this device.` : downloadable.length ? 'Every downloadable song is stored on this device.' : 'This collection has no downloadable songs.'}</small></div><button class="primary playlist-download-button ${remaining ? '' : 'is-complete'}" data-feature="playlist-download" data-id="${esc(id)}" ${!remaining || downloading ? 'disabled' : ''}>${esc(buttonLabel)}</button></section>`;
    };
    if (view === 'library') {
      const playlists = [...s.playlists]
        .filter(p => !p.hidden)
        .filter(p => this.libraryPlaylistFilter === 'all' || (this.libraryPlaylistFilter === 'youtube' ? !!youtubePlaylistId(p.source) : !youtubePlaylistId(p.source)))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(a.name).localeCompare(String(b.name)));
      const playlistImage = p => safeArtwork(p.artwork) || safeArtwork(p.tracks.map(this.ctx.findTrack).find(Boolean)?.highResArtwork) || safeArtwork(p.tracks.map(this.ctx.findTrack).find(Boolean)?.artwork);
      const playlistItem = p => { const image = playlistImage(p), source = youtubePlaylistId(p.source) ? 'YouTube playlist' : 'By you'; return `<article class="library-playlist-item"><button class="library-playlist-main" data-view="playlist:${esc(p.id)}"><span class="library-playlist-art ${image ? '' : 'library-playlist-placeholder'}">${image ? `<img src="${esc(image)}" alt="">` : '<span>♫</span>'}</span><span class="library-playlist-copy"><strong>${p.pinned ? '★ ' : ''}${esc(p.name)}</strong><small>Playlist · ${esc(source)} · ${p.tracks.length} ${esc(t('songs'))}</small></span></button><button class="library-playlist-edit" data-feature="playlist-options" data-id="${esc(p.id)}" aria-label="Edit ${esc(p.name)}">•••</button></article>`; };
      content.insertAdjacentHTML('beforeend', `<section class="library-playlists"><div class="library-playlist-heading"><div><span class="settings-card-kicker">YOUR COLLECTION</span><h2>${esc(t('playlists'))}</h2></div><div class="library-playlist-heading-actions"><button class="library-add-button" data-feature="library-actions" aria-label="Add music or playlist">＋</button></div></div><div class="library-playlist-filters" aria-label="Playlist filters">${[['all','All'],['zonic','By you'],['youtube','YouTube']].map(([id,label]) => `<button data-feature="library-playlist-filter" data-id="${id}" class="${this.libraryPlaylistFilter === id ? 'active' : ''}" aria-pressed="${this.libraryPlaylistFilter === id}">${label}</button>`).join('')}</div><div class="library-playlist-sort"><span>${playlists.length} playlist${playlists.length === 1 ? '' : 's'}</span><button data-feature="library-playlist-layout" aria-label="Switch playlist layout">${this.libraryPlaylistLayout === 'list' ? '▦ Grid' : '☷ List'}</button></div><div class="library-playlist-list ${this.libraryPlaylistLayout === 'grid' ? 'is-grid' : ''}"><article class="library-playlist-item library-liked-item"><button class="library-playlist-main" data-view="liked"><span class="library-playlist-art library-liked-art">♥</span><span class="library-playlist-copy"><strong>Liked Songs</strong><small>Playlist · By you · ${s.liked.length} ${esc(t('songs'))}</small></span></button></article>${playlists.map(playlistItem).join('') || '<p class="library-playlist-empty">No playlists match this filter.</p>'}</div></section>`);
      for (const f of s.folders) content.insertAdjacentHTML('beforeend', `<section class="settings-card"><h3>${esc(f.name)}</h3>${s.playlists.filter(p => !p.hidden && p.folderId === f.id).map(p => `<button data-view="playlist:${esc(p.id)}">${esc(p.name)}</button>`).join('')}${this.button('folder-rename', t('editFolder'), f.id)}${this.button('folder-delete', t('deleteFolder'), f.id)}</section>`);
    }
    if (view === 'radio') content.insertAdjacentHTML('afterbegin', this.button('radio-add', text('addRadioStation', 'Add radio station')));
    if (view === 'liked') { const top = content.querySelector('.page-top'); top?.insertAdjacentHTML('afterend', downloadCollectionButton('liked', s.liked.map(this.ctx.findTrack).filter(Boolean), 'Liked Songs')); }
    if (view.startsWith('playlist:')) { const p = s.playlists.find(p => 'playlist:' + p.id === view); if (p) { const tracks = p.tracks.map(this.ctx.findTrack).filter(Boolean), top = content.querySelector('.page-top'); top?.insertAdjacentHTML('afterend', downloadCollectionButton(p.id, tracks, 'playlist')); content.querySelector('.section-heading')?.insertAdjacentHTML('afterend', `<div class="feature-toolbar playlist-actions">${this.button('playlist-options', t('editPlaylist'), p.id)}${p.source ? this.button('playlist-copy-zonic', 'Copy to Zonic', p.id) : ''}${p.source ? this.button('playlist-refresh', text('updatePlaylist', 'Refresh playlist'), p.id) : ''}${this.button('playlist-share', text('share', 'Share'), p.id)}</div>`); if (safeArtwork(p.artwork)) top?.insertAdjacentHTML('afterbegin', `<div class="cover playlist-cover"><img src="${esc(safeArtwork(p.artwork))}" alt=""></div>`); } }
    if (view === 'queue') {
      content.insertAdjacentHTML('afterbegin', `<div class="feature-toolbar">${this.button('queue-save', 'Save queue as playlist')}${this.button('queue-clear', t('clearQueue'))}</div>`);
      [...content.querySelectorAll('.track')].forEach((row, i) => { row.draggable = true; row.ondragstart = e => e.dataTransfer.setData('text/plain', String(i)); row.ondragover = e => e.preventDefault(); row.ondrop = e => { e.preventDefault(); this.ctx.moveQueue(+e.dataTransfer.getData('text/plain'), i); }; });
    }
    if (view === 'settings') {
      this.settings(); this.renderAccount(); this.renderCloudSync();
      content.insertAdjacentHTML('afterbegin', '<button data-view="home" class="settings-back">← Back to music</button>');
      // Library actions live with the collection; Settings keeps preferences.
      $('#settings-library > .settings-actions')?.remove();
      $('#settings-library .settings-card-head p').textContent = 'Choose when linked playlists update.';
      $('#settings-playback .settings-card-head p').textContent = 'Audio quality, volume, and listening preferences.';
      const account = $('#settings-account');
      if (account) $('#content .settings-grid').prepend(account);
      for (const key of ['streamingQuality', 'downloadQuality', 'autoplay', 'offline']) {
        const label = $(`[data-feature-setting="${key}"]`)?.closest('label');
        if (label) $('#settings-playback').append(label);
      }
      for (const key of ['theme', 'language', 'dynamicColor']) {
        const label = $(`[data-feature-setting="${key}"]`)?.closest('label');
        if (label) $('#settings-display').prepend(label);
      }
      $('[data-feature-setting="accent"]')?.closest('label') && $('#settings-display').append($('[data-feature-setting="accent"]').closest('label'));
      $('[data-feature-setting="repeatOne"]')?.closest('label')?.remove();
      const advanced = $('#proxy-url')?.closest('section');
      if (advanced) {
        const details = document.createElement('details'); details.className = 'settings-card';
        details.innerHTML = '<summary>Advanced connection settings</summary>';
        advanced.querySelectorAll('label, .settings-actions').forEach(element => details.append(element));
        advanced.replaceWith(details);
        for (const action of ['end-timer', 'timer-cancel']) {
          const button = details.querySelector(`[data-feature="${action}"]`);
          if (button) $('#settings-playback').append(button);
        }
      }
      $('#eq-enabled')?.closest('label')?.remove();
      $('#eq-preset')?.closest('label')?.remove();
      $('.bands')?.remove();
      $('[data-action="reset-eq"]')?.parentElement?.remove();
      $('#settings-playback').insertAdjacentHTML('beforeend', '<button class="primary" data-view="equalizer">Open equalizer →</button>');
      $('#settings-playback').insertAdjacentHTML('beforeend', `<label class="settings-row"><span class="settings-row-copy"><strong>Volume normalization</strong><small>${isNative ? 'Available in the web player.' : 'Gently reduces loud peaks and adds EQ headroom. For local files and streamed songs; direct radio is excluded. This changes dynamics, not download quality.'}</small></span><input id="audio-normalization" type="checkbox" ${s.settings.normalization ? 'checked' : ''} ${isNative ? 'disabled' : ''}></label>`);
    }
    if (view === 'home' && !s.settings.offline) {
      const seed = s.history.map(this.ctx.findTrack).find(t => t?.ytid), key = seed ? 'related:' + seed.ytid : '';
      if (key && this.pages.has(key)) { const tracks = this.pages.get(key); content.insertAdjacentHTML('beforeend', '<h2>' + esc(text('recommended', 'For you')) + '</h2>' + this.ctx.cards(tracks.slice(0, 8))); }
      else if (key && !this.recommending) { this.recommending = true; api('related', { id: seed.ytid, title: seed.title || '', artist: seed.artist || '' }).then(tracks => { this.pages.set(key, tracks); tracks.forEach(t => this.ctx.registerResult(t)); if (this.ctx.view === 'home') this.ctx.render(); }).catch(() => {}).finally(() => this.recommending = false); }
    }
    if (this.downloads.size) content.insertAdjacentHTML('afterbegin', `<div class="feature-toolbar"><span>${this.downloads.size} ${esc(text('downloading', 'Downloading'))}</span>${this.button('downloads-cancel', t('cancel'))}</div>`);
    translateUi(); decorateButtons();
  }
  renderCloudSync() {
    if (!this.cloud.configured) return;
    const grid = $('#settings-library'); if (!grid || grid.querySelector('#settings-cloud-sync')) return;
    const status = this.cloud.status;
    const connected = status.state === 'linked', reconnect = status.state === 'reconnect', signedOut = status.state === 'signed-out';
    grid.insertAdjacentHTML('beforeend', `<section class="settings-card" id="settings-cloud-sync"><div class="settings-card-head"><span class="settings-card-kicker">CLOUD SYNC</span><h3>Dropbox playlist sync</h3><p>${connected ? 'Dropbox follows your Zonic account and connects automatically on your other signed-in devices.' : reconnect ? 'Your previous encrypted connection needs to be connected one final time to enable automatic account sync.' : signedOut ? 'Log in to Zonic before connecting Dropbox.' : 'Connect Dropbox once, then access it by signing into your Zonic account.'}</p></div><div class="settings-actions">${connected ? '<button data-feature="cloud-pull">Restore playlists</button><button data-feature="cloud-push">Sync playlists now</button><button data-feature="cloud-unlink">Disconnect Dropbox</button>' : `<button class="primary" data-feature="cloud-connect" ${signedOut || !this.cloud.configured ? 'disabled' : ''}>${reconnect ? 'Reconnect Dropbox' : 'Connect Dropbox'}</button>`}</div><p class="settings-sync-status" role="status">${status.error ? esc(status.error) : connected ? 'Dropbox connected to your Zonic account' : reconnect ? 'One-time reconnection required' : signedOut ? 'Zonic account required' : 'Not connected'}</p></section>`);
  }
  renderAccount() {
    const grid = $('#settings-library'); if (!grid || grid.querySelector('#settings-account')) return;
    grid.insertAdjacentHTML('beforeend', `<section class="settings-card" id="settings-account"><div class="settings-card-head"><span class="settings-card-kicker">ACCOUNT</span><h3>${this.auth.signedIn ? 'Your account' : 'Welcome to Zonic'}</h3><p>${this.auth.signedIn ? esc(this.auth.email) : 'Sign in or create an account on the account page.'}</p></div><a class="settings-link" href="./login.html">${this.auth.signedIn ? 'Manage account' : 'Log in / Create account'} →</a></section>`);
  }
  custom(view) {
    const ctx = this.ctx, content = $('#content'), s = this.state;
    if (view === 'equalizer') {
      const bands = [60, 250, 1000, 4000, 12000];
      content.innerHTML = renderEqualizer(s.settings, isNative);
      const matchingPreset = ['balanced', 'bassBoost', 'trebleBoost', 'vocal', 'rock', 'pop', 'electronic'].find(name => eqPreset(name).every((gain, i) => gain === s.settings.eq[i]));
      $('#eq-preset').value = matchingPreset || '';
      content.querySelectorAll('[data-band]').forEach(input => input.addEventListener('input', () => {
        const values = [...content.querySelectorAll('[data-band]')].map(slider => +slider.value);
        $('#eq-curve-line').setAttribute('points', values.map((gain, i) => `${i * 75},${30 - gain * 2}`).join(' '));
        $('#eq-preset').value = '';
      }));
      return true;
    }
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
    if (view === 'downloads') {
      const stored = s.tracks.filter(t => t.kind === 'local' || t.downloaded), downloads = stored.filter(t => t.downloaded);
      const known = downloads.reduce((sum, track) => sum + (track.downloadBytes || 0), 0);
      const measuring = downloads.some(track => !track.downloadBytes) && !this.downloadStorageLoading;
      content.innerHTML = ctx.top('Downloads', `${stored.length} songs available offline · ${s.settings.downloadQuality} quality`) + `<section class="download-storage-card"><div><span>Downloaded audio</span><strong>${formatBytes(known)}</strong><small>${downloads.length} downloaded song${downloads.length === 1 ? '' : 's'}${measuring ? ' · Measuring…' : ''}</small></div><div><span>Average song</span><strong>${formatBytes(downloads.length ? known / downloads.length : 0)}</strong><small>Stored at original download quality</small></div></section>` + (this.downloads.size ? `<div class="feature-toolbar"><strong>${this.downloads.size} active download${this.downloads.size === 1 ? '' : 's'}</strong>${this.button('downloads-cancel', t('cancel'))}</div>` : '') + `<div class="download-size-list">${downloads.map(track => `<span><strong>${esc(track.title)}</strong><small>${track.downloadBytes ? formatBytes(track.downloadBytes) : 'Measuring…'}</small></span>`).join('')}</div>` + ctx.rows(stored);
      if (downloads.some(track => !track.downloadBytes)) this.measureDownloadStorage(downloads);
      return true;
    }
    if (view === 'recent') { content.innerHTML = ctx.top(t('recentlyPlayed'), `${s.history.length} songs in your listening history`) + this.button('history-clear', t('clearRecentlyPlayed')) + ctx.rows(s.history.map(ctx.findTrack).filter(Boolean)); return true; }
    if (view === 'radio-favorites') { content.innerHTML = ctx.top('Liked radio', '') + ctx.cards(s.tracks.filter(t => t.kind === 'radio' && s.liked.includes(t.id))); return true; }
    if (view === 'artists') {
      const favs = s.artistFavorites || [];
      const searchResults = this.pages.get('artist-search');
      const popularNames = ['Coldplay', 'Taylor Swift', 'The Weeknd', 'Billie Eilish', 'Kendrick Lamar', 'Adele', 'Queen', 'Dua Lipa'];
      const popularSeeds = this.pages.get('popular-artists') || popularNames.map(name => ({ id: name, name, artwork: '' }));
      if (!this.pages.has('popular-artists') && !this.loadingPopularArtists && !s.settings.offline) {
        this.loadingPopularArtists = true;
        Promise.all(popularNames.map(async name => {
          const results = await api('artists', { q: name });
          return results.find(artist => String(artist.name || '').toLocaleLowerCase() === name.toLocaleLowerCase()) || results[0] || { id: name, name, artwork: '' };
        })).then(artists => {
          this.pages.set('popular-artists', artists);
          if (this.ctx.view === 'artists') this.ctx.render();
        }).catch(() => {}).finally(() => this.loadingPopularArtists = false);
      }
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
    return `<div class="cards ${type === 'artist' ? 'artist-cards-grid' : ''}">${items.map(a => `<button class="card ${type === 'artist' ? 'artist-card' : ''}" data-feature="${type}-open" data-id="${esc(a.id)}"><div class="cover ${type === 'artist' ? 'artist-avatar-cover' : ''}">${type === 'artist' ? '<span class="artist-artwork-fallback" aria-hidden="true">✦</span>' : ''}${safeUrl(a.artwork) ? `<img src="${esc(a.artwork)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : type === 'artist' ? '' : '✦'}</div><strong>${esc(a.name)}</strong>${a.year ? `<small>${esc(a.year)}${a.type ? ' · ' + esc(a.type) : ''}</small>` : type === 'artist' ? '<small>Artist</small>' : ''}</button>`).join('')}</div>`;
  }
  settings() {
    const s = this.state.settings, grid = $('#content .settings-grid');
    const select = (key, values, label = text(key, key)) => `<label>${esc(label)}<select data-feature-setting="${key}">${values.map(([v, name]) => `<option value="${v}" ${s[key] === v ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>`;
    const linked = this.state.playlists.filter(p => youtubePlaylistId(p.source));
    const lastSynced = Math.max(0, ...linked.map(p => p.lastSyncedAt || 0));
    grid.querySelector('#settings-library')?.insertAdjacentHTML('beforeend', `<div class="settings-sync-controls"><label><input type="checkbox" data-feature-setting="autoPlaylistSync" ${s.autoPlaylistSync !== false ? 'checked' : ''}> Automatically sync YouTube playlists</label>${this.button('playlist-sync-all', this.syncingPlaylists ? 'Syncing…' : 'Sync now')}</div><p class="settings-sync-status" role="status">${this.syncingPlaylists ? 'Checking linked playlists…' : this.playlistSyncError ? `Last check failed: ${esc(this.playlistSyncError)}` : lastSynced ? `Last checked: ${esc(new Date(lastSynced).toLocaleString())}` : linked.length ? 'Waiting for the first sync.' : 'Import a YouTube playlist to start syncing.'}</p>`);
    const qualityOptions = ['low', 'medium', 'high'].map(v => [v, t('audioQuality' + v[0].toUpperCase() + v.slice(1))]);
    grid.insertAdjacentHTML('beforeend', `<section class="settings-card"><span class="settings-card-kicker">06 · PREFERENCES</span><h3>App preferences</h3>${[['offline', 'offlineMode'], ['autoplay', 'automaticSongPicker'], ['repeatOne', 'repeatOne'], ['dynamicColor', 'dynamicColor'], ['proxy', 'useProxy']].map(([k, label]) => `<label><input type="checkbox" data-feature-setting="${k}" ${s[k] ? 'checked' : ''}>${esc(text(label, k))}</label>`).join('')}${select('streamingQuality', qualityOptions, 'Streaming quality')}${select('downloadQuality', qualityOptions, 'Download quality')}${select('language', languageOptions().map(l => [l.code, l.name]))}${select('theme', ['dark', 'light', 'system', 'black'].map(v => [v, text(v, v)]))}<label>${esc(t('accentColor'))}<input type="color" value="${s.accent}" data-feature-setting="accent"></label><label>HTTP proxy URL<input type="url" id="proxy-url" value="${esc(s.proxyUrl)}"></label><div class="settings-actions">${this.button('proxy-save', t('save'))}${this.button('end-timer', t('endOfSong'))}${this.button('timer-cancel', t('cancel'))}</div></section>`);
    grid.insertAdjacentHTML('beforeend', `<section class="settings-card"><span class="settings-card-kicker">07 · DISCOVERY</span><h3>Smart Shuffle</h3><label><input type="checkbox" data-feature-setting="localAI" ${s.localAI !== false ? 'checked' : ''}>On-device AI matching</label><p>A small model included in Zonic matches song titles and artists on this device. Recommendations appear after every three playlist tracks; offline mode uses stored tracks only.</p></section>`);
    $('.bands')?.insertAdjacentHTML('beforebegin', `<label>${esc(t('equalizer'))}<select id="eq-preset">${['balanced', 'bassBoost', 'trebleBoost', 'vocal', 'rock', 'pop', 'electronic'].map(v => `<option value="${v}">${esc(t('equalizerPreset' + v[0].toUpperCase() + v.slice(1)))}</option>`).join('')}</select></label>`);
    grid.querySelector('#settings-backup')?.insertAdjacentHTML('beforeend', `<div class="settings-actions">${this.button('archive-export', 'Backup with audio')}${this.button('archive-import', 'Restore audio backup')}${this.button('musify-import', 'Import Musify .hive backup')}</div><div class="settings-actions settings-quiet-actions">${this.button('stats-clear', t('clearListeningStats'))}${this.button('cache-clear', t('clearCache'))}</div>`);
    grid.insertAdjacentHTML('beforeend', `<section class="settings-card"><span class="settings-card-kicker">08 · KEEP CURRENT</span><h3>${esc(text('update', 'Updates'))}</h3><label>Zonic release repository<input id="update-repository" placeholder="owner/repository" value="${esc(s.updateRepository || '')}"></label><label><input type="checkbox" data-feature-setting="autoUpdates" ${s.autoUpdates ? 'checked' : ''}>${esc(t('automaticUpdateChecks'))}</label><div class="settings-actions">${this.button('updates-save', t('save'))}${this.button('updates-check', text('checkForUpdates', 'Check for updates'))}${this.release?.available ? this.button('updates-open', text('downloadAppUpdate', 'Download update')) : ''}</div></section>`);
  }
  openTrack(track) {
    if (!track) return this.ctx.toast('Choose a track first.'); this.track = track;
    const sheet = $('#track-sheet'), playlist = this.state.playlists.find(p => 'playlist:' + p.id === this.ctx.view), artwork = safeArtwork(track.highResArtwork || track.artwork);
    const actions = [
      ['share', text('share', 'Share')], ['lyrics', text('lyrics', 'Lyrics')], ['playlist', text('addToPlaylist', 'Add to playlist')],
      ['queue', text('addToQueue', 'Add to queue')], ['next', text('playNext', 'Play next')],
      ...(playlist && !youtubePlaylistId(playlist.source) ? [['remove-playlist', 'Remove from this playlist']] : []),
      ...(track.albumId ? [['album', 'Go to album']] : []), ['artist', 'Go to artist'], ['download', text('download', 'Download')],
      ...(track.downloaded ? [['remove-download', text('deleteDownloads', 'Delete download')]] : []), ['delete', text('delete', 'Delete from library')]
    ];
    sheet.innerHTML = `<div class="track-menu-handle" aria-hidden="true"></div><div class="track-menu-head">${artwork ? `<img src="${esc(artwork)}" alt="">` : '<span>♫</span>'}<div><h2 data-user-text="1">${esc(track.title)}</h2><button class="artist-link" data-feature="track-artist">${esc(track.artist || 'Your library')}</button></div></div><div class="track-menu-actions">${actions.map(([name, label]) => this.button('track-' + name, label)).join('')}</div>${this.button('sheet-close', text('close', 'Close'))}`; decorateButtons(sheet); sheet.showModal();
  }
  async openTrackArtist(track) {
    if (!track?.artist || ['local', 'radio'].includes(track.kind)) return this.ctx.toast('No online artist profile is available for this track.');
    const artists = [...new Set(String(track.artist).split(/\s+(?:feat\.?|ft\.?|featuring|with|x|&|\+)\s+|\s*,\s*/i).map(name => name.trim()).filter(Boolean))];
    if (artists.length === 1) return this.openArtistCredit(artists[0], track.artistId);

    this.track = track;
    const sheet = $('#track-sheet');
    sheet.innerHTML = `<h2>Choose an artist</h2><p>${esc(track.title)}</p><div class="artist-choice-list">${artists.map(name => `<button data-feature="artist-credit" data-name="${esc(name)}">${esc(name)}</button>`).join('')}</div>${this.button('sheet-close', text('close', 'Close'))}`;
    decorateButtons(sheet);
    sheet.showModal();
  }
  async openArtistCredit(name, artistId = '') {
    if (artistId && /^UC[\w-]+$/.test(artistId) && artistId !== 'UC0000000000000000000000') return this.openPage('artist', artistId);
    this.ctx.toast(`Finding ${name}…`);
    const artists = await api('artists', { q: name });
    if (!artists.length) throw new Error(t('artistNotFound'));
    const exact = artists.find(artist => String(artist.name || '').trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    await this.openPage('artist', (exact || artists[0]).id);
  }
  async change(e) {
    if (e.target.dataset.band !== undefined && isNative) await this.ctx.setEq();
    const target = e.target, ctx = this.ctx, s = this.state;
    if (target.dataset.featureSetting) { s.settings[target.dataset.featureSetting] = target.type === 'checkbox' ? target.checked : target.value; await ctx.save(); if (isNative) await nativeRequest('settings', s.settings); if (target.dataset.featureSetting === 'proxy' && !isNative) await this.configureProxy(); ctx.render(); if (target.dataset.featureSetting === 'autoPlaylistSync' && target.checked) this.syncPlaylists().catch(() => {}); }
    if (target.id === 'eq-preset') {
      const previous = { eq: [...s.settings.eq], enabled: s.settings.eqEnabled };
      s.settings.eq = eqPreset(target.value); s.settings.eqEnabled = true;
      try { await ctx.setEq(); await ctx.save(); }
      catch (error) { s.settings.eq = previous.eq; s.settings.eqEnabled = previous.enabled; ctx.render(); throw error; }
      ctx.render();
    }
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
      case 'current-artist': await this.openTrackArtist(ctx.current); break;
      case 'current-queue': if (ctx.current) ctx.enqueue(ctx.current); else ctx.toast('Choose a song first.'); break;
      case 'current-next': if (ctx.current) ctx.enqueue(ctx.current, true); else ctx.toast('Choose a song first.'); break;
      case 'current-playlist': {
        if (!ctx.current) { ctx.toast('Choose a song first.'); break; }
        this.track = ctx.current;
        const editable = s.playlists.filter(p => !p.hidden && !youtubePlaylistId(p.source));
        sheet.innerHTML = `<h2>Add to playlist</h2><p>${esc(this.track.title)} · ${esc(this.track.artist || 'Your library')}</p><div class="playlist-choice-list">${editable.map(p => `<button data-feature="current-playlist-add" data-id="${esc(p.id)}"><span>${esc(p.name)}</span><small>${p.tracks.length} song${p.tracks.length === 1 ? '' : 's'}</small></button>`).join('') || '<p class="settings-note">Create a Zonic playlist to edit its songs.</p>'}</div>${this.button('current-playlist-create', 'Create a new playlist')}${this.button('sheet-close', text('close', 'Close'))}`;
        decorateButtons(sheet); sheet.showModal(); break;
      }
      case 'current-playlist-add': {
        const playlist = s.playlists.find(p => p.id === data.id);
        if (!playlist || !this.track) break;
        if (youtubePlaylistId(playlist.source)) { ctx.toast('YouTube playlists are protected. Copy it to Zonic to edit songs.'); break; }
        if (!s.tracks.some(t => t.id === this.track.id)) s.tracks.push(this.track);
        if (!playlist.tracks.includes(this.track.id)) playlist.tracks.push(this.track.id);
        await ctx.save(); sheet.close(); ctx.toast(`Added to ${playlist.name}.`); ctx.render(); break;
      }
      case 'current-playlist-create': {
        sheet.close(); const name = await ctx.ask('Create playlist', 'Playlist name');
        if (!name || !this.track) break;
        if (!s.tracks.some(t => t.id === this.track.id)) s.tracks.push(this.track);
        s.playlists.push({ id: randomId(), name, tracks: [this.track.id] });
        await ctx.save(); ctx.toast(`Added to ${name}.`); ctx.render(); break;
      }
      case 'track-play': await ctx.playTrack(track); break;
      case 'track-queue': ctx.enqueue(track); break;
      case 'track-next': ctx.enqueue(track, true); break;
      case 'track-playlist': {
        const editable = s.playlists.filter(p => !youtubePlaylistId(p.source));
        sheet.innerHTML = `<h2>Add to playlist</h2><p>${esc(track.title)} · ${esc(track.artist || 'Your library')}</p><div class="playlist-choice-list">${editable.map(p => `<button data-feature="current-playlist-add" data-id="${esc(p.id)}"><span>${esc(p.name)}</span><small>${p.tracks.length} song${p.tracks.length === 1 ? '' : 's'}</small></button>`).join('') || '<p class="settings-note">Create a Zonic playlist to edit its songs.</p>'}</div>${this.button('current-playlist-create', 'Create a new playlist')}${this.button('sheet-close', text('close', 'Close'))}`;
        decorateButtons(sheet); sheet.showModal(); break;
      }
      case 'track-remove-playlist': {
        const playlist = s.playlists.find(p => 'playlist:' + p.id === ctx.view);
        if (playlist && youtubePlaylistId(playlist.source)) { ctx.toast('YouTube playlists are protected. Copy it to Zonic to remove songs.'); break; }
        if (playlist) { playlist.tracks = playlist.tracks.filter(id => id !== track.id); await ctx.save(); ctx.toast(`Removed from ${playlist.name}.`); ctx.render(); }
        break;
      }
      case 'track-album': if (track.albumId) await this.openPage('album', track.albumId); break;
      case 'track-download': await this.download(track); break;
      case 'track-lyrics': { const result = await api('lyrics', { title: track.title, artist: track.artist }); sheet.innerHTML = `<h2>${esc(track.title)}</h2><div class="lyrics">${esc(result.lyrics || 'No lyrics found.')}</div>${this.button('sheet-close', text('close', 'Close'))}`; decorateButtons(sheet); sheet.showModal(); break; }
      case 'track-artist': await this.openTrackArtist(track); break;
      case 'artist-credit': sheet.close(); await this.openArtistCredit(data.name); break;
      case 'track-share': await this.share(track.ytid ? `https://www.youtube.com/watch?v=${track.ytid}` : track.url || track.title); break;
      case 'track-remove-download': { if (await ctx.ask(t('confirmation'), 'Type DELETE to remove stored audio.') !== 'DELETE') break; const tx = ctx.db.transaction('files', 'readwrite'); tx.objectStore('files').delete(track.id); if (isNative) await nativeRequest('remove-download', track); else if (ctx.fileBackend) await fetch('./api/remove-file?id=' + encodeURIComponent(track.id), { method: 'POST' }); track.downloaded = false; track.downloadBytes = 0; await ctx.save(); ctx.render(); break; }
      case 'track-delete': { if (await ctx.ask(t('confirmation'), 'Type DELETE to remove this library track.') !== 'DELETE') break; s.tracks = s.tracks.filter(t => t.id !== track.id); s.liked = s.liked.filter(id => id !== track.id); s.history = s.history.filter(id => id !== track.id); s.playlists.forEach(p => p.tracks = p.tracks.filter(id => id !== track.id)); await ctx.save(); ctx.render(); break; }
      case 'folder-create': { const name = await ctx.ask(t('createFolder'), t('enterFolderName')); if (name) s.folders.push({ id: randomId(), name }); await ctx.save(); ctx.render(); break; }
      case 'library-playlist-filter': this.libraryPlaylistFilter = ['all', 'zonic', 'youtube'].includes(data.id) ? data.id : 'all'; ctx.render(); break;
      case 'library-playlist-layout': this.libraryPlaylistLayout = this.libraryPlaylistLayout === 'list' ? 'grid' : 'list'; ctx.render(); break;
      case 'library-actions':
        sheet.innerHTML = `<div class="track-menu-handle"></div><h2>Library</h2><div class="track-menu-actions library-action-sheet"><button class="label-button" data-feature="library-import">Import music</button><button class="label-button" data-feature="library-youtube">Import YouTube playlist</button><button class="label-button" data-feature="library-spotify">Import Spotify CSV</button><button class="label-button" data-feature="library-create">Create playlist</button><button class="label-button" data-feature="library-open" data-id="downloads">Downloads</button><button class="label-button" data-feature="library-open" data-id="recent">Recently played</button></div>${this.button('sheet-close', text('close', 'Close'))}`;
        decorateButtons(sheet); sheet.showModal(); break;
      case 'library-import': sheet.close(); ctx.action('import'); break;
      case 'library-youtube': sheet.close(); await ctx.action('playlist-url'); break;
      case 'library-spotify': sheet.close(); ctx.action('spotify'); break;
      case 'library-create': sheet.close(); await ctx.action('new-playlist'); break;
      case 'library-open': sheet.close(); ctx.navigate(data.id); break;
      case 'folder-rename': { const f = s.folders.find(f => f.id === data.id), name = await ctx.ask(t('editFolder'), t('name'), f.name); if (name) f.name = name; await ctx.save(); ctx.render(); break; }
      case 'folder-delete': { if (await ctx.ask(t('confirmation'), 'Type DELETE to remove this folder. Playlists are kept.') !== 'DELETE') break; s.folders = s.folders.filter(f => f.id !== data.id); s.playlists.forEach(p => { if (p.folderId === data.id) p.folderId = ''; }); await ctx.save(); ctx.render(); break; }
      case 'playlist-options': { const p = s.playlists.find(p => p.id === data.id); this.editingPlaylist = p.id; sheet.innerHTML = `<h2>${esc(t('editPlaylist'))}</h2><label>${esc(t('customPlaylistName'))}<input id="playlist-edit-name" value="${esc(p.name)}" maxlength="120"></label><label>${esc(t('customPlaylistImgUrl'))}<input id="playlist-art-url" value="${esc(p.artwork || '')}"></label><label>${esc(text('custom', 'Choose artwork'))}<input id="playlist-art-file" type="file" accept="image/png,image/jpeg,image/webp"></label><label>${esc(text('createFolder', 'Folder'))}<select id="playlist-edit-folder"><option value="">—</option>${s.folders.map(f => `<option value="${esc(f.id)}" ${p.folderId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label><label><input type="checkbox" id="playlist-edit-pin" ${p.pinned ? 'checked' : ''}>Pin playlist</label>${this.button('playlist-save', t('save'))}${this.button('sheet-close', t('cancel'))}`; decorateButtons(sheet); sheet.showModal(); break; }
      case 'playlist-save': { const p = s.playlists.find(p => p.id === this.editingPlaylist), name = $('#playlist-edit-name').value.trim(), art = $('#playlist-art-url').value.trim(); if (!name) throw new Error('Enter a playlist name.'); if (art && !safeArtwork(art)) throw new Error('Enter a valid artwork URL or choose an image.'); p.name = name; p.artwork = safeArtwork(art); p.folderId = $('#playlist-edit-folder').value; p.pinned = $('#playlist-edit-pin').checked; await ctx.save(); sheet.close(); ctx.render(); break; }
      case 'playlist-download': { const ids = data.id === 'liked' ? s.liked : s.playlists.find(p => p.id === data.id)?.tracks; if (!ids || this.downloadingPlaylistId) break; const collectionLabel = data.id === 'liked' ? 'Liked Songs' : 'Playlist', pending = ids.map(ctx.findTrack).filter(track => track?.ytid && !track.isLive && !track.downloaded); if (!pending.length) { ctx.toast(`${collectionLabel} is already available offline.`); break; } this.cancelBatch = false; this.downloadingPlaylistId = data.id; let completed = 0, failed = 0; ctx.render(); try { for (const track of pending) { if (this.cancelBatch) break; try { await this.download(track); completed++; } catch { failed++; } } } finally { this.downloadingPlaylistId = ''; ctx.render(); } ctx.toast(this.cancelBatch ? `${collectionLabel} download stopped · ${completed} saved` : failed ? `${collectionLabel} download finished · ${completed} saved · ${failed} failed` : `${collectionLabel} downloaded · ${completed} songs available offline`); break; }
      case 'playlist-copy-zonic': { const source = s.playlists.find(p => p.id === data.id); if (!source) break; const copy = { ...source, id: randomId(), name: `${source.name} · Zonic`, tracks: [...source.tracks], source: '', lastSyncedAt: 0, pinned: false }; s.playlists.push(copy); await ctx.save(); ctx.navigate('playlist:' + copy.id); ctx.toast('Created an editable Zonic copy.'); break; }
      case 'playlist-refresh': await this.syncPlaylists({ force: true, notify: true, playlistId: data.id }); break;
      case 'playlist-sync-all': await this.syncPlaylists({ force: true, notify: true }); break;
      case 'eq-reset': s.settings.eq = [0, 0, 0, 0, 0]; await ctx.setEq(); await ctx.save(); ctx.render(); break;
      case 'account-open': window.location.assign('./login.html'); break;
      case 'cloud-connect': await this.cloud.connect(); break;
      case 'account-signin': case 'account-signup': { const email = $('#account-email')?.value.trim(), password = $('#account-password')?.value || '', status = $('#account-status'); if (!email || password.length < 6) { if (status) status.textContent = 'Enter a valid email and a password with at least 6 characters.'; break; } try { if (status) status.textContent = 'Signing in…'; if (action === 'account-signup') await this.auth.signUp(email, password); else await this.auth.signIn(email, password); this.cloud.refreshStatus(); this.ctx.toast(action === 'account-signup' ? 'Account created.' : 'Signed in.'); this.ctx.render(); } catch (error) { if (status) status.textContent = error.message; } break; }
      case 'account-signout': await this.cloud.lock(); this.auth.signOut(); this.ctx.toast('Signed out.'); this.ctx.render(); break;
      case 'cloud-unlink': await this.cloud.unlink(); this.ctx.toast('Dropbox disconnected.'); this.ctx.render(); break;
      case 'cloud-pull': { const remote = await this.cloud.pull(); const byId = new Map(this.state.playlists.map(p => [p.id, p])); for (const incoming of remote.playlists) if (incoming?.id && Array.isArray(incoming.songs)) { const playlist = byId.get(incoming.id) || { id: incoming.id, name: incoming.name || 'Imported playlist', tracks: [] }; playlist.name = incoming.name || playlist.name; playlist.tracks = incoming.songs.sort((a, b) => (a.position || 0) - (b.position || 0)).map(song => song.entryId || song.videoId).filter(Boolean); if (!byId.has(playlist.id)) this.state.playlists.push(playlist); } await this.ctx.save(); this.ctx.toast('Playlists restored from Dropbox.'); this.ctx.render(); break; }
      case 'cloud-push': { await this.cloud.push(this.state.playlists.map(p => ({ id: p.id, name: p.name, createdAt: p.createdAt || Date.now(), updatedAt: Date.now(), songs: p.tracks.map((videoId, position) => ({ entryId: `${p.id}:${videoId}`, videoId, position, updatedAt: Date.now() })) })), this.cloud.status.revision); this.ctx.toast('Playlists synced to Dropbox.'); break; }
      case 'playlist-share': { const p = s.playlists.find(p => p.id === data.id), tracks = p.tracks.map(ctx.findTrack).filter(Boolean); if (tracks.every(t => t.ytid)) { const bytes = new TextEncoder().encode(JSON.stringify({ title: p.name, image: p.artwork, source: 'user-created', list: tracks.map(t => t.ytid) })); const payload = btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); await this.share('grove://playlist/custom/' + payload); } else this.saveFile(JSON.stringify({ version: 1, tracks, playlists: [{ ...p, folderId: '' }] }), p.name + '.json', 'application/json'); break; }
      case 'queue-clear': ctx.clearQueue(); ctx.render(); break;
      case 'queue-save': { if (!ctx.queue.length) { ctx.toast('Your queue is empty.'); break; } const name = await ctx.ask('Save queue as playlist', 'Playlist name', 'Saved queue'); if (!name) break; const tracks = [...new Set(ctx.queue.map(track => track.id))]; for (const track of ctx.queue) if (!s.tracks.some(item => item.id === track.id)) s.tracks.push(track); const playlist = { id: randomId(), name, tracks, source: '' }; s.playlists.push(playlist); await ctx.save(); ctx.navigate('playlist:' + playlist.id); ctx.toast('Queue saved as an editable Zonic playlist.'); break; }
      case 'history-clear': s.history = []; await ctx.save(); ctx.render(); break;
      case 'radio-add': { const name = await ctx.ask('Add radio station', t('name')); if (!name) break; const url = await ctx.ask('Add radio station', 'HTTP/HTTPS stream URL'); if (!safeUrl(url)) throw new Error('Enter a valid audio URL.'); s.tracks.push({ id: 'radio:' + randomId(), title: name, artist: 'Radio', url: safeUrl(url), kind: 'radio' }); await ctx.save(); ctx.navigate('library'); break; }
      case 'artist-search': {
        const q = $('#artist-search')?.value.trim();
        if (q) {
          this.lastArtistQuery = q;
          this.pages.set('artist-search', await api('artists', { q }));
          ctx.render();
        }
        break;
      }
      case 'artist-open':
        if (/^UC[\w-]+$/.test(data.id)) await this.openPage('artist', data.id);
        else await this.openArtistCredit(data.id);
        break;
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
        this.pages.clear(); { const list = $('#search-suggestions'); if (list) { list.hidden = true; list.innerHTML = ''; } $('#search')?.setAttribute('aria-expanded', 'false'); }
        if (isNative) await fetch('./api/cache-clear', { method: 'POST' });
        else if (ctx.fileBackend) await fetch('./api/cache-clear', { method: 'POST' });
        ctx.toast(t('cacheMsg')); break;
      case 'updates-save': { const repository = $('#update-repository').value.trim(); if (repository && !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Enter owner/repository.'); s.settings.updateRepository = repository; await ctx.save(); ctx.toast(text('saved', 'Saved')); break; }
      case 'updates-check': this.release = await checkUpdates(s.settings.updateRepository || DEFAULT_UPDATE_REPOSITORY); ctx.toast(this.release.available ? `${text('appUpdateIsAvailable', 'Update available')}: ${this.release.version}${this.release.downloadUrl ? '' : ' (APK asset missing)'}` : 'You have the latest available Zonic version.'); ctx.render(); break;
      case 'updates-open': {
        const url = this.release?.downloadUrl || this.release?.url;
        if (!url || new URL(url).hostname !== 'github.com') throw new Error('This release does not contain a downloadable Android APK.');
        if (isNative) await nativeRequest('open-url', { url }); else window.open(url, '_blank', 'noopener,noreferrer');
        break;
      }
      case 'link-open': { const link = await ctx.ask('Open music link', 'YouTube song, playlist, or Zonic/Musify playlist link'); if (link) await this.openLink(link); break; }
      case 'downloads-cancel': for (const controller of this.downloads.values()) controller.abort(); if (isNative) await nativeRequest('cancel-downloads', {}); else if (ctx.fileBackend) await fetch('./api/cancel-downloads', { method: 'POST' }); this.cancelBatch = true; ctx.toast(t('downloadCancelled')); break;
    }
  }
  async openPage(kind, id) { const view = kind + ':' + id; this.ctx.navigate(view); const data = await api(kind, { id }); this.pages.set(view, data); for (const t of data.tracks || []) this.ctx.registerResult(t); if (this.ctx.view === view) this.ctx.render(); }
  async openLink(value) {
    if (/^grove:\/\/dropbox\/callback/i.test(value)) { await this.cloud.completeCallback(value); this.ctx.navigate('settings'); this.ctx.toast('Dropbox connected.'); return; }
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
  async addPlaylist(data) { for (const track of data.tracks) if (!this.state.tracks.some(t => t.id === track.id)) this.state.tracks.push(track); const p = { id: randomId(), name: data.name || 'Imported playlist', tracks: data.tracks.map(t => t.id), artwork: safeArtwork(data.artwork), source: safeUrl(data.source), hidden: isLikedSongsPlaylist(data.name) }; this.state.playlists.push(p); this.state.liked = mergeImportedLikes(this.state.liked, p.name, p.tracks); await this.ctx.save(); this.ctx.navigate(p.hidden ? 'liked' : 'playlist:' + p.id); if (p.hidden) this.ctx.toast('Imported songs were added to Liked Songs.'); }
  async configureProxy() { if (this.state.settings.proxy && !this.state.settings.proxyUrl) throw new Error('Enter a proxy URL first.'); const response = await fetch('./api/configure', { method: 'POST', body: JSON.stringify(this.state.settings) }); if (!response.ok) throw new Error('Proxy configuration failed.'); }
  async share(value) { if (isNative) await nativeRequest('share', { text: value }); else if (navigator.share) await navigator.share({ text: value }); else { await navigator.clipboard.writeText(value); this.ctx.toast(text('copied', 'Copied')); } }
  async download(track) {
    if (!track || ['local', 'radio'].includes(track.kind) || this.downloads.has(track.id)) return;
    if (track.isLive) return this.ctx.toast('Live streams cannot be saved as a complete song.');
    const controller = new AbortController(); this.downloads.set(track.id, controller); this.ctx.render(); this.ctx.toast(text('downloading', 'Downloading…'));
    try {
      if (isNative) { const result = await nativeRequest('download', { ...track, quality: this.state.settings.downloadQuality }); track.downloadBytes = Number.isSafeInteger(result.bytes) ? result.bytes : 0; }
      else if (this.ctx.fileBackend) {
        const response = await fetch('./api/download', { method: 'POST', body: JSON.stringify({ ...track, quality: this.state.settings.downloadQuality }) }); if (!response.ok) throw new Error(t('downloadFailed'));
        while (true) { const jobs = await api('downloads'), job = jobs[track.id]; if (job?.status === 'complete') break; if (!job || ['failed', 'cancelled'].includes(job.status)) throw new Error(job?.error || t('downloadFailed')); if (controller.signal.aborted) throw new DOMException('Download cancelled', 'AbortError'); this.ctx.toast(`${t('download')}: ${job.total > 0 ? Math.round(job.received / job.total * 100) + '%' : (job.received / 1048576).toFixed(1) + ' MB'}`); await new Promise(resolve => setTimeout(resolve, 500)); }
      }
      else { const response = await fetch(track.ytid ? streamUrl(track.ytid, this.state.settings.downloadQuality) : track.url, { signal: controller.signal }); if (!response.ok) throw new Error(t('downloadFailed')); const length = +response.headers.get('Content-Length'); if (length > 256 * 1024 * 1024) throw new Error('Download exceeds 256 MB.'); const reader = response.body.getReader(), chunks = []; let received = 0, last = 0; while (true) { const result = await reader.read(); if (result.done) break; received += result.value.length; if (received > 256 * 1024 * 1024) { controller.abort(); throw new Error('Download exceeds 256 MB.'); } chunks.push(result.value); if (Date.now() - last > 1000) { this.ctx.toast(`${t('download')}: ${length ? Math.round(received / length * 100) + '%' : (received / 1048576).toFixed(1) + ' MB'}`); last = Date.now(); } } await dbWrite(this.ctx.db, 'files', track.id, new Blob(chunks, { type: response.headers.get('Content-Type') || 'audio/mpeg' })); track.downloadBytes = received; }
      track.downloaded = true; if (!this.state.tracks.some(t => t.id === track.id)) this.state.tracks.push(track); await this.ctx.save(); this.ctx.toast(text('downloaded', 'Downloaded')); this.ctx.render();
    } catch (e) { if (e.name === 'AbortError') this.ctx.toast(t('downloadCancelled')); else throw e; } finally { this.downloads.delete(track.id); }
  }
  async measureDownloadStorage(tracks) {
    if (this.downloadStorageLoading) return;
    this.downloadStorageLoading = true;
    try {
      if (isNative) {
        const result = await nativeRequest('download-storage');
        for (const track of tracks) if (Number.isSafeInteger(result.byId?.[track.id])) track.downloadBytes = result.byId[track.id];
      } else {
        for (const track of tracks) {
          if (track.downloadBytes) continue;
          const blob = await dbRead(this.ctx.db, 'files', track.id);
          if (blob?.size) track.downloadBytes = blob.size;
        }
      }
      await this.ctx.save();
    } catch { /* Storage accounting is informative; playback remains available. */ }
    finally { this.downloadStorageLoading = false; if (this.ctx.view === 'downloads') this.ctx.render(); }
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
    if (/settings/i.test(file.name)) { const s = this.state.settings, quality = data.audioQuality || s.streamingQuality; Object.assign(s, { streamingQuality: quality, downloadQuality: quality, sponsorBlock: data.sponsorBlockSupport === true, offline: data.offlineMode === true, language: data.languageCode || s.language, autoplay: data.playNextSongAutomatically === true, eqEnabled: data.equalizerEnabled === true, eq: Array.isArray(data.equalizerBandGains) && data.equalizerBandGains.length === 5 ? data.equalizerBandGains : s.eq }); }
    else { if (await this.ctx.ask(t('confirmation'), 'Type IMPORT to replace the library with this Musify backup.') !== 'IMPORT') return; await this.ctx.replaceState(migrateMusify(data)); }
    await this.ctx.save(); this.ctx.render();
  }
}
