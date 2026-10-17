import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AppShell } from './ui/AppShell';
import './native-feel';

// Chrome may restore a complete older app from its back-forward cache. Once a
// current build has loaded, check the hosted shell whenever the app returns to
// the foreground and replace stale code without touching account/library data.
let checkingBuild = false;
async function refreshStaleBuild() {
  if (checkingBuild || document.visibilityState === 'hidden') return;
  checkingBuild = true;
  try {
    const response = await fetch(`./index.html?build-check=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const latest = (await response.text()).match(/<html[^>]*data-build="([^"]+)"/i)?.[1];
    const current = document.documentElement.dataset.build;
    if (latest && current && latest !== current) {
      const url = new URL(location.href); url.searchParams.set('updated', latest); location.replace(url);
    }
  } catch { /* Offline use keeps the installed build. */ }
  finally { checkingBuild = false; }
}
window.addEventListener('pageshow', (event: PageTransitionEvent) => { if (event.persisted) refreshStaleBuild(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshStaleBuild(); });
setTimeout(refreshStaleBuild, 1500);

// Commit the static element hosts before the existing playback controller binds
// its DOM listeners. The controller owns their dynamic content from this point.
const root = document.getElementById('root')!;
if (location.pathname === '/dropbox-callback' && new URLSearchParams(location.search).get('state')?.startsWith('n.')) {
  const deepLink = `grove://dropbox/callback${location.search}`;
  root.innerHTML = `<main style="min-height:100vh;display:grid;place-content:center;padding:24px;text-align:center;font-family:system-ui;background:#101016;color:white"><img src="./brand/zonic-mark-512.png" alt="Zonic" width="96" style="margin:auto;border-radius:24px"><h1>Dropbox connected</h1><p>Return to Zonic to finish securely.</p><a href="${deepLink}" style="display:inline-block;padding:14px 20px;border-radius:14px;background:#8e80ff;color:white;text-decoration:none;font-weight:700">Open Zonic</a></main>`;
  location.assign(deepLink);
  throw new Error('Dropbox callback handed back to Zonic.');
}
root.inert = true;
root.setAttribute('aria-busy', 'true');
flushSync(() => createRoot(root).render(<AppShell />));
import('./app.js').then(() => {
  root.inert = false;
  root.removeAttribute('aria-busy');
  sessionStorage.removeItem('zonic-start-recovery');
}).catch((error: unknown) => {
  root.inert = false;
  root.removeAttribute('aria-busy');
  if (!sessionStorage.getItem('zonic-start-recovery')) {
    sessionStorage.setItem('zonic-start-recovery', '1');
    const url = new URL(location.href);
    url.searchParams.set('refresh', document.documentElement.dataset.build || Date.now().toString(36));
    location.replace(url);
    return;
  }
  const content = document.getElementById('content');
  if (content) content.textContent = 'Zonic could not start. Tap refresh to try again.';
  console.error(error);
});
