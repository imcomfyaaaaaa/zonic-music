const { app, BrowserWindow, protocol, net, shell, Tray, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
if (process.env.GROVE_TEST_HOME) { fs.mkdirSync(process.env.GROVE_TEST_HOME, { recursive: true }); app.setPath('userData', process.env.GROVE_TEST_HOME); }
const pendingLinks = [];
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on('second-instance', (_event, argv) => { activeWindow?.show(); activeWindow?.focus(); for (const arg of argv) if (arg.startsWith('grove://')) receiveLink(arg); });
function receiveLink(url) {
  if (!/^grove:\/\/playlist\//.test(url)) return;
  if (activeWindow && !activeWindow.webContents.isLoading()) { activeWindow.show(); activeWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('grove-link', {detail:${JSON.stringify(url)}}))`); }
  else pendingLinks.push(url);
}
app.on('open-url', (event, url) => { event.preventDefault(); receiveLink(url); });
protocol.registerSchemesAsPrivileged([{ scheme: 'musify', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let quitting = false, tray, activeWindow;
app.on('before-quit', () => quitting = true);
app.whenReady().then(async () => {
  if (!ownsInstance) return;
  if (app.isPackaged && !process.env.GROVE_TEST_HOME) app.setAsDefaultProtocolClient('grove');
  const { startEngine, engineFetch } = await import('../scripts/engine.mjs');
  const engine = startEngine({ dataRoot: path.join(app.getPath('userData'), 'tracks') });
  app.on('before-quit', () => engine.kill());
  const root = path.resolve(__dirname, '../dist');
  protocol.handle('musify', async request => {
    const url = new URL(request.url);
    if (url.hostname === 'app' && url.pathname.startsWith('/api/')) return engineFetch(url.pathname.slice(4) + url.search, { range: request.headers.get('range'), contentType: request.headers.get('content-type'), method: request.method, body: request.method === 'POST' ? request.body : undefined });
    const file = path.resolve(root, '.' + (decodeURIComponent(url.pathname) === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (url.hostname !== 'app' || !file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).href);
  });
  function createWindow() {
    const window = new BrowserWindow({ width: 1360, height: 900, minWidth: 700, minHeight: 600, backgroundColor: '#101414', title: 'Zonic', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
    activeWindow = window;
    window.webContents.on('did-finish-load', () => { for (const link of pendingLinks.splice(0)) receiveLink(link); });
    window.on('close', event => { if (!quitting && tray) { event.preventDefault(); window.hide(); } });
    window.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('musify://app/')) event.preventDefault(); });
    window.webContents.session.setPermissionRequestHandler((wc, permission, callback) => callback(permission === 'clipboard-sanitized-write' && wc.getURL().startsWith('musify://app/')));
    window.setMenuBarVisibility(false);
    window.loadURL('musify://app/');
  }
  createWindow();
  for (const arg of process.argv) if (arg.startsWith('grove://')) receiveLink(arg);
  tray = new Tray(path.join(root, 'icon.png'));
  tray.setToolTip('Zonic');
  const show = () => { if (activeWindow) { activeWindow.show(); activeWindow.focus(); } };
  const control = id => activeWindow?.webContents.executeJavaScript(`document.getElementById('${id}').click()`);
  tray.on('click', show);
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Zonic', click: show }, { label: 'Play / pause', click: () => control('play') }, { label: 'Next track', click: () => control('next') }, { label: 'Previous track', click: () => control('previous') }, { type: 'separator' }, { label: 'Quit Zonic', click: () => app.quit() }]));
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
