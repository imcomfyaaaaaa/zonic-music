import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import './build.mjs';
const installed = join(homedir(), '.local/share/grove/flutter/bin/flutter');
const flutter = process.env.GROVE_FLUTTER || (existsSync(installed) ? installed : 'flutter');
execFileSync(flutter, ['build', 'apk', '--debug', '--flavor', 'github', '--target', 'lib/grove_main.dart', '--target-platform', 'android-arm,android-arm64,android-x64'], { cwd: new URL('../../', import.meta.url), stdio: 'inherit' });
