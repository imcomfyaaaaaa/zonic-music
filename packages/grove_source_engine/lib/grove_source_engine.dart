// Grove source bridge, GPL-3.0-or-later. Uses the unmodified Musify packages.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:hive/hive.dart';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import 'package:youtube_explode_dart/youtube_explode_dart.dart';
import 'package:youtube_music_explode_dart/youtube_music_explode_dart.dart';

import 'src/clients.dart';
import 'src/lyrics_manager.dart';
import 'src/formatter.dart';
import 'src/files.dart';
import 'src/hls.dart';
import 'src/radio_browser.dart';

YoutubeExplode yt = YoutubeExplode();
YoutubeMusicExplode music = YoutubeMusicExplode();
Uri? proxy;
void configureProxy(String? url) {
  final next = url == null || url.isEmpty ? null : Uri.parse(url);
  if (next != null &&
      (!['http', 'https'].contains(next.scheme) ||
          next.host.isEmpty ||
          next.userInfo.isNotEmpty))
    throw const FormatException('Invalid HTTP proxy URL');
  if (proxy == next) return;
  proxy = next;
  HttpClient client() => HttpClient()
    ..findProxy = (_) => proxy == null
        ? 'DIRECT'
        : 'PROXY ${proxy!.host}:${proxy!.hasPort ? proxy!.port : 8080}';
  yt = YoutubeExplode(httpClient: YoutubeHttpClient(IOClient(client())));
  music = YoutubeMusicExplode(
    httpClient: YoutubeHttpClient(IOClient(client())),
  );
  manifests.clear();
}

void clearCaches() {
  manifests.clear();
  live.clear();
}

final manifests = <String, ({AudioOnlyStreamInfo stream, DateTime expires})>{};
final files = GroveFiles();
final live = HlsRelay();
Map<String, Object?> track(Video video) => {
  ...returnSongLayout(0, video),
  'id': 'yt:${video.id.value}',
  'ytid': video.id.value,
  'artwork': video.thumbnails.mediumResUrl,
  'kind': 'youtube',
  'duration': video.duration?.inSeconds,
  'artistId': video.channelId.value,
};
bool isSong(Video video) {
  final seconds = video.duration?.inSeconds;
  if (video.isLive || seconds != null && (seconds < 45 || seconds > 900))
    return false;
  if (RegExp(
    r'\b(?:sound effects?|sound ideas|sound library|white noise|asmr)\b',
    caseSensitive: false,
  ).hasMatch('${video.title} ${video.author}'))
    return false;
  return !RegExp(
    r'\b(?:\d+\s*(?:hours?|hrs?)|podcast|audiobook|interview|reaction|tutorial|full\s+album|playlist|compilation|live\s+(?:stream|radio)|official\s+(?:music\s+)?video|music\s+video|video\s+clip|behind\s+the\s+scenes|dance\s+video|choreograph(?:y|ed)|visuali[sz]er)\b|(?:^|[\s[(])m\/?v(?:[\s\])]|$)',
    caseSensitive: false,
  ).hasMatch(video.title);
}

bool isVideoFirst(Video video) => RegExp(
  r'\b(?:official\s+(?:music\s+)?video|music\s+video|video\s+clip|behind\s+the\s+scenes|dance\s+video|choreograph(?:y|ed)|visuali[sz]er)\b|(?:^|[\s[(])m\/?v(?:[\s\])]|$)',
  caseSensitive: false,
).hasMatch(video.title);
String songTitle(Video video) => video.title
    .replaceAll(
      RegExp(
        r'[\s\-–—]*(?:\(|\[)?(?:official\s+)?(?:music\s+)?video(?:\s+clip)?(?:\)|\])?',
        caseSensitive: false,
      ),
      '',
    )
    .replaceAll(
      RegExp(
        r'[\s\-–—]*(?:\(|\[)?(?:official\s+)?visuali[sz]er(?:\)|\])?',
        caseSensitive: false,
      ),
      '',
    )
    .replaceAll(
      RegExp(r'[\s\-–—]*(?:\(|\[)?m\/?v(?:\)|\])?', caseSensitive: false),
      '',
    )
    .trim();
String songArtist(Video video) => video.author
    .replaceFirst(RegExp(r'\s*-\s*Topic$', caseSensitive: false), '')
    .replaceFirst(RegExp(r'VEVO$', caseSensitive: false), '')
    .trim();
Future<Video?> canonicalSong(Video video) async {
  if (!isVideoFirst(video)) return isSong(video) ? video : null;
  final replacement = await music.music
      .searchSong(
        '${songArtist(video)} ${songTitle(video)}',
        expectedArtist: songArtist(video),
        expectedTitle: songTitle(video),
      )
      .timeout(const Duration(seconds: 30));
  return replacement != null && isSong(replacement) ? replacement : null;
}

