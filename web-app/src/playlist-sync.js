export const PLAYLIST_SYNC_INTERVAL = 15 * 60 * 1000;

export function youtubePlaylistId(source) {
  const input = String(source || '').trim();
  if (/^[A-Za-z0-9_-]{10,100}$/.test(input)) return input;
  try {
    const match = input.match(/https?:\/\/[^\s<>"']+/i);
    const url = new URL(match?.[0] || input);
    if (url.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be'].includes(url.hostname.toLowerCase())) return '';
    const id = url.searchParams.get('list') || '';
    return /^[A-Za-z0-9_-]{10,100}$/.test(id) ? id : '';
  } catch { return ''; }
}

export function mergePlaylistTracks(existing, incoming) {
  return [...new Set([...incoming, ...existing])];
}

export function isLikedSongsPlaylist(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase() === 'liked songs';
}

export function mergeImportedLikes(existing, playlistName, trackIds) {
  return isLikedSongsPlaylist(playlistName) ? [...new Set([...(existing || []), ...(trackIds || [])])] : existing;
}
