/*
 *     Copyright (C) 2026 Valeri Gokadze
 *
 *     Musify is free software: you can redistribute it and/or modify
 *     it under the terms of the GNU General Public License as published by
 *     the Free Software Foundation, either version 3 of the License, or
 *     (at your option) any later version.
 *
 *     Musify is distributed in the hope that it will be useful,
 *     but WITHOUT ANY WARRANTY; without even the implied warranty of
 *     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *     GNU General Public License for more details.
 *
 *     You should have received a copy of the GNU General Public License
 *     along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 *
 *     For more information about Musify, including how to contribute,
 *     please visit: https://github.com/gokadzev/Musify
 */

import 'dart:convert';
import 'dart:io';

import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:material_ui/material_ui.dart';
import 'package:musify/extensions/l10n.dart';
import 'package:musify/main.dart';
import 'package:musify/services/data_manager.dart';
import 'package:musify/services/router_service.dart';
import 'package:musify/services/settings_manager.dart';
import 'package:musify/services/update_installer.dart';
import 'package:musify/utilities/url_launcher.dart';
import 'package:musify/widgets/auto_format_text.dart';
import 'package:package_info_plus/package_info_plus.dart';

const String releasesUrl =
    'https://api.github.com/repos/imcomfyaaaaaa/zonic-music/releases/latest';
const String downloadUrlKey = 'url';
const String downloadUrlArm64Key = 'arm64url';
const String downloadFilename = 'Zonic.apk';

class ZonicRelease {
  const ZonicRelease({
    required this.version,
    required this.pageUrl,
    required this.apkUrl,
    required this.notes,
    this.digest,
  });

  final String version;
  final String pageUrl;
  final String apkUrl;
  final String notes;
  final String? digest;
}

ZonicRelease parseZonicRelease(Map<String, dynamic> data) {
  final tag = data['tag_name']?.toString() ?? '';
  final version = tag.replaceFirst(RegExp('^v', caseSensitive: false), '');
  if (version.isEmpty || !RegExp(r'^\d+(\.\d+)+$').hasMatch(version)) {
    throw const FormatException('GitHub release has no valid version');
  }
  final assets = (data['assets'] as List? ?? const [])
      .whereType<Map>()
      .where(
        (asset) =>
            asset['name']?.toString().toLowerCase().endsWith('.apk') == true,
      )
      .toList();
  final apk = assets.firstWhere(
    (asset) => asset['name'].toString().toLowerCase().contains('arm64'),
    orElse: () => assets.isEmpty ? <String, dynamic>{} : assets.first,
  );
  final pageUrl =
      data['html_url']?.toString() ??
      'https://github.com/imcomfyaaaaaa/zonic-music/releases/tag/$tag';
  return ZonicRelease(
    version: version,
    pageUrl: pageUrl,
    apkUrl: apk['browser_download_url']?.toString() ?? '',
    notes: data['body']?.toString() ?? '',
    digest: apk['digest']?.toString(),
  );
}

ZonicRelease parseZonicReleaseFeed(String feed) {
  final entry = RegExp(r'<entry>([\s\S]*?)</entry>').firstMatch(feed)?.group(1);
  final tag = entry == null
      ? null
      : RegExp(r'<id>[^<]*/(v\d+(?:\.\d+)+)</id>').firstMatch(entry)?.group(1);
  if (tag == null) throw const FormatException('No release in GitHub feed');
  return ZonicRelease(
    version: tag.substring(1),
    pageUrl: 'https://github.com/imcomfyaaaaaa/zonic-music/releases/tag/$tag',
    apkUrl:
        'https://github.com/imcomfyaaaaaa/zonic-music/releases/download/$tag/app-arm64-v8a-github-release.apk',
    notes: '',
  );
}

Future<ZonicRelease> fetchLatestZonicRelease({http.Client? client}) async {
  final ownClient = client == null;
  client ??= http.Client();
  try {
    try {
      final response = await client
          .get(
            Uri.parse(releasesUrl).replace(
              queryParameters: {
                't': '${DateTime.now().millisecondsSinceEpoch}',
              },
            ),
            headers: const {
              'Accept': 'application/vnd.github+json',
              'User-Agent': 'Zonic-Music-Updater',
              'Cache-Control': 'no-cache',
            },
          )
          .timeout(const Duration(seconds: 12));
      if (response.statusCode != 200) {
        throw HttpException('GitHub API returned ${response.statusCode}');
      }
      return parseZonicRelease(
        json.decode(response.body) as Map<String, dynamic>,
      );
    } catch (error) {
      logger.log(
        'GitHub release API unavailable; trying release feed',
        error: error,
      );
      final response = await client
          .get(
            Uri.parse(
              'https://github.com/imcomfyaaaaaa/zonic-music/releases.atom',
            ),
            headers: const {'User-Agent': 'Zonic-Music-Updater'},
          )
          .timeout(const Duration(seconds: 12));
      if (response.statusCode != 200) {
        throw HttpException(
          'GitHub release feed returned ${response.statusCode}',
        );
      }
      return parseZonicReleaseFeed(response.body);
    }
  } finally {
    if (ownClient) client.close();
  }
}

