import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:musify/extensions/l10n.dart';
import 'package:musify/main.dart' show logger;
import 'package:musify/services/artist_service.dart' show ytMusicClient;
import 'package:musify/services/common_services.dart';
import 'package:musify/services/data_manager.dart';
import 'package:musify/services/playlists_manager.dart';
import 'package:musify/utilities/flutter_toast.dart';
import 'package:musify/utilities/formatter.dart';
import 'package:musify/utilities/playlist_utils.dart';
import 'package:musify/utilities/url_launcher.dart';
import 'package:musify/widgets/mini_player.dart';
import 'package:youtube_explode_dart/youtube_explode_dart.dart';

/// A CSV row and its original position, used to preserve playlist order.
typedef _ImportRow = ({int index, String title, String artist});

class ImportSpotifyPlaylistPage extends StatefulWidget {
  const ImportSpotifyPlaylistPage({super.key});

  @override
  State<ImportSpotifyPlaylistPage> createState() =>
      _ImportSpotifyPlaylistPageState();
}

class _ImportSpotifyPlaylistPageState extends State<ImportSpotifyPlaylistPage> {
  // Shared across page instances so navigating away and reopening the page
  // can't spawn a second import running concurrently with the first.
  static bool _importRunning = false;

  // Keep several searches in flight without waiting for a slow request to
  // finish before starting the next one.
  static const _parallelSearches = 8;
  static const _searchTimeout = Duration(seconds: 12);
  static const _rateLimitPause = Duration(seconds: 4);
  static const _platform = MethodChannel('grove/platform');

  final _csvController = TextEditingController();
  final _playlistNameController = TextEditingController();
  bool _isImporting = false;
  String? _fileName;
  int _processedCount = 0;
  int _totalCount = 0;
  DateTime _lastNotificationUpdate = DateTime.fromMillisecondsSinceEpoch(0);

  Future<bool> _backgroundImport(String action) async {
    try {
      await _platform.invokeMethod<void>('spotifyImportForeground', {
        'action': action,
        'processed': _processedCount,
        'total': _totalCount,
      });
      return true;
    } catch (error, stackTrace) {
      logger.log(
        'Could not update Spotify import notification',
        error: error,
        stackTrace: stackTrace,
      );
      return !Platform.isAndroid;
    }
  }

  void _updateProgress(int amount) {
    _processedCount += amount;
    if (mounted) setState(() {});
    final now = DateTime.now();
    if (_processedCount >= _totalCount ||
        now.difference(_lastNotificationUpdate) >= const Duration(seconds: 1)) {
      _lastNotificationUpdate = now;
      unawaited(_backgroundImport('update'));
    }
  }

  @override
  void dispose() {
    _csvController.dispose();
    _playlistNameController.dispose();
    super.dispose();
  }

  Future<void> _chooseFile() async {
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['csv'],
    );
    if (result.isEmpty || !mounted) return;

