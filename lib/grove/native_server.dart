import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'package:audio_service/audio_service.dart';
import 'package:flutter/services.dart';
import 'package:hive/hive.dart';
import 'package:musify/main.dart' as musify;
import 'package:musify/services/audio_service.dart' show MusifyAudioHandler;
import 'package:musify/services/common_services.dart';
import 'package:musify/services/io_service.dart';
import 'package:musify/services/listening_stats_service.dart';
import 'package:musify/services/playlists_manager.dart';
import 'package:musify/services/playlist_download_service.dart';
import 'package:musify/services/proxy_manager.dart';
import 'package:musify/services/settings_manager.dart';
import 'package:grove_source_engine/grove_source_engine.dart' as sources;
import 'package:url_launcher/url_launcher.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';
import 'package:file_picker/file_picker.dart';
import 'package:share_plus/share_plus.dart';
import 'package:musify/grove/tv_remote_server.dart';

class GroveNativeServer {
  GroveNativeServer(this.server, this.token, this.platform);
  final HttpServer server;
  final String token;
  final Map platform;
  final Map<String, Map<String, dynamic>> downloads = {};
  final List<String> intents = [];
  final List<StreamSubscription<dynamic>> subscriptions = [];
  GroveTvRemoteServer? tvRemote;
  DateTime? lastRemoteAttempt;
  bool startingRemote = false;
  MusifyAudioHandler get h => musify.audioHandler;
  String get origin => 'http://127.0.0.1:${server.port}';
  Uri get entry => Uri.parse('$origin/?native=1&tv=${platform['tv'] == true ? 1 : 0}&token=$token');
  static Future<GroveNativeServer> start() async {
    sources.files.root = Directory('$applicationDirPath/grove-files');
    await sources.files.root.create(recursive: true);
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 4367);
    Map platform = {};
    try { platform = await const MethodChannel('grove/platform').invokeMapMethod<String, dynamic>('info') ?? {}; } catch (_) {}
    final token = base64Url.encode(List.generate(32, (_) => Random.secure().nextInt(256)));
    final app = GroveNativeServer(server, token, platform);
    await app.ensureTvRemote();
    void receive(String? value) { if (value != null && value.isNotEmpty && !app.intents.contains(value)) app.intents.add(value); }
    try { app.subscriptions.add(musify.appLinks.uriLinkStream.listen((uri) => receive(uri.toString()), onError: (_) {})); unawaited(musify.appLinks.getInitialLink().then((uri) => receive(uri?.toString())).catchError((_) {})); } catch (_) {}
    try { app.subscriptions.add(ReceiveSharingIntent.getTextStream().listen(receive, onError: (_) {})); unawaited(ReceiveSharingIntent.getInitialText().then(receive).catchError((_) {})); } catch (_) {}
    server.listen((req) => unawaited(app.handle(req)));
    return app;
  }
  Future<void> ensureTvRemote() async {
    if (platform['tv'] != true || tvRemote != null || startingRemote) return;
    final now = DateTime.now();
    if (lastRemoteAttempt != null && now.difference(lastRemoteAttempt!).inSeconds < 30) return;
    lastRemoteAttempt = now;
    startingRemote = true;
    try {
        tvRemote = await GroveTvRemoteServer.start(() => Map<String, dynamic>.from(state()), (command, data) async {
          switch (command) {
            case 'play': await h.play(); break;
            case 'pause': await h.pause(); break;
            case 'next': await h.skipToNext(); break;
            case 'previous': await h.skipToPrevious(); break;
            case 'queue-play':
              final index = data['index'];
              if (index is! int || index < 0 || index >= h.browserQueue.length) throw const FormatException('Invalid queue position');
              await h.skipToQueueItem(index); break;
            case 'seek':
              final seconds = data['seconds'];
              final duration = h.audioPlayer.duration;
              if (seconds is! num || !seconds.isFinite || seconds < 0 || duration == null || seconds > duration.inMilliseconds / 1000) throw const FormatException('Invalid seek position');
              await h.seek(Duration(milliseconds: (seconds * 1000).round())); break;
            case 'volume':
              final volume = data['volume'];
              if (volume is! num || !volume.isFinite || volume < 0 || volume > 1) throw const FormatException('Invalid volume');
              await h.audioPlayer.setVolume(volume.toDouble()); break;
          }
        });
    } catch (_) { /* Retry after network connectivity changes. */ }
    finally { startingRemote = false; }
  }
  void json(HttpRequest req, Object? data) { req.response.headers.contentType = ContentType.json; req.response.write(jsonEncode(data, toEncodable: (v) => v is DateTime ? v.toIso8601String() : v is Duration ? v.inSeconds : v.toString())); }
  String filePath(String id) {
    if (id.isEmpty || id.length > 200) throw const FormatException('Invalid track ID');
    return sources.files.file(id).path;
  }
  Map<String, dynamic> song(Map t) => {
    'id': t['id'], 'ytid': t['ytid'] ?? t['id'], 'title': t['title'], 'artist': t['artist'],
    'highResImage': t['artwork'] ?? '', 'lowResImage': t['artwork'] ?? '', 'duration': t['duration'],
    'artistId': t['artistId'], 'videoAuthor': t['videoAuthor'], 'isLive': t['kind'] == 'radio' || t['isLive'] == true,
    if (t['kind'] == 'local') 'audioPath': filePath(t['id'].toString()),
    if (t['kind'] == 'url' && t['downloaded'] == true) 'audioPath': filePath(t['id'].toString()),
    if (t['kind'] == 'radio' || t['kind'] == 'url') 'directUrl': t['url'],
    'groveTrack': Map<String, dynamic>.from(t),
  };
  Map state() {
    final h = musify.audioHandler, player = h.audioPlayer;
    return {'paused': !player.playing || player.processingState.name == 'completed', 'position': player.position.inMilliseconds / 1000, 'duration': player.duration?.inMilliseconds == null ? null : player.duration!.inMilliseconds / 1000, 'volume': player.volume, 'readyState': player.processingState.name == 'ready' ? 4 : 2, 'index': h.currentQueueIndex, 'track': h.currentSong == null ? null : webSong(h.currentSong!), 'queue': h.browserQueue.map(webSong).toList(), 'error': h.lastError, 'platform': {...platform, if (tvRemote != null) 'remote': {'url': tvRemote!.url, 'pin': tvRemote!.pin}}, 'downloads': downloads, 'intentCount': intents.length};
  }
  Map webSong(Map s) => s['groveTrack'] is Map ? s['groveTrack'] as Map : {'id': 'yt:${s['ytid']}', 'ytid': s['ytid'], 'title': s['title'], 'artist': s['artist'], 'artistId': s['artistId'], 'artwork': s['highResImage'] ?? s['image'], 'kind': 'youtube', 'duration': s['duration']};
  Future<Map> body(HttpRequest req) async {
    final builder = BytesBuilder();
    await for (final chunk in req) { builder.add(chunk); if (builder.length > 20 * 1024 * 1024) throw const FormatException('Request too large'); }
    return jsonDecode(utf8.decode(builder.takeBytes())) as Map;
  }
  Future<void> syncLibrary(Map data) async {
    final tracks = (data['tracks'] as List).whereType<Map>().toList();
    final byId = {for (final t in tracks) t['id']: t};
    final liked = (data['liked'] as List? ?? []).where(byId.containsKey).map((id) => song(byId[id]!)).toList();
    final playlists = (data['playlists'] as List).whereType<Map>().map((p) => {'ytid': p['id'], 'title': p['name'], 'image': p['artwork'] ?? '', 'list': (p['tracks'] as List).where(byId.containsKey).map((id) => song(byId[id]!)).toList(), 'isCustom': true}).toList();
    final box = Hive.box('user');
    await box.put('groveLibrary', data);
    await box.put('likedSongs', liked); userLikedSongsList.value = liked;
    await box.put('customPlaylists', playlists); userCustomPlaylists.value = List<Map>.from(playlists);
    final folders = (data['folders'] as List? ?? []).whereType<Map>().map((f) => {'id': f['id'], 'name': f['name'], 'playlists': playlists.where((p) => (data['playlists'] as List).any((x) => x['id'] == p['ytid'] && x['folderId'] == f['id'])).toList()}).toList();
    await box.put('playlistFolders', folders); userPlaylistFolders.value = List<Map>.from(folders);
    final pinned = (data['playlists'] as List).whereType<Map>().where((p) => p['pinned'] == true).map((p) => p['id'].toString()).toList();
    await box.put('pinnedPlaylistIds', pinned); pinnedPlaylistIds.value = pinned;
    final artists = (data['artistFavorites'] as List? ?? []).whereType<Map>().map((a) => {'ytid': a['id'], 'title': a['name'], 'image': a['artwork'], 'type': 'artist', 'isArtist': true, 'list': <Map>[]}).toList();
    await box.put('likedPlaylists', artists); userLikedPlaylists.value = List<Map>.from(artists);
    final likedRadio = tracks.where((t) => t['kind'] == 'radio' && (data['liked'] as List).contains(t['id'])).map((t) => t['id'].toString()).toList();
    await box.put('likedRadioStations', likedRadio); userLikedRadioStations.value = likedRadio;
    final stored = List<Map>.from(userOfflineSongs.value.whereType<Map>());
    for (final t in tracks.where((t) => t['kind'] == 'local' || t['downloaded'] == true)) {
      final path = t['kind'] == 'local' || t['kind'] == 'url' ? filePath(t['id'].toString()) : FilePaths.getAudioPath(t['ytid'].toString());
      if (!await File(path).exists()) continue;
      final item = {...song(t), 'audioPath': path};
      final i = stored.indexWhere((s) => s['ytid'] == item['ytid']);
      if (i < 0) stored.add(item); else stored[i] = item;
    }
    userOfflineSongs.value = stored; await Hive.box('userNoBackup').put('offlineSongs', stored);
    final offline = OfflinePlaylistService();
    for (final playlist in playlists) { offline.checkAndAutoMarkOffline(playlist); }
    final playlistIds = playlists.map((p) => p['ytid']).toSet();
    offline.offlinePlaylists.value = offline.offlinePlaylists.value.where((p) => playlistIds.contains(p['ytid'])).toList();
    await Hive.box('userNoBackup').put('offlinePlaylists', offline.offlinePlaylists.value);
  }
  Future<void> settings(Map s) async {
    sponsorBlockSupport.value = s['sponsorBlock'] == true;
    offlineMode.value = s['offline'] == true;
    playNextSongAutomatically.value = s['autoplay'] == true;
    audioQualitySetting.value = ['low', 'medium', 'high'].contains(s['quality']) ? s['quality'] : 'high';
    useProxy.value = s['proxy'] == true;
    await Hive.box('settings').putAll({'sponsorBlockSupport': sponsorBlockSupport.value, 'offlineMode': offlineMode.value, 'playNextSongAutomatically': playNextSongAutomatically.value, 'audioQuality': audioQualitySetting.value, 'useProxy': useProxy.value});
    final h = musify.audioHandler;
    await h.setShuffleMode(s['shuffle'] == true && s['smartShuffle'] != true ? AudioServiceShuffleMode.all : AudioServiceShuffleMode.none);
    await h.setRepeatMode(s['repeatOne'] == true ? AudioServiceRepeatMode.one : s['repeat'] == true ? AudioServiceRepeatMode.all : AudioServiceRepeatMode.none);
    await h.setEqualizerEnabled(s['eqEnabled'] == true);
    final gains = s['eq'] as List? ?? [];
    for (var i = 0; i < gains.length; i++) { if (gains[i] is num) await h.setEqualizerBandGain(i, (gains[i] as num).toDouble()); }
  }
  Future<void> handle(HttpRequest req) async {
    try {
      if (req.headers.value('host') != '127.0.0.1:${server.port}') { req.response.statusCode = 403; return; }
      final originHeader = req.headers.value('origin');
      if (originHeader != null && originHeader != origin) { req.response.statusCode = 403; return; }
      if (req.uri.path == '/' && req.uri.queryParameters['token'] == token) {
        req.response.cookies.add(Cookie('grove-session', token)..httpOnly = true..sameSite = SameSite.strict..path = '/');
      } else if (!req.cookies.any((c) => c.name == 'grove-session' && c.value == token)) { req.response.statusCode = 403; return; }
      if (req.uri.path.startsWith('/api/')) { sources.yt = ytClient; await sources.handle(req, trustedLocalApp: true); return; }
      if (req.uri.path.startsWith('/native/')) {
        final command = req.uri.path.substring(8);
        switch (command) {
          case 'state': await ensureTvRemote(); json(req, state()); break;
          case 'intents': final pending = List<String>.from(intents); intents.clear(); json(req, pending); break;
          case 'library':
            if (req.method == 'POST') { await syncLibrary(await body(req)); json(req, {'ok': true}); }
            else {
              final saved = Hive.box('user').get('groveLibrary');
              if (saved is Map) { final tracks = List<Map>.from((saved['tracks'] as List).whereType<Map>()); for (final song in userOfflineSongs.value.whereType<Map>()) { final path = song['audioPath']; if (path is! String || !await File(path).exists()) continue; final track = {...webSong(song), 'downloaded': true}; final i = tracks.indexWhere((t) => t['id'] == track['id']); if (i < 0) tracks.add(track); else tracks[i]['downloaded'] = true; } json(req, {...saved, 'tracks': tracks}); } else json(req, saved);
            } break;
          case 'play':
            try { await const MethodChannel('grove/platform').invokeMethod('requestNotifications'); } catch (_) {}
            final data = await body(req), list = (data['queue'] as List).whereType<Map>().map(song).toList();
            await settings(data['settings'] as Map? ?? {});
            await h.addPlaylistToQueue(list, replace: true, startIndex: (data['index'] as num).toInt());
            await settings(data['settings'] as Map? ?? {});
            if (h.lastError != null) throw StateError(h.lastError!);
            json(req, state()); break;
          case 'resume': if (h.audioPlayer.processingState.name == 'completed') await h.playAgain(); else unawaited(h.play()); json(req, {'ok': true}); break;
          case 'pause': await h.pause(); json(req, {'ok': true}); break;
          case 'next': await h.skipToNext(); json(req, state()); break;
          case 'previous': await h.skipToPrevious(); json(req, state()); break;
          case 'queue-add': final data = await body(req); await h.addToQueue(song(data['track'] as Map), playNext: data['next'] == true); json(req, state()); break;
          case 'queue-move': final data = await body(req); await h.reorderQueue((data['from'] as num).toInt(), (data['to'] as num).toInt()); json(req, state()); break;
          case 'queue-remove': final data = await body(req); await h.removeFromQueue((data['index'] as num).toInt()); json(req, state()); break;
          case 'queue-clear': await h.clearGroveQueue(); json(req, state()); break;
          case 'restore-library':
            await h.clearGroveQueue(); await listeningStatsService.flush();
            final data = await body(req); await syncLibrary(data);
            final byId = {for (final t in (data['tracks'] as List).whereType<Map>()) t['id']: t};
            final now = DateTime.now(), key = '${DateTime.now().year}-${DateTime.now().month.toString().padLeft(2, '0')}';
            final months = <String, Map>{};
            for (final entry in (data['months'] as Map? ?? {}).entries) {
              final month = entry.value as Map, songs = <String, Map>{};
              for (final value in (month['songs'] as Map? ?? {}).entries) { final t = byId[value.key]; if (t == null) continue; final s = song(t); songs[s['ytid'].toString()] = {...s, 'seconds': (value.value['seconds'] as num? ?? 0).round(), 'playCount': (value.value['plays'] as num? ?? 0).round()}; }
              months[entry.key.toString()] = {'totalSeconds': (month['totalSeconds'] as num? ?? 0).round(), 'songs': songs};
            }
            await Hive.box('user').put('wrappedListeningStats', {'schemaVersion': 2, 'year': now.year, 'currentMonthKey': key, 'currentMonth': months.remove(key) ?? {'totalSeconds': 0, 'songs': <String, Map>{}}, 'history': months});
            listeningStatsService.reloadFromStorage(); json(req, {'ok': true}); break;
          case 'seek': final data = await body(req); await h.seek(Duration(milliseconds: ((data['seconds'] as num) * 1000).round())); json(req, state()); break;
          case 'volume': final data = await body(req); await h.audioPlayer.setVolume((data['volume'] as num).toDouble().clamp(0, 1)); json(req, {'ok': true}); break;
          case 'settings': await settings(await body(req)); json(req, {'ok': true}); break;
          case 'sleep': final data = await body(req); if (data['endOfSong'] == true) { await h.setSleepTimerEndOfSong(); } else if ((data['minutes'] as num) > 0) { await h.setSleepTimer(Duration(minutes: (data['minutes'] as num).toInt())); } else { h.cancelSleepTimer(); } json(req, {'ok': true}); break;
          case 'download':
            final data = await body(req), id = data['id'].toString();
            final status = downloads[id] = {'received': 0, 'total': 0, 'cancelled': false};
            try {
              if (data['kind'] == 'url') { sources.files.jobs[id] = status..addAll({'id': id, 'status': 'active'}); await sources.files.download(data, status, (id, quality) async => throw UnsupportedError('Direct audio only'), (_) => 'DIRECT'); if (status['status'] != 'complete') throw StateError(status['error'].toString()); }
              else if (!await makeSongOffline(song(data), isCancelled: () => status['cancelled'] == true, onProgress: (received, total) { status['received'] = received; status['total'] = total; })) throw StateError(status['cancelled'] == true ? 'Download cancelled' : 'Download failed');
              json(req, {'ok': true});
            } finally { downloads.remove(id); }
            break;
          case 'cancel-downloads': for (final job in downloads.values) { job['cancelled'] = true; } json(req, {'ok': true}); break;
          case 'remove-download': final data = await body(req); if (data['ytid'] != null) await removeSongFromOffline(data['ytid']); else { final file = File(filePath(data['id'].toString())); if (await file.exists()) await file.delete(); } json(req, {'ok': true}); break;
          case 'clear-stats': await listeningStatsService.clearStats(); json(req, {'ok': true}); break;
          case 'open-url': final data = await body(req); final uri = Uri.parse(data['url'].toString()); if (uri.scheme != 'https') throw const FormatException('HTTPS URL required'); await launchUrl(uri, mode: LaunchMode.externalApplication); json(req, {'ok': true}); break;
          case 'share': final data = await body(req); await SharePlus.instance.share(ShareParams(text: data['text'].toString())); json(req, {'ok': true}); break;
          case 'export':
            final name = (req.uri.queryParameters['name'] ?? 'grove-backup.json').replaceAll(RegExp(r'[^\w. -]'), '_');
            final builder = BytesBuilder(); await for (final chunk in req) { builder.add(chunk); if (builder.length > 270 * 1024 * 1024) throw const FormatException('Export is too large'); }
            final bytes = builder.takeBytes();
            try { final uri = await FilePicker.saveFile(fileName: name, bytes: bytes); json(req, {'ok': uri != null, 'cancelled': uri == null}); }
            catch (_) { final temp = File('$applicationDirPath/grove-export.tmp'); await temp.writeAsBytes(bytes); try { final location = await const MethodChannel('grove/platform').invokeMethod('exportToDownloads', {'path': temp.path, 'name': name}); json(req, {'ok': true, 'location': location}); } finally { if (await temp.exists()) await temp.delete(); } }
            break;
          case 'file':
            final id = req.uri.queryParameters['id'] ?? '';
            final file = File(id.startsWith('yt:') && RegExp(r'^[\w-]{11}$').hasMatch(id.substring(3)) ? FilePaths.getAudioPath(id.substring(3)) : filePath(id));
            if (req.method == 'POST') { final sink = file.openWrite(); await sink.addStream(req); await sink.close(); json(req, {'ok': true}); }
            else { req.response.headers.contentType = ContentType('audio', 'mpeg'); await req.response.addStream(file.openRead()); } break;
          case 'recap':
            listeningStatsService.recordListeningSessionProgress(wasPlaying: h.audioPlayer.playing); await listeningStatsService.flush();
            json(req, {'months': listeningStatsService.availableMonthKeys, 'year': listeningStatsService.year, 'yearSeconds': listeningStatsService.yearTotalSeconds, 'yearSongs': listeningStatsService.yearTopSongs(), 'monthly': {for (final key in listeningStatsService.availableMonthKeys) key: listeningStatsService.monthStats(key)}}); break;
          default: req.response.statusCode = 404;
        }
        return;
      }
      final path = req.uri.path == '/' ? '/index.html' : req.uri.path;
      if (path.contains('..') || path.contains('\\')) { req.response.statusCode = 403; return; }
      final data = await rootBundle.load('web-app/dist$path');
      final type = (path.endsWith('.js') || path.endsWith('.mjs')) ? 'text/javascript' : path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.onnx') ? 'application/octet-stream' : path.endsWith('.css') ? 'text/css' : path.endsWith('.ttf') ? 'font/ttf' : path.endsWith('.json') ? 'application/json' : 'text/html';
      req.response.headers.set('Content-Type', type); req.response.add(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes));
    } catch (e) { req.response.statusCode = 400; json(req, {'error': e.toString()}); }
    finally { try { await req.response.close(); } catch (_) {} }
  }
}