Future<void> checkAppUpdates({
  BuildContext? displayContext,
  bool showNoUpdate = false,
}) async {
  final context = displayContext ?? NavigationManager().context;
  if (showNoUpdate) {
    if (context.mounted) await _showManualUpdateCheck(context);
    return;
  }
  try {
    final release = await fetchLatestZonicRelease();
    final installedVersion = (await PackageInfo.fromPlatform()).version;
    if (!context.mounted) return;
    if (!isLatestVersionHigher(installedVersion, release.version)) {
      return;
    }
    if (release.apkUrl.isEmpty) {
      _showUpdateMessage(
        context,
        'An update was found, but its download is not ready yet.',
        show: true,
      );
      return;
    }

    await showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        final colorScheme = Theme.of(dialogContext).colorScheme;

        return AlertDialog(
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: colorScheme.primaryContainer,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  FluentIcons.arrow_download_24_regular,
                  color: colorScheme.onPrimaryContainer,
                  size: 32,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                dialogContext.l10n?.appUpdateIsAvailable ??
                    'Zonic update available',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w600,
                  color: colorScheme.onSurface,
                ),
              ),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  'V${release.version}',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: colorScheme.onPrimaryContainer,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              if (release.notes.isNotEmpty)
                Container(
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(dialogContext).height / 2.5,
                  ),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: colorScheme.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: SingleChildScrollView(
                    child: AutoFormatText(text: release.notes),
                  ),
                ),
            ],
          ),
          actionsAlignment: MainAxisAlignment.center,
          actions: <Widget>[
            OutlinedButton(
              onPressed: () => Navigator.pop(dialogContext),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: colorScheme.outline),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: Text(dialogContext.l10n?.cancel ?? 'Cancel'),
            ),
            FilledButton.icon(
              onPressed: () {
                Navigator.pop(dialogContext);
                if (Platform.isAndroid) {
                  showZonicUpdateInstaller(
                    context,
                    version: release.version,
                    url: release.apkUrl,
                    digest: release.digest,
                  );
                } else {
                  launchURL(Uri.parse(release.apkUrl));
                }
              },
              icon: const Icon(FluentIcons.arrow_download_20_regular),
              label: Text(
                Platform.isAndroid ? 'Download & install' : 'Download',
              ),
            ),
          ],
        );
      },
    );
  } catch (e, stackTrace) {
    logger.log('Error in checkAppUpdates', error: e, stackTrace: stackTrace);
    _showUpdateMessage(
      context,
      'Could not check for updates: $e',
      show: showNoUpdate,
    );
  }
}

Future<void> _showManualUpdateCheck(BuildContext context) async {
  final check = () async {
    final release = await fetchLatestZonicRelease();
    final installed = (await PackageInfo.fromPlatform()).version;
    return (release: release, installed: installed);
  }();

  await showDialog<void>(
    context: context,
    builder: (dialogContext) => FutureBuilder(
      future: check,
      builder: (dialogContext, snapshot) {
        final result = snapshot.data;
        final error = snapshot.error;
        final hasUpdate =
            result != null &&
            isLatestVersionHigher(result.installed, result.release.version);
        return AlertDialog(
          title: Text(
            error != null
                ? 'Could not check for updates'
                : result == null
                ? 'Checking for updates…'
                : hasUpdate
                ? 'Zonic update available'
                : 'Zonic is up to date',
          ),
          content: error != null
              ? Text(
                  'Could not reach GitHub. Check your connection and try again.\n\n$error',
                )
              : result == null
              ? const Row(
                  children: [
                    CircularProgressIndicator(),
                    SizedBox(width: 20),
                    Expanded(child: Text('Checking GitHub releases…')),
                  ],
                )
              : Text(
                  'Installed: v${result.installed}\n'
                  'Latest on GitHub: v${result.release.version}',
                ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Close'),
            ),
            if (error != null)
              TextButton(
                onPressed: () => launchURL(
                  Uri.parse(
                    'https://github.com/imcomfyaaaaaa/zonic-music/releases/latest',
                  ),
                ),
                child: const Text('Open releases'),
              ),
            if (hasUpdate && result.release.apkUrl.isNotEmpty)
              FilledButton(
                onPressed: () {
                  Navigator.pop(dialogContext);
                  if (Platform.isAndroid) {
                    showZonicUpdateInstaller(
                      context,
                      version: result.release.version,
                      url: result.release.apkUrl,
                      digest: result.release.digest,
                    );
                  } else {
                    launchURL(Uri.parse(result.release.apkUrl));
                  }
                },
                child: const Text('Download & install'),
              ),
            if (hasUpdate && result.release.apkUrl.isEmpty)
              TextButton(
                onPressed: () => launchURL(Uri.parse(result.release.pageUrl)),
                child: const Text('View release'),
              ),
          ],
        );
      },
    ),
  );
}

