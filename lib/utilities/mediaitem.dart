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

import 'package:audio_service/audio_service.dart';
import 'package:musify/services/common_services.dart';
import 'package:musify/utilities/media_duration.dart';

Map mediaItemToMap(MediaItem mediaItem) {
  final extras = mediaItem.extras;
  return {
    'id': mediaItem.id,
    'ytid': extras?['ytid'],
    'album': mediaItem.album.toString(),
    'artist': mediaItem.artist.toString(),
    'title': mediaItem.title,
    'artistId': extras?['artistId'],
    'videoAuthor': extras?['videoAuthor'],
    'highResImage': extras?['highResImage'] ?? mediaItem.artUri.toString(),
    'lowResImage': extras?['lowResImage'],
    'isLive': extras?['isLive'] ?? false,
    if (mediaItem.duration case final duration?) 'duration': duration.inSeconds,
  };
}

MediaItem mapToMediaItem(Map song) {
  final ytid = song['ytid']?.toString();
  final offlineSong = ytid != null
      ? getOfflineSongByYtid(ytid)
      : <String, dynamic>{};
  final isOffline = offlineSong.isNotEmpty;

  Uri? artUri;
  if (isOffline && offlineSong['artworkPath'] != null) {
    final filePath = offlineSong['artworkPath'].toString().trim();
    if (filePath.isNotEmpty) artUri = Uri.file(filePath);
  }
  if (artUri == null) {
    for (final value in [
      song['image'],
      song['artwork'],
      song['highResImage'],
      song['lowResImage'],
    ]) {
      var candidate = value?.toString().trim() ?? '';
      if (candidate.isEmpty || candidate == 'null') continue;
      // YouTube's maxresdefault image is absent for many songs. hqdefault is
      // consistently available and prevents blank Android media cards.
      candidate = candidate.replaceFirst('/maxresdefault.jpg', '/hqdefault.jpg');
      final parsed = Uri.tryParse(candidate);
      if (parsed != null && ['https', 'http', 'file'].contains(parsed.scheme)) {
        artUri = parsed;
        break;
      }
    }
  }

  return MediaItem(
    id: song['id'].toString(),
    album: song['album']?.toString(),
    artist: song['artist']?.toString().trim() ?? 'Unknown artist',
    title: song['title']?.toString().trim().isNotEmpty == true
        ? song['title'].toString().trim()
        : 'Unknown song',
    artUri: artUri,
    duration: readMediaDuration(song['duration']),
    extras: {
      'lowResImage': song['lowResImage'],
      'ytid': song['ytid'],
      'artistId': song['artistId'],
      'videoAuthor': song['videoAuthor'],
      'isLive': song['isLive'],
      'highResImage': song['highResImage'],
      'artWorkPath':
          (isOffline ? offlineSong['artworkPath'] : song['highResImage'])
              ?.toString() ??
          '',
    },
  );
}

/// Compares two Duration objects with tolerance for minor differences.
///
/// This prevents unnecessary updates when duration values have minor variations
/// (e.g., due to buffering or precision differences).
bool durationEquals(Duration? prev, Duration? curr) {
  if (prev == curr) return true;
  if (prev == null || curr == null) return prev == curr;

  // Consider durations equal if they differ by less than 1 second
  return (prev - curr).abs() < const Duration(seconds: 1);
}
