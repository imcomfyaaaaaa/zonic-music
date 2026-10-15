const params = new URL(location.href).searchParams;
export const isNative = params.get('native') === '1';
export const isTelevision = params.get('tv') === '1';
export async function nativeRequest(command, value, { blob, id } = {}) {
  const response = await fetch(`./native/${command}${id ? '?id=' + encodeURIComponent(id) : ''}`, value === undefined && !blob ? {} : { method: 'POST', headers: blob ? {} : { 'Content-Type': 'application/json' }, body: blob || JSON.stringify(value) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Native playback request failed.');
  return data;
}
export class NativeAudio extends EventTarget {
  _state = { paused: true, position: 0, duration: null, readyState: 0 };
  pending = false;
  error = '';
  get paused() { return this._state.paused; }
  get currentTime() { return this._state.position || 0; }
  set currentTime(seconds) { this._state.position = seconds; this.command('seek', { seconds }).catch(e => this.report(e)); }
  get duration() { return this._state.duration ?? Infinity; }
  get ended() { return false; }
  get readyState() { return this._state.readyState; }
  get volume() { return this._volume ?? .8; }
  set volume(volume) { this._volume = volume; nativeRequest('volume', { volume }).catch(e => this.report(e)); }
  async start(queue, index, settings) { this.pending = true; try { this.receive(await nativeRequest('play', { queue, index, settings })); } finally { this.pending = false; } }
  async play() { await nativeRequest('resume', {}); this._state.paused = false; this.dispatchEvent(new Event('play')); }
  pause() { nativeRequest('pause', {}).then(() => { this._state.paused = true; this.dispatchEvent(new Event('pause')); }).catch(e => this.report(e)); }
  async command(command, data = {}) { const response = await nativeRequest(command, data); if ('paused' in response) this.receive(response); return response; }
  report(error) { this.dispatchEvent(new CustomEvent('nativeerror', { detail: error.message })); }
  receive(state) {
    const wasPaused = this.paused;
    this._state = state;
    if (wasPaused !== this.paused) this.dispatchEvent(new Event(this.paused ? 'pause' : 'play'));
    this.dispatchEvent(new Event('timeupdate'));
    this.dispatchEvent(new CustomEvent('nativestate', { detail: state }));
    if (state.error && state.error !== this.error) { this.error = state.error; this.report(new Error(state.error)); }
    if (!state.error) this.error = '';
  }
  startPolling() {
    let polling = false;
    const poll = async () => { if (polling || this.pending || document.hidden) return; polling = true; try { this.receive(await nativeRequest('state')); } catch (e) { this.report(e); } finally { polling = false; } };
    setInterval(poll, 700); document.addEventListener('visibilitychange', poll); poll();
  }
}
export const nativeAudio = isNative ? new NativeAudio() : null;
