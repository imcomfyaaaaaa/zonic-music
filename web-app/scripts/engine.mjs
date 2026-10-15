import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
export const enginePort = Number(process.env.GROVE_ENGINE_PORT || 4318);
export const engineRoutes = new Set(['health', 'search', 'suggestions', 'match', 'playlist', 'related', 'lyrics', 'segments', 'stream', 'hls', 'artists', 'artist', 'album', 'import-backup', 'configure', 'cache-clear', 'file', 'download', 'downloads', 'cancel-downloads', 'remove-file', 'video', 'expand-playlist', 'radio-browser', 'radio-click']);
export function startEngine({ dataRoot = new URL('../.data/', import.meta.url).pathname } = {}) {
  const compiled = new URL('../engine/build/grove-engine', import.meta.url).pathname;
  const bundled = resolve(homedir(), '.local/share/grove/dart-sdk/bin/dart');
  const executable = existsSync(compiled) ? compiled : process.env.GROVE_DART || (existsSync(bundled) ? bundled : 'dart');
  const child = spawn(executable, existsSync(compiled) ? [] : ['run', 'bin/server.dart'], { cwd: new URL('../engine', import.meta.url), env: { ...process.env, GROVE_ENGINE_PORT: String(enginePort), GROVE_DATA_ROOT: dataRoot }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => process.stdout.write(chunk)); child.stderr.on('data', chunk => process.stderr.write(chunk));
  child.on('error', () => console.log('Source engine unavailable. Local music and radio remain available.'));
  process.once('exit', () => child.kill());
  return child;
}
export async function engineFetch(path, { range, contentType, signal, method = 'GET', body } = {}) {
  const url = new URL(path, `http://127.0.0.1:${enginePort}`);
  if (!engineRoutes.has(url.pathname.slice(1))) return new Response('Unknown engine endpoint', { status: 404 });
  try { return await fetch(url, { method, body, ...(body ? { duplex: 'half' } : {}), headers: { ...(range ? { Range: range } : {}), ...(contentType ? { 'Content-Type': contentType } : {}) }, signal: signal || AbortSignal.timeout(url.pathname === '/stream' ? 120000 : 100000) }); }
  catch { return Response.json({ error: 'The Grove source engine is unavailable. Local files and radio still work.' }, { status: 503 }); }
}
