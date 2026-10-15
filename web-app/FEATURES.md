# Feature migration checklist

“Implemented” describes code paths in this development build, not blanket device
certification. Android currently has no music source engine. Every online source
depends on upstream availability, as it does in Musify.

| Musify capability | Grove web/desktop status | Remaining work |
| --- | --- | --- |
| Online search | Implemented using upstream Dart extractor; live response verified | Suggestions UI, pagination, Android engine |
| Streaming | Real ranged audio data verified through local bridge | Full playback soak tests, expiring URL retry, Android engine |
| Local offline listening | Import, store, replay, and persistence tested | Storage lifecycle, large-library testing, native files |
| Download online audio | Implemented to IndexedDB | End-to-end downloaded playback verification, progress/cancel, native downloads |
| Playlists | Create, rename, play, add/remove tracks, delete | Folder hierarchy, sorting, playlist artwork editing |
| Playlist links | YouTube link/ID import implemented via upstream package | Live playlist acceptance checks, refreshing linked playlists |
| Spotify playlist import | CSV parser and upstream song matching wired | Full import test, missing-song retry UI |
| Radio | All 16 stations copied from upstream build source | Individual station playback checks, custom station editor |
| Favorites | Local and online favorites persist; verified | Favorite radio view |
| Recent listening | History and replay implemented | Remove/clear history controls |
| Queue | Add, play, reorder upward, remove, next/previous | Drag reorder, robust session restore |
| Shuffle / repeat | Implemented; next-index behavior tested | Repeat-one mode and native integration |
| Lyrics | Original Musify lyric service exposed and UI wired | Live provider tests and TV/phone controls |
| SponsorBlock | Original categories queried; skip segments wired | Live skip verification, immediate update when toggled |
| Equalizer | Five Web Audio bands for stored audio | Presets, streamed audio, native parity |
| Sleep timer | Timed pause implemented | End-of-song timer, platform background scheduling |
| Listening recaps | Persistent total listening and track rankings | Original monthly/annual recap logic |
| Backup / restore | Grove metadata JSON export/restore | Audio-inclusive transfer, original Hive migration |
| Artist / album pages | Upstream artist package retained | Web UI and engine endpoints |
| Recommendations | Upstream related-video endpoint available | Ranking, home UI, autoplay |
| Quality / proxy settings | Default highest available audio via original fallback clients | User options and original proxy manager integration |
| Android Auto | Original upstream code preserved | Native bridge and platform testing |
| Background audio / media controls | Browser Media Session wired; Electron throttling disabled | Desktop verification, Android native media service |
| Share / open links | Original source preserved | System intent/deep link handlers |
| Languages | Original 21 language resources preserved | Web localization conversion and language switcher |
| Theme / accent / dynamic colors | Grove responsive dark green theme | Custom accent, light theme, Android dynamic colors |
| Updates | Source/build scripts | Platform update delivery and release signing |
| No ads / subscriptions | Implemented; no ad or subscription code added | None |
| Mac / Linux / Android / TV | Shared web UI, Linux package scaffold, Android/TV APK compiles | Mac build, native Android services, target-device verification |

## Upstream modification

`packages/youtube_explode_dart/lib/src/extensions/helpers_extension.dart`: use
`int.tryParse` for relative upload age, returning no date for nonnumeric live
labels. Previously one such result could fail an entire search page. Regression
checks live in `engine/test/date_parse.dart`.
