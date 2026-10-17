import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:fluentui_system_icons/fluentui_system_icons.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:musify/extensions/l10n.dart';
import 'package:musify/main.dart' show logger;
import 'package:musify/services/artist_service.dart' show ytMusicClient;
import 'package:musify/services/common_services.dart';
import 'package:musify/services/playlists_manager.dart';
import 'package:musify/utilities/flutter_toast.dart';
import 'package:musify/utilities/formatter.dart';
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

  // Limit concurrency and leave a short pause between batches.
  static const _batchSize = 12;
  static const _batchPause = Duration(milliseconds: 150);

  final _csvController = TextEditingController();
  final _playlistNameController = TextEditingController();
  bool _isImporting = false;
  String? _fileName;
  int _processedCount = 0;
  int _totalCount = 0;

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
    final path = file.path;
    if (path == null) return;
    _csvController.text = await File(path).readAsString();
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

    // Key results by their CSV position so retry results remain ordered.
    final foundByIndex = <int, Map>{};
    List<_ImportRow> missingRows;
    var rateLimited = false;
    try {
      final firstPass = await _searchBatch(
        rows,
        onProgress: (n) {
          if (mounted) setState(() => _processedCount += n);
        },
      );
      foundByIndex.addAll(firstPass.found);
      missingRows = firstPass.missing;
      rateLimited = firstPass.rateLimited;

      // Retry misses once, unless the service is actively rate-limiting us.
      if (!rateLimited && missingRows.isNotEmpty) {
        // Include the retry work in the progress total.
        if (mounted) setState(() => _totalCount += missingRows.length);
        final retryPass = await _searchBatch(
          missingRows,
          onProgress: (n) {
            if (mounted) setState(() => _processedCount += n);
          },
        );
        foundByIndex.addAll(retryPass.found);
        missingRows = retryPass.missing;
        rateLimited = retryPass.rateLimited;
      }
    } finally {
      _importRunning = false;
    }

    final foundSongs = [
      for (final row in rows)
        if (foundByIndex[row.index] case final song?)
          Map<String, dynamic>.from(song)
            ..['spotifyTitle'] = row.title
            ..['spotifyArtist'] = row.artist,
    ];

    if (!mounted) return;
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
      final (_, playlistId) = createCustomPlaylist(playlistName, null, context);
      addSongsInCustomPlaylist(context, playlistId, foundSongs);
    }
    setState(() => _isImporting = false);

    final resultText =
        likedResult ??
        (rateLimited
            ? '${context.l10n!.spotifyPlaylistImportFailed}\n${context.l10n!.spotifyPlaylistImportResult(foundSongs.length, rows.length)}'
            : context.l10n!.spotifyPlaylistImportResult(
                foundSongs.length,
                rows.length,
              ));
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
  }

  /// Resolves [rows] in batches and stops when rate limiting is detected.
  /// Results are keyed by the rows' original positions for retry merging.
  Future<({Map<int, Map> found, List<_ImportRow> missing, bool rateLimited})>
  _searchBatch(
    List<_ImportRow> rows, {
    required void Function(int processedCount) onProgress,
  }) async {
    final found = <int, Map>{};
    final missing = <_ImportRow>[];
    for (var i = 0; i < rows.length; i += _batchSize) {
      final batch = rows.skip(i).take(_batchSize).toList();
      final batchResults = await Future.wait(
        batch.map((row) async {
          final (match, wasRateLimited) = await _findSongWithRetry(
            '${row.title} ${row.artist}',
            expectedArtist: row.artist,
            expectedTitle: row.title,
          );
          return (row, match, wasRateLimited);
        }),
      );
      var batchRateLimited = false;
      for (final (row, match, wasRateLimited) in batchResults) {
        if (wasRateLimited) batchRateLimited = true;
        if (match == null) {
          missing.add(row);
        } else {
          found[row.index] = match;
        }
      }
      onProgress(batchResults.length);
      if (batchRateLimited) {
        missing.addAll(rows.skip(i + _batchSize));
        return (found: found, missing: missing, rateLimited: true);
      }
      await Future.delayed(_batchPause);
    }
    return (found: found, missing: missing, rateLimited: false);
  }

  /// Returns the best match for [query], or `null` if none was found.
  /// The second value is `true` when YouTube is actively rate-limiting this
  /// device, so the caller can stop the whole import instead of retrying
  /// every remaining song for minutes on end.
  Future<(Map<String, dynamic>?, bool)> _findSongWithRetry(
    String query, {
    String? expectedArtist,
    String? expectedTitle,
  }) async {
    const maxAttempts = 2;
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        final video = await ytMusicClient.music.searchSong(
          query,
          expectedArtist: expectedArtist,
          expectedTitle: expectedTitle,
        );
        if (video == null) return (null, false);
        return (Map<String, dynamic>.from(returnSongLayout(0, video)), false);
      } on RequestLimitExceededException {
        // A single short retry for a transient hiccup; a second hit means
        // it's a genuine, sustained block.
        if (attempt == maxAttempts - 1) return (null, true);
        await Future.delayed(const Duration(seconds: 2));
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
      } else if (character == ',' && !quoted) {
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
              TextField(
                controller: _csvController,
                enabled: !_isImporting,
                minLines: 5,
                maxLines: 10,
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
