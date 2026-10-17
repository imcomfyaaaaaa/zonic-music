const $ = id => document.getElementById(id);
const pairing = $('pairing'), controls = $('controls'), message = $('message');
let token = localStorage.getItem('grove-tv-token') || '';
let playback = null;
let seeking = false;
const time = seconds => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : 'LIVE';
function showPaired(yes) { pairing.classList.toggle('hidden', yes); controls.classList.toggle('hidden', !yes); $('connection').textContent = yes ? '● Zonic TV' : 'TV offline'; $('connection').classList.toggle('online', yes); }
async function request(path, data) {
  const response = await fetch(path, { method: data ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'TV connection failed');
  return result;
}
async function refresh() {
  if (!token || document.hidden) return;
  try {
    const data = await request('/state');
    playback = data;
    showPaired(true); message.textContent = '';
    $('title').textContent = data.track?.title || 'Nothing playing';
    $('artist').textContent = data.track?.artist || 'Choose a track on your TV';
    const artwork = data.track?.artwork;
    $('art').replaceChildren();
    if (typeof artwork === 'string' && /^https:\/\//.test(artwork)) { const img = document.createElement('img'); img.src = artwork; img.alt = ''; $('art').append(img); $('backdrop').style.backgroundImage = `url("${artwork.replace(/["\\]/g, '')}")`; } else { $('art').textContent = '♫'; $('backdrop').style.backgroundImage = ''; }
    $('play').textContent = data.paused ? '▶' : 'Ⅱ';
    $('play').ariaLabel = data.paused ? 'Play' : 'Pause';
    $('shuffle').classList.toggle('active', data.shuffle === true); $('shuffle').setAttribute('aria-pressed', String(data.shuffle === true));
    const repeating = data.repeat && data.repeat !== 'none'; $('repeat').classList.toggle('active', repeating); $('repeat').setAttribute('aria-pressed', String(repeating)); $('repeat').textContent = data.repeat === 'one' ? '↻¹' : '↻';
    if (document.activeElement !== $('volume') && Number.isFinite(data.volume)) $('volume').value = data.volume;
    $('elapsed').textContent = time(data.position || 0);
    $('duration').textContent = time(data.duration);
    $('seek').disabled = !Number.isFinite(data.duration) || data.duration <= 0;
    if (!seeking && !$('seek').disabled) $('seek').value = Math.min(100, (data.position || 0) / data.duration * 100);
    const queue = $('queue'); queue.replaceChildren();
    $('queue-count').textContent = `${(data.queue || []).length} tracks`;
    for (const [index, track] of (data.queue || []).entries()) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.index = index; button.setAttribute('aria-current', index === data.index ? 'true' : 'false');
      const label = document.createElement('span'); label.textContent = track.title || 'Untitled';
      const artist = document.createElement('small'); artist.textContent = track.artist || '';
      label.append(artist); button.append(label, document.createTextNode(index === data.index ? '♫' : '▶')); queue.append(button);
    }
  } catch (error) { if (/Pair with the TV/.test(error.message)) { token = ''; localStorage.removeItem('grove-tv-token'); showPaired(false); } message.textContent = error.message; }
}
async function send(command, data = {}) { try { await request('/command', { command, ...data }); await refresh(); } catch (error) { message.textContent = error.message; } }
$('pair-form').addEventListener('submit', async event => { event.preventDefault(); try { const response = await request('/pair', { pin: $('pin').value.trim() }); token = response.token; localStorage.setItem('grove-tv-token', token); $('pin').value = ''; await refresh(); } catch (error) { message.textContent = error.message; } });
$('play').onclick = () => send(playback?.paused ? 'play' : 'pause');
$('previous').onclick = () => send('previous');
$('next').onclick = () => send('next');
$('shuffle').onclick = () => send('shuffle');
$('repeat').onclick = () => send('repeat');
$('seek').addEventListener('pointerdown', () => seeking = true);
$('seek').addEventListener('change', () => { seeking = false; if (Number.isFinite(playback?.duration)) send('seek', { seconds: playback.duration * Number($('seek').value) / 100 }); });
let volumeTimer; $('volume').addEventListener('input', () => { clearTimeout(volumeTimer); volumeTimer = setTimeout(() => send('volume', { volume: Number($('volume').value) }), 80); });
$('queue').onclick = event => { const row = event.target.closest('button[data-index]'); if (row) send('queue-play', { index: Number(row.dataset.index) }); };
$('disconnect').onclick = () => { token = ''; localStorage.removeItem('grove-tv-token'); showPaired(false); message.textContent = 'Disconnected'; };
document.addEventListener('visibilitychange', refresh);
setInterval(refresh, 750);
refresh();
