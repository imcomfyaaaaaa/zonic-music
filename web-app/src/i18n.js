let catalogs = {}, language = 'en';
export async function loadLanguages() { catalogs = await (await fetch('./src/languages.json')).json(); }
export function setLanguage(code) { language = catalogs[code] ? code : 'en'; document.documentElement.lang = language; document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr'; }
export function t(key, values = {}) { return (catalogs[language]?.[key] || catalogs.en?.[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '{' + name + '}'); }
export function languageOptions() { const names = new Intl.DisplayNames([language], { type: 'language' }); return Object.keys(catalogs).map(code => ({ code, name: names.of(code) })); }
const aliases = { 'Listen now': 'home', 'Your library': 'library', 'Liked songs': 'likedSongs', 'Radio stations': 'radioStations', 'Listening recap': 'timeMachine', 'Settings': 'settings', 'Create playlist': 'createPlaylist', 'Lyrics': 'lyrics', 'View queue': 'queue', 'Cancel': 'cancel', 'Save': 'save', 'Export library': 'backupUserData', 'Restore backup': 'restoreUserData', 'Import Spotify CSV': 'importSpotifyPlaylist', 'Import YouTube playlist': 'addPlaylist', 'Reset equalizer': 'equalizerReset', 'Sleep timer': 'sleepTimer' };
const originals = new WeakMap();
export function translateUi(root = document.body) {
  for (const el of root.querySelectorAll('button,h1,h2,h3,label,small,option')) {
    if (el.closest('.track,.card,.now,.lyrics,#playlist-nav') || el.dataset.userText) continue;
    for (const node of el.childNodes) if (node.nodeType === Node.TEXT_NODE) {
      if (!originals.has(node)) originals.set(node, node.textContent);
      const original = originals.get(node), source = original.trim();
      const key = aliases[source] || Object.keys(catalogs.en || {}).find(k => catalogs.en[k] === source);
      if (language === 'en') node.textContent = original;
      else if (key && catalogs[language]?.[key]) node.textContent = original.replace(source, t(key));
    }
  }
}
