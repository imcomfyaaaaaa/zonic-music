import { createHash } from 'node:crypto';
import { mkdir, copyFile, cp, readFile, writeFile, readdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist', root), { recursive: true });
const buildId = Date.now().toString(36);
const document = (title, styles, entry) => `<!doctype html>
<html lang="en" data-build="${buildId}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#101016"><title>${title}</title><link rel="icon" href="./brand/favicon.svg?v=${buildId}"><link rel="apple-touch-icon" href="./brand/apple-touch-icon.png?v=${buildId}">${styles.map(style => `<link rel="stylesheet" href="./src/${style}.css?v=${buildId}">`).join('')}</head><body><div id="root"></div><noscript>Zonic needs JavaScript to play music.</noscript><script type="module" src="./src/${entry}.js?v=${buildId}"></script></body></html>`;
const styles = ['style', 'zonic', 'buttons', 'modern', 'experience', 'equalizer', 'tv', 'car'];
await writeFile(new URL('dist/index.html', root), document('Zonic · Your music, your space', styles, 'main'));
await writeFile(new URL('dist/settings.html', root), document('Settings · Zonic', styles, 'main'));
await writeFile(new URL('dist/login.html', root), document('Log in · Zonic', ['login'], 'login'));
await writeFile(new URL('dist/terms.html', root), document('Terms of Use · Zonic', ['login'], 'legal'));
await writeFile(new URL('dist/privacy.html', root), document('Privacy Policy · Zonic', ['login'], 'legal'));
await copyFile(new URL('firebase-config.json', root), new URL('dist/firebase-config.json', root));
await cp(new URL('src', root), new URL('dist/src', root), { recursive: true });
await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ['src/main.tsx', 'src/login.tsx', 'src/legal.tsx', 'src/ui/pages.tsx'],
  outdir: 'dist/src', outbase: 'src', bundle: true, splitting: true,
  format: 'esm', target: 'es2022', jsx: 'automatic', minify: true,
  external: ['./hls.js', './zip.js'],
  define: { 'process.env.NODE_ENV': '"production"' },
});
await cp(new URL('brand', root), new URL('dist/brand', root), { recursive: true });
await copyFile(new URL('node_modules/fflate/esm/browser.js', root), new URL('dist/src/zip.js', root));
await copyFile(new URL('node_modules/fflate/LICENSE', root), new URL('dist/src/zip-LICENSE', root));
await copyFile(new URL('node_modules/hls.js/dist/hls.mjs', root), new URL('dist/src/hls.js', root));
await copyFile(new URL('node_modules/hls.js/LICENSE', root), new URL('dist/src/hls-LICENSE', root));
await copyFile(new URL('vendor/transformers.js', root), new URL('dist/src/transformers.js', root));
await copyFile(new URL('vendor/transformers-LICENSE', root), new URL('dist/src/transformers-LICENSE', root));
const aiManifest = JSON.parse(await readFile(new URL('vendor/ai/manifest.json', root), 'utf8'));
for (const asset of aiManifest.files) {
  const bytes = await readFile(new URL('vendor/ai/' + asset.path, root));
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('AI bundle checksum mismatch: ' + asset.path);
}
await cp(new URL('vendor/ai/', root), new URL('dist/src/ai/', root), { recursive: true });
await copyFile(new URL('vendor/transformers-LICENSE', root), new URL('dist/src/ai/LICENSE', root));
const languages = {};
for (const file of await readdir(new URL('../lib/localization', root))) {
  if (!/^app_[a-z]{2}\.arb$/.test(file)) continue;
  const raw = JSON.parse(await readFile(new URL('../lib/localization/' + file, root), 'utf8'));
  languages[file.slice(4, 6)] = Object.fromEntries(Object.entries(raw).filter(([key, value]) => !key.startsWith('@') && typeof value === 'string'));
}
await writeFile(new URL('dist/src/languages.json', root), JSON.stringify(languages));
const dart = await readFile(new URL('../lib/database/radio_stations.db.dart', root), 'utf8');
const stations = [...dart.matchAll(/const RadioStation\(([\s\S]*?)\n  \),/g)].map(([, body]) => {
  const field = name => body.match(new RegExp(`${name}: '([^']*)'`))?.[1] || '';
  return { id: field('id'), title: field('name'), artist: field('genre'), url: field('streamUrl'), artwork: field('image'), kind: 'radio' };
}).filter(s => s.id && s.url);
await writeFile(new URL('dist/src/radio.json', root), JSON.stringify(stations, null, 2));
await copyFile(new URL('../LICENSE', root), new URL('dist/LICENSE', root));
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
await writeFile(new URL('dist/src/version.json', root), JSON.stringify({ version: pkg.version }));
await copyFile(new URL('../assets/icons/zonic_icon.png', root), new URL('dist/icon.png', root));
console.log(`Built web app with ${stations.length} radio stations and ${Object.keys(languages).length} language catalogs.`);
