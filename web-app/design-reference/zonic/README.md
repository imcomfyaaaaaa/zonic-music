# Zonic: UI prototype

A Liquid Glass-style music streaming UI for PC, TV and phones.

## Run it
Open `index.html` in a browser. Or serve the folder:

    python3 -m http.server 8000   # then visit http://localhost:8000

## Files
- `index.html`: markup (sidebar, main, player, Up next panel, mobile tabs)
- `styles.css`: design tokens, glass styling, responsive and TV layouts
- `app.js`: sample tracks, playlists (incl. Liked Songs), browse and search, player, TV/remote key navigation

## Notes
- Playback is simulated (no audio); tracks and playlists are sample data and reset on reload.
- Fonts load from Google Fonts (Manrope). Offline, it falls back to system fonts.
- TV: arrow keys move focus, Space and media keys control playback. The layout scales up at 1600px and 2300px wide.
