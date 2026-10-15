import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Readable } from 'node:stream';
import { startEngine, engineFetch } from './engine.mjs';
import './build.mjs';
const engine = startEngine();
const root = resolve(new URL('../dist', import.meta.url).pathname);
const types = { '.html': 'text/html', '.ttf': 'font/ttf', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const bindHost = process.env.HOST || '0.0.0.0';
export const server = createServer(async (req, res) => {
  try {
    let requestHost;
    try { requestHost = new URL(`http://${req.headers.host}`); } catch { res.writeHead(403).end(); return; }
    const parsed = new URL(req.url, `http://${requestHost.hostname}`);
    const pathname = decodeURIComponent(parsed.pathname);
    if (pathname.startsWith('/api/')) {
      if (!['GET', 'POST'].includes(req.method) || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) { res.writeHead(403).end(); return; }
      const controller = new AbortController(); res.on('close', () => controller.abort());
      const response = await engineFetch(pathname.slice(4) + parsed.search, { range: req.headers.range, contentType: req.headers['content-type'], signal: controller.signal, method: req.method, body: req.method === 'POST' ? req : undefined });
      res.writeHead(response.status, Object.fromEntries([...response.headers].filter(([key]) => ['content-type', 'content-length', 'content-range', 'accept-ranges'].includes(key))));
      if (response.body) Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res); else res.end();
      return;
    }
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'text/plain', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(Number(process.env.PORT || 4317), bindHost, () => console.log(`Music app: http://${bindHost}:${server.address().port}`));
process.on('SIGTERM', () => { engine.kill(); server.close(); });
process.on('SIGINT', () => { engine.kill(); server.close(); });
