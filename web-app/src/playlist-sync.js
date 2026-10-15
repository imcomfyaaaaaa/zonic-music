export const PLAYLIST_SYNC_INTERVAL = 15 * 60 * 1000;

export function youtubePlaylistId(source) {
  try {
    const url = new URL(source);
    if (url.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'music.youtube.com'].includes(url.hostname)) return '';
    const id = url.searchParams.get('list') || '';
    return /^[A-Za-z0-9_-]{10,100}$/.test(id) ? id : '';
  } catch { return ''; }
}

export function mergePlaylistTracks(existing, incoming) {
  return [...new Set([...incoming, ...existing])];
}