String param(HttpRequest request, String name) =>
    request.uri.queryParameters[name] ?? '';
void json(HttpRequest req, Object? value, {int status = 200}) {
  req.response.statusCode = status;
  req.response.headers.contentType = ContentType.json;
  req.response.write(
    jsonEncode(
      value,
      toEncodable: (v) => v is DateTime ? v.toIso8601String() : v.toString(),
    ),
  );
}

Future<AudioOnlyStreamInfo> resolveStream(
  String id, {
  String quality = 'high',
}) async {
  if (!RegExp(r'^[a-zA-Z0-9_-]{11}$').hasMatch(id))
    throw FormatException('Invalid video ID');
  final key = '$id:$quality';
  final cached = manifests[key];
  if (cached != null && cached.expires.isAfter(DateTime.now()))
    return cached.stream;
  final manifest = await getManifestWithFallback(
    yt,
    id,
    timeout: const Duration(seconds: 25),
  );
  final compatible =
      manifest.audioOnly
          .where(
            (s) =>
                !RegExp(r'ac-3|ec-3|dolby')
                    .hasMatch(s.codec.toString().toLowerCase()),
          )
          .toList()
        ..sort((a, b) => b.bitrate.compareTo(a.bitrate));
  final stream = quality == 'low'
      ? compatible.last
      : quality == 'medium'
      ? compatible[(compatible.length - 1) ~/ 2]
      : compatible.first;
  if (manifests.length > 200) manifests.clear();
  manifests[key] = (
    stream: stream,
    expires: DateTime.now().add(const Duration(minutes: 20)),
  );
  return stream;
}