    final file = result.single;
    // The Android Storage Access Framework gives us a content URI, not always
    // a normal disk path. PlatformFile reads either kind safely.
    final contents = utf8.decode(
      await file.readAsBytes(),
      allowMalformed: true,
    );
    if (contents.trim().isEmpty) {
      if (mounted) {
        showToast(context, 'Could not read that CSV file. Please try again.');
      }
      return;
    }
    _csvController.text = contents;
    if (!mounted) return;
    setState(() {
      _fileName = file.name;
      // A CSV export normally carries the playlist name. Make that useful
      // immediately instead of leaving a blank, confusing form behind it.
      if (_playlistNameController.text.trim().isEmpty) {
        final baseName = file.name.replaceFirst(RegExp(r'\.[^.]+$'), '');
        _playlistNameController.text = _titleFromFileName(baseName);
      }
    });
  }

  String _titleFromFileName(String value) => value
      .replaceAll(RegExp(r'[_-]+'), ' ')
      .trim()
      .split(RegExp(r'\s+'))
      .where((word) => word.isNotEmpty)
      .map((word) => '${word[0].toUpperCase()}${word.substring(1)}')
      .join(' ');

  Future<void> _importPlaylist() async {
    if (_isImporting) return;
    if (_importRunning) {
      showToast(context, context.l10n!.spotifyPlaylistAlreadyImporting);
      return;
    }
    final playlistName = _playlistNameController.text.trim();
    if (playlistName.isEmpty) {
      showToast(context, context.l10n!.enterPlaylistName);
      return;
    }
    final records = _parseCsv(_csvController.text);
    if (records.length < 2) {
      showToast(context, context.l10n!.spotifyPlaylistEmpty);
      return;
    }

    final headers = records.first
        .map((header) => header.replaceFirst('\ufeff', '').trim().toLowerCase())
        .toList();
    bool isNameColumn(String header) =>
        !header.contains('id') &&
        !header.contains('uri') &&
        !header.contains('url') &&
        !header.contains('genre');
    final songIndex = headers.indexWhere(
      (header) =>
          (header.contains('song') || header.contains('track')) &&
          isNameColumn(header),
    );
    final artistIndex = headers.indexWhere(
      (header) => header.contains('artist') && isNameColumn(header),
    );
    if (songIndex == -1 || artistIndex == -1) {
      showToast(context, context.l10n!.spotifyPlaylistInvalid);
      return;
    }

    final songs = records.skip(1).where((row) {
      return row.length > songIndex &&
          row.length > artistIndex &&
          row[songIndex].trim().isNotEmpty;
    }).toList();
    if (songs.isEmpty) {
      showToast(context, context.l10n!.spotifyPlaylistEmpty);
      return;
    }

    final rows = songs.indexed
        .map(
          (entry) => (
            index: entry.$1,
            title: entry.$2[songIndex].trim(),
            artist: entry.$2[artistIndex].trim(),
          ),
        )
        .toList();

    _importRunning = true;
    setState(() {
      _isImporting = true;
      _processedCount = 0;
      _totalCount = rows.length;
    });
    // This foreground notification lets a large, user-started import keep
    // running when the user switches apps or turns the screen off.
    // Request notification access before starting the foreground service, then
    // wait until it is running before doing network work. This is important on
    // Samsung/Android builds that aggressively pause background apps.
    try {
      await _platform.invokeMethod<void>('requestNotifications');
    } catch (_) {}
    await _backgroundImport('start');

    // Key results by their CSV position so retry results remain ordered.
    final foundByIndex = <int, Map>{};
    List<_ImportRow> missingRows = [];
    try {
      final firstPass = await _searchBatch(rows, onProgress: _updateProgress);
      foundByIndex.addAll(firstPass.found);
      missingRows = firstPass.missing;

      final foundSongs = [
        for (final row in rows)
          if (foundByIndex[row.index] case final song?)
            Map<String, dynamic>.from(song)
              ..['spotifyTitle'] = row.title
              ..['spotifyArtist'] = row.artist,
      ];

      final normalizedName = playlistName.toLowerCase().replaceAll(
        RegExp(r'[^a-z0-9]'),
        '',
      );
      final isLikedSongsImport = const {
        'liked',
        'likedsongs',
        'spotifyliked',
        'spotifylikedsongs',
      }.contains(normalizedName);
      String? likedResult;
      if (isLikedSongsImport) {
        final merged = await mergeSpotifyLikedSongs(foundSongs);
        likedResult =
            'Updated Liked Songs: ${merged.added} added, ${merged.updated} refreshed.';
      } else {
        // Do not leave an empty playlist behind if YouTube could not resolve a
        // single CSV entry (for example while offline or rate-limited).
        if (foundSongs.isEmpty) {
          if (mounted) {
            showToast(
              context,
              'No songs could be matched. Check your connection and try again.',
            );
          }
          return;
        }
        final playlist = <String, dynamic>{
          'ytid': PlaylistUtils.generateCustomPlaylistId(),
          'title': playlistName,
          'source': 'user-created',
          'list': foundSongs,
          'createdAt': DateTime.now().millisecondsSinceEpoch,
        };
        userCustomPlaylists.value = [...userCustomPlaylists.value, playlist];
        await addOrUpdateData<List>(
          'user',
          'customPlaylists',
          userCustomPlaylists.value,
        );
      }
      if (!mounted) return;
      setState(() => _isImporting = false);

      final resultText =
          likedResult ??
          context.l10n!.spotifyPlaylistImportResult(
            foundSongs.length,
            rows.length,
          );
      if (missingRows.isNotEmpty) {
        final missingText = missingRows
            .map((row) => '${row.title} - ${row.artist}')
            .join('\n');
        await Clipboard.setData(ClipboardData(text: missingText));
        if (mounted) {
          showToastWithButton(
            context,
            '$resultText\n${context.l10n!.spotifyPlaylistMissingSongs}',
            context.l10n!.copy,
            () => Clipboard.setData(ClipboardData(text: missingText)),
            duration: const Duration(seconds: 8),
            icon: FluentIcons.warning_24_regular,
          );
        }
      } else {
        showToast(context, resultText);
      }
    } finally {
      _importRunning = false;
      if (mounted) setState(() => _isImporting = false);
      await _backgroundImport('stop');
    }
  }

  /// Keep workers busy independently so one slow lookup cannot stall a batch.
  Future<({Map<int, Map> found, List<_ImportRow> missing, bool rateLimited})>
  _searchBatch(
    List<_ImportRow> rows, {
    required void Function(int processedCount) onProgress,
  }) async {
    final found = <int, Map>{};
    final missing = <_ImportRow>[];
    var nextIndex = 0;
    Future<void> worker() async {
      while (nextIndex < rows.length) {
        final row = rows[nextIndex++];
        final (match, wasRateLimited) = await _findSongWithRetry(
          '${row.title} ${row.artist}',
          expectedArtist: row.artist,
          expectedTitle: row.title,
        );
        if (match == null) {
          missing.add(row);
        } else {
          found[row.index] = match;
        }
        onProgress(1);
        if (wasRateLimited) await Future.delayed(_rateLimitPause);
      }
    }

    await Future.wait(List.generate(_parallelSearches, (_) => worker()));
    return (found: found, missing: missing, rateLimited: false);
  }

  /// Returns the best match for [query], or `null` if none was found.
  /// The second value reports that YouTube throttled this lookup, allowing the
  /// batch runner to slow down while preserving the rest of the import.
  Future<(Map<String, dynamic>?, bool)> _findSongWithRetry(
    String query, {
    String? expectedArtist,
    String? expectedTitle,
  }) async {
    const maxAttempts = 2;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        final video = await ytMusicClient.music
            .searchSong(
              query,
              expectedArtist: expectedArtist,
              expectedTitle: expectedTitle,
            )
            .timeout(_searchTimeout);
        if (video == null) return (null, false);
        return (Map<String, dynamic>.from(returnSongLayout(0, video)), false);
      } on RequestLimitExceededException {
        // Back off progressively. This makes importing a thousand-song CSV
        // reliable instead of terminating it after one short burst.
        if (attempt == maxAttempts - 1) return (null, true);
        await Future.delayed(Duration(seconds: 1 << attempt));
      } catch (e, stackTrace) {
        if (attempt == maxAttempts - 1) {
          logger.log(
            'Error searching Spotify import match for "$query"',
            error: e,
            stackTrace: stackTrace,
          );
          return (null, false);
        }
        await Future.delayed(Duration(milliseconds: 500 * (attempt + 1)));
      }
    }
    return (null, false);
  }

  List<List<String>> _parseCsv(String input) {
    final firstLine = input
        .replaceFirst('\ufeff', '')
        .split(RegExp(r'\r?\n'))
        .firstWhere((line) => line.trim().isNotEmpty, orElse: () => '');
    // Exportify and Chosic use commas, but Excel often saves CSV as
    // semicolon-separated in regional settings. Tab-delimited exports are
    // accepted too.
    final commaCount = ','.allMatches(firstLine).length;
    final semicolonCount = ';'.allMatches(firstLine).length;
    final delimiter = semicolonCount > commaCount
        ? ';'
        : firstLine.contains('\t') && commaCount == 0
        ? '\t'
        : ',';
    final rows = <List<String>>[];
    var row = <String>[];
    var field = StringBuffer();
    var quoted = false;

    for (var index = 0; index < input.length; index++) {
      final character = input[index];
      if (character == '"') {
        if (quoted && index + 1 < input.length && input[index + 1] == '"') {
          field.write('"');
          index++;
        } else {
          quoted = !quoted;
        }
      } else if (character == delimiter && !quoted) {
        row.add(field.toString());
        field = StringBuffer();
      } else if ((character == '\n' || character == '\r') && !quoted) {
        if (character == '\r' &&
            index + 1 < input.length &&
            input[index + 1] == '\n') {
          index++;
        }
        row.add(field.toString());
        field = StringBuffer();
        if (row.any((value) => value.trim().isNotEmpty)) rows.add(row);
        row = <String>[];
      } else {
        field.write(character);
      }
    }
    if (field.isNotEmpty || row.isNotEmpty) {
      row.add(field.toString());
      if (row.any((value) => value.trim().isNotEmpty)) rows.add(row);
    }
    return rows;
  }

  @override
  Widget build(BuildContext context) {
    const zonicTheme = ColorScheme.dark(
      primary: Color(0xff9d8cff),
      secondary: Color(0xffff6680),
      surface: Color(0xff19181f),
    );
    return Theme(
      data: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: zonicTheme,
        scaffoldBackgroundColor: const Color(0xff09090b),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xff09090b),
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xff211f27),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 14,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
        ),
      ),
      child: Scaffold(
        appBar: AppBar(title: Text(context.l10n!.importSpotifyPlaylistTitle)),
        body: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xff211f27),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xff3a3742)),
                ),
                child: Text(
                  context.l10n!.importSpotifyPlaylistInstructions,
                  style: const TextStyle(color: Color(0xffddd8e7), height: 1.4),
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: () => launchURL(
                  Uri.parse(
                    'https://www.chosic.com/spotify-playlist-exporter/',
                  ),
                ),
                icon: const Icon(FluentIcons.open_24_regular),
                label: Text(context.l10n!.openChosicExporter),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _isImporting ? null : _chooseFile,
                icon: const Icon(FluentIcons.document_add_24_regular),
                label: Text(_fileName ?? context.l10n!.chooseCsvFile),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _playlistNameController,
                enabled: !_isImporting,
                decoration: InputDecoration(
                  labelText: '${context.l10n!.playlistName} *',
                  hintText: context.l10n!.spotifyPlaylistNameHint,
                  filled: true,
                  fillColor: const Color(0xff211f27),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              if (_fileName == null)
                SizedBox(
                  height: 190,
                  child: TextField(
                    controller: _csvController,
                    enabled: !_isImporting,
                    expands: true,
                    minLines: null,
                    maxLines: null,
                    textAlignVertical: TextAlignVertical.top,
                    decoration: InputDecoration(
                      labelText: context.l10n!.pasteCsv,
                      hintText: context.l10n!.spotifyCsvHint,
                      alignLabelWithHint: true,
                      filled: true,
                      fillColor: const Color(0xff211f27),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                )
              else
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xff211f27),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: const Color(0xff3a3742)),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        FluentIcons.document_checkmark_24_regular,
                        color: Color(0xff9d8cff),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _fileName!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              '${(_parseCsv(_csvController.text).length - 1).clamp(0, 999999)} songs ready to import',
                              style: const TextStyle(color: Color(0xffb5b0bf)),
                            ),
                          ],
                        ),
                      ),
                      TextButton(
                        onPressed: _isImporting ? null : _chooseFile,
                        child: const Text('Change'),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _isImporting ? null : _importPlaylist,
                icon: _isImporting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(FluentIcons.arrow_upload_24_regular),
                label: Text(
                  _isImporting
                      ? context.l10n!.spotifyPlaylistImporting
                      : context.l10n!.importPlaylist,
                ),
              ),
              if (_isImporting && _totalCount > 0) ...[
                const SizedBox(height: 12),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: _processedCount / _totalCount,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  context.l10n!.spotifyPlaylistProgress(
                    _processedCount,
                    _totalCount,
                  ),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              const SizedBox(height: MiniPlayer.playerHeight + 24),
            ],
          ),
        ),
      ),
    );
  }
}
