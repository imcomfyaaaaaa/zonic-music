export async function api(endpoint, params = {}, { signal } = {}) {
  const response = await fetch(`./api/${endpoint}?${new URLSearchParams(params)}`, { signal: signal || AbortSignal.timeout(100000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('Music source service did not return a valid response.'); }
  if (!response.ok) throw new Error(data.error || 'Music source request failed.');
  return data;
}
export const streamUrl = (id, quality = 'high') => `./api/stream?id=${encodeURIComponent(id)}&quality=${encodeURIComponent(quality)}`;