Future<void> handle(HttpRequest req, {bool trustedLocalApp = false}) async {
  if (!trustedLocalApp &&
      req.headers.value('host') !=
          '127.0.0.1:${req.connectionInfo?.localPort}') {
    req.response.statusCode = 403;
    await req.response.close();
    return;
  }
  final requestOrigin = req.headers.value('origin');
  if (requestOrigin != null && !trustedLocalApp) {
    json(req, {'error': 'Use the Grove application bridge.'}, status: 403);
    await req.response.close();
    return;
  }
  final path = req.uri.path.replaceFirst(RegExp(r'^/api'), '');
  const postPaths = {
    '/import-backup',
    '/configure',
    '/cache-clear',
    '/file',
    '/download',
    '/remove-file',
    '/cancel-downloads',
    '/expand-playlist',
  };
  if (req.method != 'GET' &&
      req.method != 'HEAD' &&
      !(req.method == 'POST' && postPaths.contains(path))) {
    req.response.statusCode = 405;
    await req.response.close();
    return;
  }
  try {
    switch (path) {
      case '/health':
        json(req, {
          'ready': true,
          'engine': 'Musify Dart packages',
          'fileStorage': true,
        });
        break;
      case '/radio-browser':
        json(
          req,
          await searchRadioBrowser(
            query: param(req, 'q'),
            genre: param(req, 'genre'),
          ),
        );
        break;
      case '/radio-click':
        await countRadioBrowserClick(param(req, 'id'));
        json(req, {'ok': true});
        break;
      case '/file':
      case '/download':
      case '/downloads':
      case '/remove-file':
      case '/cancel-downloads':
        await files.handle(
          req,
          path.substring(1),
          (id, quality) async {
            final stream = await resolveStream(id, quality: quality);
            return (url: stream.url, headers: streamPlaybackHeaders(id));
          },
          (_) => proxy == null
              ? 'DIRECT'
              : 'PROXY ${proxy!.host}:${proxy!.hasPort ? proxy!.port : 8080}',
        );
        break;
      case '/configure':
        final data = jsonDecode(await utf8.decoder.bind(req).join()) as Map;
        configureProxy(
          data['proxy'] == true ? data['proxyUrl']?.toString() : null,
        );
        json(req, {'ok': true});
        break;
      case '/cache-clear':
        clearCaches();
        json(req, {'ok': true});
        break;
      case '/video':
        final video = await yt.videos.get(param(req, 'id'));
        final song = await canonicalSong(video);
        if (song == null)
          throw const FormatException(
            'This link is a video, not a song release',
          );
        json(req, track(song));
        break;
      case '/expand-playlist':
        final data = jsonDecode(await utf8.decoder.bind(req).join()) as Map;
        final ids = (data['list'] as List)
            .whereType<String>()
            .where((id) => RegExp(r'^[\w-]{11}$').hasMatch(id))
            .take(5000)
            .toList();
        final songs = <Map<String, Object?>>[];
        for (var i = 0; i < ids.length; i += 8) {
          final batch = await Future.wait(
            ids.skip(i).take(8).map((id) async {
              try {
                final song = await canonicalSong(await yt.videos.get(id));
                return song == null ? null : track(song);
              } catch (_) {
                return null;
              }
            }),
          );
          songs.addAll(batch.whereType<Map<String, Object?>>());
        }
        json(req, {
          'name': data['title'],
          'artwork': data['image'],
          'tracks': songs,
          'missing': ids.length - songs.length,
        });
        break;
      case '/search':
        final q = param(req, 'q');
        if (q.trim().isEmpty || q.length > 300)
          throw FormatException('Enter a search query');
        final page = int.tryParse(param(req, 'page')) ?? 0;
        if (page < 0 || page > 20)
          throw const FormatException('Invalid result page');
        // The dedicated YouTube Music Songs shelf excludes videos, podcasts,
        // and other general YouTube results. It currently exposes one page.
        if (page > 0) {
          json(req, []);
          break;
        }
        json(
          req,
          (await music.music
                  .searchSongs(q)
                  .timeout(const Duration(seconds: 30)))
              .where(isSong)
              .map(track)
              .toList(),
        );
        break;
      case '/suggestions':
        final q = param(req, 'q').trim();
        if (q.length < 2 || q.length > 300) {
          json(req, []);
          break;
        }
        final songs =
            (await music.music
                    .searchSongs(q)
                    .timeout(const Duration(seconds: 30)))
                .where(isSong)
                .take(8)
                .map(track);
        final suggestions = <String>[];
        for (final song in songs) {
          final title = song['title']?.toString().trim() ?? '';
          final artist = song['artist']?.toString().trim() ?? '';
          final value = artist.isEmpty ? title : '$title — $artist';
          if (value.isNotEmpty && !suggestions.contains(value))
            suggestions.add(value);
        }
        json(req, suggestions);
        break;
      case '/artists':
        json(
          req,
          (await music.music.searchArtists(param(req, 'q')))
              .map(
                (a) => {'id': a.id, 'name': a.name, 'artwork': a.thumbnailUrl},
              )
              .toList(),
        );
        break;
      case '/artist':
        final a = await music.music.getArtistProfile(param(req, 'id'));
        json(req, {
          'id': a.id,
          'name': a.name,
          'artwork': a.thumbnailUrl,
          'description': a.description,
          'listeners': a.monthlyListeners,
          'tracks': a.topSongs.map((s) => track(s.video)).toList(),
          'releases': a.releases
              .map(
                (r) => {
                  'id': r.id,
                  'name': r.title,
                  'artwork': r.thumbnailUrl,
                  'type': r.type.name,
                  'year': r.year,
                },
              )
              .toList(),
          'related': a.relatedArtists
              .map(
                (r) => {'id': r.id, 'name': r.name, 'artwork': r.thumbnailUrl},
              )
              .toList(),
        });
        break;
      case '/album':
        final a = await music.music.getAlbum(param(req, 'id'));
        json(req, {
          'id': a.id,
          'name': a.title,
          'artist': a.artist,
          'artistId': a.artistId,
          'artwork': a.thumbnailUrl,
          'year': a.year,
          'tracks': a.tracks.map(track).toList(),
        });
        break;
      case '/match':
        final video = await music.music
            .searchSong(
              param(req, 'q'),
              expectedArtist: param(req, 'artist'),
              expectedTitle: param(req, 'title'),
            )
            .timeout(const Duration(seconds: 30));
        json(req, video == null ? null : track(video));
        break;
      case '/playlist':
        final id = PlaylistId(param(req, 'id'));
        final playlist = await yt.playlists
            .get(id)
            .timeout(const Duration(seconds: 30));
        final videos = await yt.playlists
            .getVideos(id)
            .take(5000)
            .toList()
            .timeout(const Duration(seconds: 90));
        final tracks = <Map<String, Object?>>[];
        for (var i = 0; i < videos.length; i += 8) {
          final batch = await Future.wait(
            videos.skip(i).take(8).map((video) async {
              try {
                final song = await canonicalSong(video);
                return song == null ? null : track(song);
              } catch (_) {
                return null;
              }
            }),
          );
          tracks.addAll(batch.whereType<Map<String, Object?>>());
        }
        json(req, {
          'name': playlist.title,
          'artwork': playlist.thumbnails.maxResUrl,
          'tracks': tracks,
          'source': playlist.url,
        });
        break;
      case '/related':
        final id = param(req, 'id');
        if (!RegExp(r'^[\w-]{11}$').hasMatch(id))
          throw const FormatException('Invalid video ID');
        var artist = param(req, 'artist').trim();
        var title = param(req, 'title').trim();
        if (artist.length > 200 || title.length > 300)
          throw const FormatException('Invalid song metadata');
        if (artist.isEmpty && title.isEmpty) {
          final video = await yt.videos
              .get(id)
              .timeout(const Duration(seconds: 20));
          artist = video.author
              .replaceFirst(RegExp(r'\s*-\s*Topic$', caseSensitive: false), '')
              .replaceFirst(RegExp(r'VEVO$', caseSensitive: false), '')
              .trim();
          title = video.title;
        }
        json(
          req,
          (await music.music
                  .searchSongs(artist.isEmpty ? title : artist)
                  .timeout(const Duration(seconds: 30)))
              .where((song) => song.id.value != id && isSong(song))
              .map(track)
              .toList(),
        );
        break;
      case '/lyrics':
        json(req, {
          'lyrics': await LyricsManager().fetchLyrics(
            param(req, 'artist'),
            param(req, 'title'),
          ),
        });
        break;
      case '/import-backup':
        final bytes = BytesBuilder();
        await for (final chunk in req) {
          bytes.add(chunk);
          if (bytes.length > 20 * 1024 * 1024)
            throw const FormatException('Backup is too large');
        }
        final dir = await Directory.systemTemp.createTemp('grove-backup-');
        final boxName = 'groveimport${DateTime.now().microsecondsSinceEpoch}';
        try {
          final box = await Hive.openBox(
            boxName,
            path: dir.path,
            bytes: bytes.takeBytes(),
          );
          try {
            json(req, box.toMap().map((k, v) => MapEntry(k.toString(), v)));
          } finally {
            await box.close();
          }
        } finally {
          await dir.delete(recursive: true);
        }
        break;
      case '/segments':
        final uri = Uri.https('sponsor.ajay.app', '/api/skipSegments', {
          'videoID': param(req, 'id'),
          'categories': '["sponsor","selfpromo","interaction","intro","outro","music_offtopic"]',
        });
        final result = await http.get(uri).timeout(const Duration(seconds: 10));
        json(req, result.statusCode == 200 ? jsonDecode(result.body) : []);
        break;
      case '/hls':
        await live.relay(
          req,
          live.lookup(param(req, 'token')),
          (_) => proxy == null
              ? 'DIRECT'
              : 'PROXY ${proxy!.host}:${proxy!.hasPort ? proxy!.port : 8080}',
        );
        break;
      case '/stream':
        final id = param(req, 'id');
        if (param(req, 'live') == '1') {
          final url = await yt.videos.streamsClient.getHttpLiveStreamUrl(
            VideoId(id),
          );
          await live.relay(
            req,
            Uri.parse(url),
            (_) => proxy == null
                ? 'DIRECT'
                : 'PROXY ${proxy!.host}:${proxy!.hasPort ? proxy!.port : 8080}',
          );
          break;
        }
        final quality = param(req, 'quality').isEmpty
            ? 'high'
            : param(req, 'quality');
        var stream = await resolveStream(id, quality: quality);
        final client = HttpClient()
          ..findProxy = (_) => proxy == null
              ? 'DIRECT'
              : 'PROXY ${proxy!.host}:${proxy!.hasPort ? proxy!.port : 8080}';
        try {
          final range = req.headers.value('range');
          Future<HttpClientResponse> fetchStream() async {
            final request = await client
                .getUrl(stream.url)
                .timeout(const Duration(seconds: 20));
            streamPlaybackHeaders(id).forEach(request.headers.set);
            if (range != null && RegExp(r'^bytes=\d*-\d*$').hasMatch(range))
              request.headers.set('range', range);
            return request.close().timeout(const Duration(seconds: 30));
          }

          var upstream = await fetchStream();
          if (upstream.statusCode == 403 || upstream.statusCode == 410) {
            await upstream.drain();
            manifests.remove('$id:$quality');
            stream = await resolveStream(id, quality: quality);
            upstream = await fetchStream();
          }
          req.response.statusCode = upstream.statusCode;
          for (final header in [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
          ]) {
            final value = upstream.headers.value(header);
            if (value != null) req.response.headers.set(header, value);
          }
          if (upstream.statusCode >= 400) manifests.remove('$id:$quality');
          if (req.method != 'HEAD') await req.response.addStream(upstream);
        } finally {
          client.close(force: true);
        }
        break;
      default:
        json(req, {'error': 'Unknown engine endpoint'}, status: 404);
    }
  } catch (e) {
    // Source failures are explicit; never manufacture tracks or playable URLs.
    try {
      json(req, {'error': 'Music source request failed: $e'}, status: 502);
    } catch (_) {}
  } finally {
    try {
      await req.response.close();
    } catch (_) {}
  }
}

Future<void> main() async {
  final server = await HttpServer.bind(
    InternetAddress.loopbackIPv4,
    int.parse(Platform.environment['GROVE_ENGINE_PORT'] ?? '4318'),
  );
  print('Grove music engine listening on ${server.port}');
  await for (final request in server) {
    unawaited(handle(request));
  }
}
