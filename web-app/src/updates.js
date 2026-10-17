export function newerVersion(current, latest) {
  const parse = value => value.replace(/^v/, '').split(/[.+-]/).slice(0, 3).map(Number);
  const a = parse(current), b = parse(latest);
  if (a.some(n => !Number.isFinite(n)) || b.some(n => !Number.isFinite(n))) return false;
  for (let i = 0; i < 3; i++) { if ((b[i] || 0) > (a[i] || 0)) return true; if ((b[i] || 0) < (a[i] || 0)) return false; } return false;
}
export const DEFAULT_UPDATE_REPOSITORY = 'imcomfyaaaaaa/zonic-music';

export function selectApkAsset(assets) {
  const apks = (Array.isArray(assets) ? assets : []).filter(asset =>
    typeof asset?.browser_download_url === 'string' && /\.apk$/i.test(asset.name || '')
  );
  return apks.find(asset => /github.*\.apk$/i.test(asset.name || ''))
    || apks.find(asset => !/(arm|x86)/i.test(asset.name || ''))
    || apks[0]
    || null;
}
export async function checkUpdates(repository) {
  repository = repository || DEFAULT_UPDATE_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Configure a Zonic release repository as owner/name.');
  const [version, response] = await Promise.all([fetch('./src/version.json').then(r => r.json()), fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) })]);
  if (!response.ok) throw new Error(response.status === 404 ? 'No public release was found. For automatic updates, publish the APK in a public GitHub releases repository.' : response.status === 403 ? 'GitHub temporarily blocked update checks. Try again later.' : 'Could not check for updates.');
  const release = await response.json();
  const asset = selectApkAsset(release.assets);
  return { available: newerVersion(version.version, release.tag_name), version: release.tag_name, url: release.html_url, downloadUrl: asset?.browser_download_url || '', assetName: asset?.name || '', assets: release.assets || [] };
}
