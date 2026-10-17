import { streamUrl } from './sources.js';

// Resolve and warm only the next track, without downloading a second song.
export class AudioPreparation {
  constructor() { this.controller = null; this.key = ''; this.completed = new Map(); }
  cancel() { this.controller?.abort(); this.controller = null; this.key = ''; }
  async prepare(track, settings) {
    if (settings.offline || navigator.connection?.saveData || settings.shuffle || !track?.ytid || track.downloaded || track.isLive) { this.cancel(); return; }
    const url = streamUrl(track.ytid, settings.streamingQuality || 'high');
    if (this.key === url) return;
    this.cancel();
    if ((this.completed.get(url) || 0) > Date.now()) return;
    const controller = this.controller = new AbortController(); this.key = url;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: controller.signal });
      await response.body?.cancel();
      if (response.ok) {
        if (this.completed.size >= 20) this.completed.clear();
        this.completed.set(url, Date.now() + 5 * 60 * 1000);
      }
    } catch { /* Preparation is optional; normal playback retries on selection. */ }
    finally { clearTimeout(timeout); if (this.controller === controller) { this.controller = null; this.key = ''; } }
  }
}
