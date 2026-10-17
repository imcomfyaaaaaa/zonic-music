import { renderToStaticMarkup } from 'react-dom/server';

interface EqSettings { eq: number[]; eqEnabled: boolean }
export function renderEqualizer(settings: EqSettings, native: boolean): string {
  return renderToStaticMarkup(<section className="eq-page">
    <button data-view="settings" className="eq-back">← Settings</button>
    <div className="eq-heading"><div><span className="eyebrow">YOUR SOUND</span><h1>Equalizer</h1></div><label className="eq-switch">On<input id="eq-enabled" type="checkbox" defaultChecked={settings.eqEnabled} /></label></div>
    <p className="eq-description">Shape your sound. Changes are saved automatically.</p>
    <div className="eq-console"><div className="eq-sliders">{[60, 250, 1000, 4000, 12000].map((frequency, i) => <label key={frequency} className="eq-band"><span className="eq-rail"><input type="range" min="-12" max="12" step="1" defaultValue={settings.eq[i]} data-band={i} aria-label={`${frequency} Hz gain`} /></span><strong>{frequency < 1000 ? frequency : frequency / 1000 + 'k'}</strong><small id={`gain-${i}`}>{settings.eq[i]} dB</small></label>)}</div>
      <div className="eq-curve" aria-label="Equalizer gain settings preview"><svg viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true"><path className="eq-zero" d="M0 30H300" /><polyline id="eq-curve-line" points={settings.eq.map((gain, i) => `${i * 75},${30 - gain * 2}`).join(' ')} /></svg></div>
      <div className="eq-actions"><label>Preset<select id="eq-preset" defaultValue=""><option value="" disabled>Custom</option>{['balanced', 'bassBoost', 'trebleBoost', 'vocal', 'rock', 'pop', 'electronic'].map(value => <option key={value} value={value}>{value.replace(/([A-Z])/g, ' $1')}</option>)}</select></label><button data-feature="eq-reset">Reset</button></div>
    </div><p className="eq-description">−12 to +12 dB · 5 bands. {native ? 'Uses your device’s audio equalizer.' : 'Applies to local files and streamed songs. Direct radio bypasses the equalizer.'}</p>
  </section>);
}

interface SettingsProps {
  linkedCount: number;
  sponsorBlock: boolean;
  television: boolean;
  isAuto: boolean;
  native: boolean;
  remote: { url: string; pin: string | number } | null;
}
export function renderSettings(props: SettingsProps): string {
  return renderToStaticMarkup(<>
    <div className="page-top"><span className="eyebrow">YOUR MUSIC, YOUR SPACE</span><h1>Settings</h1><p>Library, playback, and how Zonic looks on every screen.</p></div>
    <nav className="settings-jump" aria-label="Settings sections">{['Library', 'Playback', 'Display', 'Backup', 'About'].map(label => <a key={label} href={`#settings-${label.toLowerCase()}`}>{label}</a>)}</nav>
    <div className="settings-grid">
      <section className="settings-card settings-card-wide" id="settings-library"><div className="settings-card-head"><span className="settings-card-kicker">Library</span><h3>Collection &amp; sync</h3><p>Choose when linked playlists update.</p></div><div className="settings-sync-summary"><strong>{props.linkedCount} linked playlist{props.linkedCount === 1 ? '' : 's'}</strong><span>Checked on launch and every 15 minutes</span></div></section>
      <section className="settings-card" id="settings-playback"><div className="settings-card-head"><span className="settings-card-kicker">Playback</span><h3>Listening</h3><p>Audio quality, volume, and listening preferences.</p></div>
        <label className="settings-row settings-row-select"><span className="settings-row-copy"><strong>Sleep timer</strong><small>Stop playback after a set time</small></span><select id="sleep" defaultValue="0">{[0, 15, 30, 60].map(minutes => <option key={minutes} value={minutes}>{minutes ? `${minutes} minutes` : 'Off'}</option>)}</select></label>
        <label className="settings-row"><span className="settings-row-copy"><strong>SponsorBlock</strong><small>Skip sponsored segments on YouTube tracks</small></span><input type="checkbox" id="sponsor-block" defaultChecked={props.sponsorBlock} /></label>
      </section>
      <section className="settings-card" id="settings-display"><div className="settings-card-head"><span className="settings-card-kicker">Display</span><h3>Screens &amp; Environments</h3><p>Optimized experiences for living room TV remotes and in-car driving screens.</p></div>
        {props.television && <p className="settings-note">TV mode is on automatically for this device.</p>}
        {props.isAuto && <p className="settings-note">Android Auto / Car mode is on automatically for this device.</p>}
        {!props.television && !props.isAuto && <p className="settings-note">TV and car layouts turn on automatically when Zonic detects those environments.</p>}
        {props.television && <p className="settings-note">Arrow keys move focus · Enter selects · Escape returns home</p>}
        {props.television && <div className="settings-tv-remote"><h4>Control from your phone</h4>{props.remote ? <><p>On the same Wi-Fi network, open <strong>{props.remote.url}</strong> on your phone.</p><p>Pairing code: <strong>{props.remote.pin}</strong></p></> : <p>Connect this TV to Wi-Fi to enable phone control.</p>}</div>}
      </section>
      <section className="settings-card" id="settings-backup"><div className="settings-card-head"><span className="settings-card-kicker">Backup</span><h3>Backup &amp; restore</h3><p>Save playlists, favorites, settings, and listening history. Audio backups can include music stored on this device.</p></div><div className="settings-actions"><button className="primary" data-action="export">Export library</button><button data-action="restore">Restore backup</button></div></section>
      <section className="settings-card" id="settings-about"><div className="settings-card-head"><span className="settings-card-kicker">About</span><h3>Zonic</h3><p>Musify music sources and native background audio, with one interface across desktop, Android, and Android TV.</p></div><a className="settings-link" href="./LICENSE" target="_blank">GPLv3 license</a></section>
      {props.native && !props.television && <section className="settings-card"><div className="settings-card-head"><span className="settings-card-kicker">TV</span><h3>Connect to TV</h3><p>With your phone and TV on the same network, enter the remote address shown in Zonic Settings on the TV.</p></div><div className="settings-actions"><button className="primary" data-action="connect-tv">Connect to TV</button></div></section>}
    </div>
  </>);
}
