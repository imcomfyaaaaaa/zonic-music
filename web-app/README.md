# Zonic application UI

This folder contains Zonic's shared TypeScript interface for the web, Flutter Android shell, Android TV, and Electron desktop app.

## Development

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:4317/`. To test on another device, use the computer's LAN IP and keep both devices on the same Wi-Fi.

## Checks

```bash
npm test
npm run typecheck
npm run build
npm run test:browser
```

## Android

The production Android project is at the repository root. Build the Zonic development APK with:

```bash
npm run android:build
```

Output: `../build/app/outputs/flutter-apk/app-github-debug.apk`.

## Desktop

```bash
npm run engine:build
npm run package:desktop
```

The desktop package is generated under `release/` and is not committed.

## Architecture

- `src/main.tsx` mounts the stable application shell.
- `src/app.js` owns playback and navigation state.
- `src/features.js` implements library, imports, downloads, accounts, and auxiliary screens.
- `src/ui/` contains TSX-rendered interface sections.
- `engine/` exposes the shared source engine to the web and desktop builds.
- `desktop/` contains the Electron host.

The interface and brand are Zonic. The native playback foundation is derived from an upstream GPLv3 project; required attribution and copyright notices remain in the root license and relevant source files.
