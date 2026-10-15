# Grove

A new music app with one HTML/CSS/JavaScript interface, based on Musify.
This is an initial development build, **not yet full Musify feature parity**.

Original source: https://github.com/gokadzev/Musify
Starting commit: `9ddeeb113a5c022660a698c4ced9e4683a1b72a9`.
The upstream Flutter app remains intact; new application code lives in `web-app/`.
Musify's original copyrights and GPL license remain in place.

## Run

```sh
cd /home/dominic/Documents/GitHub/musify-web-app/web-app
npm install
npm run dev
```

Open http://127.0.0.1:4317. Local files and radio work without the Dart engine.
The source engine requires Dart 3.13 or later:

```sh
cd engine
dart pub get
mkdir -p build
dart compile exe bin/server.dart -o build/grove-engine
```

The current machine has Dart at `/home/dominic/.local/share/grove/dart-sdk/bin/dart`.
The server starts the compiled engine automatically, or uses Dart when the binary
is missing. Set `GROVE_DART` to a different Dart executable if necessary.
The local server and engine listen only on loopback. No hosted service or account
is created. Remote source requests use Musify's vendored extraction packages.

## Desktop

```sh
node node_modules/electron/install.js
npm run desktop
npm run package:linux
```

Linux test executable: `release/Grove-linux-x64/grove`.
This build contains a Linux x64 compiled source engine. Mac builds need a source
engine compiled on macOS for the target architecture and desktop release packaging.
Mac packaging/signing and playback have not been verified.
The source tree runs under Electron on supported desktop platforms; this is not
a claim that every target platform has passed release testing.

## Android and Android TV

```sh
cd ..
flutter build apk --debug --target lib/grove_main.dart
```

The Grove Flutter shell hosts the shared web UI with Musify's native audio
service, background playback, downloads, and source engine. The manifest
supports phone and TV launchers without requiring a touchscreen. Android TV
switches to the directional focus layout automatically. In TV Settings, Grove
shows a local network remote address and pairing code. Open that address in a
phone browser on the same network, or use Settings → Connect to TV in the Grove
Android phone app. Enter the code, then control playback,
volume, seeking, and the queue. The TV retries remote startup if it launches
before joining the network. Physical TV and phone device testing remains
necessary before a release.

## Data

Imported audio files are stored in IndexedDB in browsers, or in native storage
in the Flutter Android shell and desktop app. Library metadata is independent
between devices.
There is no cloud sync. JSON backup exports metadata only; local/downloaded audio
must be reimported or redownloaded on another device. Backups are validated before
replacing metadata. Original Musify Hive backups are not supported yet.

## Verification

```sh
npm test
npm run test:browser
cd engine
dart run test/date_parse.dart
dart analyze bin/server.dart
```

Browser tests cover local audio import, persistent playback, pause/seek, playlists,
favorites, TV focus, phone layout, backup validation, source errors, and real
YouTube search plus HTTP range streaming. Live source tests require network access
and may fail if the upstream service changes or blocks the request.

See [FEATURES.md](FEATURES.md) for the migration checklist.

## License

Grove derives from Musify and is distributed under GPLv3 or later. See the root
`LICENSE` and retain upstream source, copyright notices, and dependency licenses
when distributing a derivative. New source and modifications are available in
this checkout. Public distribution requires providing corresponding source.

### Smart Shuffle and on-device AI

Smart Shuffle preserves the playlist and blends queue-only recommendations at about one per three playlist tracks. Candidates come from related-song results for up to four diverse playlist seeds. Local tracks with artist/title metadata can be matched to source tracks. Recently heard songs, duplicates, live streams and long-form results are filtered. Disabling Smart Shuffle removes unplayed recommendations; offline mode adds none.

The default optional AI ranker uses Transformers.js 3.8.1 (Apache-2.0, bundled license) and quantized `Xenova/all-MiniLM-L6-v2` text embeddings. The quantized model, tokenizer and WebAssembly runtime are bundled under `vendor/ai` (about 46 MB uncompressed) and copied into every app build; inference runs in a single-threaded WebAssembly worker on the user's device. Titles and artists are embedded locally, not sent to an AI inference service. Music discovery still contacts the music source. This estimates similarity from metadata, not acoustic mood, tempo or genre classification. The model is general-purpose text AI, not a music audio model. Remote model loading and model browser caching are disabled; inference reads packaged assets. Builds verify SHA-256 hashes from the pinned asset manifest. `npm run ai:bundle` restores missing assets from the pinned sources during development.

Settings → Smart Shuffle can disable local AI. Unsupported devices, inference errors and timeouts fall back to related-song ranking. Desktop Chrome has passed real inference with all external requests blocked; Android/TV memory, startup cost, and WebView support still require physical-device validation. The inference worker is terminated after ranking or cancellation to release its memory.

### Zonic interface

The shared UI adapts the supplied Zonic prototype: purple/coral ambient glass panels, a floating player, a live desktop queue, responsive music shelves, and mobile Home/Browse/Library tabs. Manrope fonts are bundled with their OFL license. The original supplied prototype is kept in `design-reference/zonic`; its simulated playback and sample library are not used by Grove. Playlist, audio, native playback and bundled AI continue through the existing services.
