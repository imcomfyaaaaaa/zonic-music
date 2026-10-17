// Grove's shared, dependency-free outline icons. Decorative SVGs never add accessible names.
const paths = {
 home: '<path d="m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9"/>',
 search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 library: '<path d="M4 4v16M9 4v16M14 5l5-1 3 15-5 1z"/>',
 heart: '<path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/>',
 radio: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4m8.4-8.4a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
 history: '<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7m2-5v6l4 2"/>',
 settings: '<path d="m10 3-.6 2.2-2 .9-2-.6-2 3.5 1.5 1.6v2.8L3.4 15l2 3.5 2-.6 2 .9.6 2.2h4l.6-2.2 2-.9 2 .6 2-3.5-1.5-1.6v-2.8L20.6 9l-2-3.5-2 .6-2-.9L14 3Z"/><circle cx="12" cy="12" r="3"/>',
 plus: '<path d="M12 5v14M5 12h14"/>',
 upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
 download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 downloaded: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/>',
 play: '<path d="m9 5 11 7-11 7Z"/>',
 pause: '<path d="M8 5v14M16 5v14"/>',
 previous: '<path d="M5 5v14m14-14L8 12l11 7Z"/>',
 next: '<path d="M19 5v14M5 5l11 7-11 7Z"/>',
 shuffle: '<path d="m17 3 4 4-4 4m0 2 4 4-4 4M3 7h3c5 0 7 10 12 10h3M3 17h3c2 0 4-3 6-6s4-4 6-4h3"/>',
 sparkles: '<path d="m9 3 2.2 5.8L17 11l-5.8 2.2L9 19l-2.2-5.8L1 11l5.8-2.2Zm10 10 1.1 2.9L23 17l-2.9 1.1L19 21l-1.1-2.9L15 17l2.9-1.1ZM19 2v5m-2.5-2.5h5"/>',
 repeat: '<path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3"/>',
 queue: '<path d="M3 5h18M3 10h18M3 15h10m4-1 5 4-5 4Z"/>',
 lyrics: '<path d="M5 4h14v16H5ZM8 8h8m-8 4h8m-8 4h5"/>',
 more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
 arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
 external: '<path d="M14 3h7v7m0-7L10 14M10 3H4v17h17v-6"/>',
 close: '<path d="m6 6 12 12M6 18 18 6"/>',
 up: '<path d="M12 20V4m-7 7 7-7 7 7"/>',
 tv: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/>',
 car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10l-1.5-4.5c-.3-.9-1.1-1.5-2.1-1.5H8.6c-1 0-1.8.6-2.1 1.5L5 10s-2.7.6-4.5 1.1C.7 11.3 0 12.1 0 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
 music: '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>',
 folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10H3Z"/>',
 edit: '<path d="m14 5 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>',
 trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 share: '<path d="M12 15V2m-5 5 5-5 5 5M5 11v10h14V11"/>',
 link: '<path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
 refresh: '<path d="M20 7a9 9 0 0 0-15-3L2 7m0-5v5h5m-3 10a9 9 0 0 0 15 3l3-3m0 5v-5h-5"/>',
 artist: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 save: '<path d="M4 3h13l4 4v14H3V3Zm3 0v6h9V3M7 21v-8h10v8"/>',
 timer: '<circle cx="12" cy="14" r="8"/><path d="M9 2h6m-3 0v4m0 4v5l3 2m3-12 2 2"/>',
 volume: '<path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
};
export function icon(name) { return `<svg class="ui-icon" data-icon="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.music}</svg>`; }
const views = { home: 'home', browse: 'search', library: 'library', liked: 'heart', radio: 'radio', recap: 'history', recent: 'history', settings: 'settings', queue: 'queue', downloads: 'download', artists: 'artist', 'radio-favorites': 'radio', auto: 'car', 'tv-player': 'tv' };
const actions = { import: 'upload', url: 'link', 'playlist-url': 'link', spotify: 'music', export: 'upload', restore: 'download', 'online-search': 'search', 'more-results': 'plus', lyrics: 'lyrics', 'lyrics-fullscreen': 'lyrics', 'lyrics-close': 'close', download: 'download', 'new-playlist': 'plus', tv: 'tv', auto: 'car', car: 'car', 'reset-eq': 'refresh' };
const features = { 'current-menu': 'more', 'current-queue': 'queue', 'current-next': 'next', 'current-playlist': 'plus', 'current-playlist-create': 'plus', 'sheet-close': 'close', 'track-play': 'play', 'track-queue': 'queue', 'track-next': 'next', 'track-playlist': 'plus', 'track-remove-playlist': 'trash', 'track-album': 'music', 'track-download': 'download', 'track-lyrics': 'lyrics', 'track-artist': 'artist', 'track-share': 'share', 'track-remove-download': 'trash', 'track-delete': 'trash', 'playlist-options': 'edit', 'playlist-download': 'download', 'playlist-refresh': 'refresh', 'playlist-share': 'share', 'playlist-save': 'save', 'folder-create': 'folder', 'folder-rename': 'edit', 'folder-delete': 'trash', 'queue-clear': 'trash', 'radio-add': 'plus', 'history-clear': 'trash', 'artist-search': 'search', 'artist-like': 'heart', 'archive-export': 'upload', 'archive-import': 'download', 'musify-import': 'download', 'stats-clear': 'trash', 'cache-clear': 'trash', 'proxy-save': 'save', 'updates-save': 'save', 'updates-check': 'refresh', 'updates-open': 'download', 'end-timer': 'timer', 'timer-cancel': 'close', 'downloads-cancel': 'close', 'link-open': 'link' };
const ids = { 'new-playlist': 'plus', 'import-music': 'upload', 'tv-mode': 'tv', 'auto-mode': 'car', previous: 'previous', next: 'next', repeat: 'repeat', 'now-more': 'more', 'dialog-confirm': 'save' };
export function decorateButtons(root = document) {
 for (const button of root.querySelectorAll('button')) {
  if (button.matches('.card,.track-name,.queue-preview-track,.artist,.zone-chip') || button.querySelector('strong') || button.dataset.browseQuery) continue;
  let name = ids[button.id] || features[button.dataset.feature] || actions[button.dataset.action] || views[button.dataset.view] || (button.dataset.view?.startsWith('playlist:') ? 'music' : null);
  if (button.id === 'play') name = button.ariaLabel === 'Pause' ? 'pause' : 'play';
  if (button.id === 'shuffle') name = button.ariaLabel?.startsWith('Smart') ? 'sparkles' : 'shuffle';
  if (button.id === 'now-like' || button.dataset.like) { name = 'heart'; button.setAttribute('aria-pressed', String(button.classList.contains('liked'))); }
  if (button.dataset.menu) name = 'more';
  if (button.dataset.playlistPlay) name = 'play';
  if (button.dataset.renamePlaylist) name = 'edit';
  if (button.dataset.deletePlaylist || button.dataset.removeQueue !== undefined) name = 'trash';
  if (button.dataset.up !== undefined) name = 'up';
  if (button.value === 'cancel') name = 'close';
  if (!name) continue;
  if (button.querySelector(':scope > .ui-icon')?.dataset.icon === name) continue;
  const only = !!button.getAttribute('aria-label') && !['tv-mode','auto-mode','dialog-confirm'].includes(button.id) || ['play','shuffle','repeat','previous','next','now-like'].includes(button.id);
  // Retain text nodes for translation; do not replace user-supplied playlist names.
  button.querySelectorAll(':scope > .ui-icon').forEach(el => el.remove());
  for (const span of button.querySelectorAll(':scope > span')) if (/^[⌂⌕▤♡◉◷]+$/.test(span.textContent.trim())) span.remove();
  for (const node of [...button.childNodes]) if (node.nodeType === 3) node.textContent = only ? '' : node.textContent.replace(/^[\s＋+▶♫⚙]+|[\s↗↓]+$/gu, '');
  if (only) { button.classList.add('icon-button'); button.title = button.getAttribute('aria-label') || ''; }
  else button.classList.add('label-button');
  button.insertAdjacentHTML('afterbegin', icon(name));
 }
 for (const el of root.querySelectorAll('.search>span,.brand-icon')) if (!el.querySelector('svg')) el.innerHTML = icon(el.classList.contains('brand-icon') ? 'music' : 'search');
}