void _showUpdateMessage(
  BuildContext? context,
  String message, {
  required bool show,
}) {
  if (!show || context == null || !context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}

void showUpdateCheckDialog(BuildContext context) {
  final colorScheme = Theme.of(context).colorScheme;

  showDialog(
    context: context,
    builder: (context) {
      return AlertDialog(
        icon: Icon(
          FluentIcons.arrow_sync_circle_24_regular,
          color: colorScheme.primary,
          size: 40,
        ),
        title: Text(
          context.l10n!.checkForUpdates,
          style: TextStyle(
            color: colorScheme.onSurface,
            fontWeight: FontWeight.w600,
          ),
          textAlign: TextAlign.center,
        ),
        content: Text(
          context.l10n!.enableUpdateChecksDescription,
          style: TextStyle(color: colorScheme.onSurfaceVariant),
          textAlign: TextAlign.center,
        ),
        actionsAlignment: MainAxisAlignment.center,
        actions: [
          OutlinedButton(
            onPressed: () {
              shouldWeCheckUpdates.value = false;
              addOrUpdateData<bool>('settings', 'shouldWeCheckUpdates', false);
              Navigator.of(context).pop();
            },
            style: OutlinedButton.styleFrom(
              side: BorderSide(color: colorScheme.outline),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(context.l10n!.no),
          ),
          FilledButton(
            onPressed: () {
              shouldWeCheckUpdates.value = true;
              addOrUpdateData<bool>('settings', 'shouldWeCheckUpdates', true);
              if (!isFdroidBuild && kReleaseMode && !offlineMode.value) {
                checkAppUpdates();
                isUpdateChecked = true;
              }
              Navigator.of(context).pop();
            },
            child: Text(context.l10n!.yes),
          ),
        ],
      );
    },
  );
}

bool isLatestVersionHigher(String appVersion, String latestVersion) {
  final parsedAppVersion = RegExp(r'\d+')
      .allMatches(appVersion)
      .take(3)
      .map((match) => int.parse(match.group(0)!))
      .toList();
  final parsedAppLatestVersion = RegExp(r'\d+')
      .allMatches(latestVersion)
      .take(3)
      .map((match) => int.parse(match.group(0)!))
      .toList();
  final length = parsedAppVersion.length > parsedAppLatestVersion.length
      ? parsedAppVersion.length
      : parsedAppLatestVersion.length;
  for (var i = 0; i < length; i++) {
    final value1 = i < parsedAppVersion.length ? parsedAppVersion[i] : 0;
    final value2 = i < parsedAppLatestVersion.length
        ? parsedAppLatestVersion[i]
        : 0;
    if (value2 > value1) {
      return true;
    } else if (value2 < value1) {
      return false;
    }
  }

  return false;
}

Future<String> getCPUArchitecture() async {
  final info = await Process.run('uname', ['-m']);
  final cpu = info.stdout.toString().replaceAll('\n', '');

  return cpu;
}

Future<String> getDownloadUrl(Map<String, dynamic> map) async {
  final cpuArchitecture = await getCPUArchitecture();
  final url = cpuArchitecture == 'aarch64'
      ? map[downloadUrlArm64Key].toString()
      : map[downloadUrlKey].toString();

  return url;
}

/// Fetch only the announcement URL from the `check.json` file and set the
/// global `announcementURL` ValueNotifier. This does not trigger releases
/// fetching or any update dialogs/downloads and is safe to call for F‑Droid
/// builds where update prompts are not allowed.
Future<void> fetchAnnouncementOnly() async {
  // Zonic no longer uses a separate announcement file. Releases are checked
  // directly from the project’s GitHub API by checkAppUpdates().
}
