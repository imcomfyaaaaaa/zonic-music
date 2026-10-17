/** Static hosts belong to the playback controller after the initial mount.
 * Do not re-render this shell: it preserves audio elements and delegated events. */
export function AppShell() {
  const build = document.documentElement.dataset.build || 'dev';
  const logo = `./brand/zonic-wordmark-on-dark.svg?v=${build}`;
  return <>
    <div className="ambient" aria-hidden="true" />
    <aside className="sidebar">
      <a className="brand" href="#home" aria-label="Zonic home"><img className="brand-logo" src={logo} alt="Zonic" /></a>
      <div className="nav-label">Menu</div>
      <nav aria-label="Main navigation"><button data-view="tv-player" className="tv-nav-now-playing" hidden>Now Playing</button>{['Home', 'Browse', 'Library', 'Artists', 'Liked', 'Radio', 'Recap'].map(label => <button key={label} data-view={label.toLowerCase()}>{label}</button>)}</nav>
      <div className="playlist-label"><span className="nav-label">Your Library</span><button id="new-playlist" aria-label="Create playlist">＋</button></div>
      <div id="playlist-nav" />
      <div className="sidebar-bottom"><button id="import-music">＋ Import music</button><button data-view="settings">⚙ Settings</button><small>Zonic · Built on Musify · GPLv3</small></div>
    </aside>
    <main>
      <header>
        <a className="mobile-brand" href="#home" aria-label="Zonic home"><img src={logo} alt="Zonic" /></a>
        <div className="search"><span>⌕</span><input id="search" type="search" placeholder="What do you want to hear?" aria-label="Search your music or radio" aria-autocomplete="list" aria-controls="search-suggestions" aria-expanded="false" autoComplete="off" /><kbd>/</kbd><div id="search-suggestions" className="search-suggestions" role="listbox" hidden /></div>
        <button id="queue-toggle" aria-label="Open listening queue" aria-expanded="false">Up next</button><button data-view="settings" aria-label="Settings">⚙</button>
      </header>
      <div id="content" />
    </main>
    <aside className="queue-rail" aria-label="Up next" inert><div className="queue-kicker">QUEUE</div><div className="section-heading"><h2>Up next</h2><button id="queue-close" aria-label="Close listening queue">×</button></div><div id="queue-preview" /><button data-view="queue">Manage full queue ↗</button></aside>
    <button className="queue-scrim" id="queue-scrim" aria-label="Close listening queue" tabIndex={-1} />
    <nav className="mobile-tabs" aria-label="Sections">{['Home', 'Browse', 'Artists', 'Library'].map(label => <button key={label} data-view={label.toLowerCase()}>{label}</button>)}</nav>
    <Player />
    <input id="music-files" type="file" accept="audio/*,.mp3,.flac,.ogg,.wav,.m4a,.aac,.opus" multiple hidden />
    <input id="backup-file" type="file" accept="application/json,.json" hidden /><input id="spotify-file" type="file" accept="text/csv,.csv" hidden />
    <dialog id="dialog"><form method="dialog"><h2 id="dialog-title" /><label id="dialog-label" htmlFor="dialog-input" /><input id="dialog-input" required maxLength={120} /><div className="dialog-actions"><button value="cancel" formNoValidate>Cancel</button><button id="dialog-confirm" value="confirm" className="primary">Save</button></div></form></dialog>
    <div id="toast" role="status" aria-live="polite" /><audio id="audio" preload="auto" />
  </>;
}

function Player() {
  return <footer className="player" aria-label="Music player">
    <button id="player-expand" aria-label="Expand music player" aria-expanded="false">↗</button>
    <div className="player-context"><small>Playing from</small><strong id="player-context-title">Zonic</strong></div>
    <div className="now"><div id="now-art" className="cover small">♫</div><div><strong id="now-title">Your next favorite awaits</strong><button id="now-artist" className="artist-link" data-feature="current-artist">Import music or tune into radio</button></div><button id="now-like" aria-label="Like current track">♡</button><button id="now-more" data-feature="current-menu" aria-label="More song options">⋮</button></div>
    <div className="mini-actions"><button data-feature="current-next">Play next</button><button data-feature="current-queue">Add to queue</button><button data-feature="current-playlist">Add to playlist</button></div>
    <div className="transport"><div className="transport-buttons"><button id="shuffle" aria-label="Shuffle" aria-pressed="false">⤨</button><button id="previous" aria-label="Previous track">⏮</button><button id="play" className="play-main" aria-label="Play">▶</button><button id="next" aria-label="Next track">⏭</button><button id="repeat" aria-label="Repeat" aria-pressed="false">↻</button></div><div className="timeline"><small id="elapsed">0:00</small><input id="seek" type="range" min="0" max="100" defaultValue="0" aria-label="Seek" /><small id="duration">0:00</small></div></div>
    <div className="extras"><button data-action="lyrics-fullscreen" aria-label="Full-screen lyrics">≋</button><button data-action="download" aria-label="Download current track">↓</button><button data-view="queue" aria-label="View queue">☷</button><span>◖</span><input id="volume" type="range" min="0" max="1" step="0.01" defaultValue="0.8" aria-label="Volume" /></div>
    <section className="expanded-lyrics"><div className="expanded-lyrics-head"><h2>Lyrics</h2><button data-action="lyrics-close" aria-label="Close full-screen lyrics">×</button></div><div id="lyrics-preview" className="lyrics-scroll">Play a song to see synchronized lyrics.</div><button className="primary lyrics-fullscreen-open" data-action="lyrics-fullscreen">Full-screen lyrics</button></section>
  </footer>;
}
