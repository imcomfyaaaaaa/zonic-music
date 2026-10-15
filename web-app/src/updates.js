export function newerVersion(current, latest) {
  const parse = value => value.replace(/^v/, '').split(/[.+-]/).slice(0, 3).map(Number);
  const a = parse(current), b = parse(latest);
  if (a.some(n => !Number.isFinite(n)) || b.some(n => !Number.isFinite(n))) return false;
  for (let i = 0; i < 3; i++) { if ((b[i] || 0) > (a[i] || 0)) return true; if ((b[i] || 0) < (a[i] || 0)) return false; } return false;
}
export async function checkUpdates(repository) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Configure a Grove release repository as owner/name.');
  const [version, response] = await Promise.all([fetch('./src/version.json').then(r => r.json()), fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) })]);
  if (!response.ok) throw new Error(response.status === 404 ? 'No release is available from this repository.' : 'Could not check for updates.');
  const release = await response.json();
  return { available: newerVersion(version.version, release.tag_name), version: release.tag_name, url: release.html_url, assets: release.assets || [] };
}
