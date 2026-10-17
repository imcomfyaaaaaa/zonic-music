import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/services.dart';
import 'package:musify/services/settings_manager.dart';

typedef TvState = Map<String, dynamic> Function();
typedef TvCommand = Future<void> Function(String command, Map<String, dynamic> data);

/// A small, paired LAN remote. The full library and source API remain on loopback.
class GroveTvRemoteServer {
  GroveTvRemoteServer._(this.server, this.addresses, this.pin, this.state, this.command);
  final HttpServer server;
  final List<String> addresses;
  String pin;
  final TvState state;
  final TvCommand command;
  final Map<String, DateTime> sessions = {};
  final Map<String, List<DateTime>> failures = {};
  String get url => 'http://${addresses.first}:${server.port}/';

  static Future<GroveTvRemoteServer?> start(TvState state, TvCommand command) async {
    final interfaces = await NetworkInterface.list(type: InternetAddressType.IPv4);
    final addresses = interfaces.expand((i) => i.addresses).where((a) => !a.isLoopback && _privateAddress(a.address)).map((a) => a.address).toSet().toList();
    if (addresses.isEmpty) return null;
    final server = await HttpServer.bind(InternetAddress.anyIPv4, 0);
    final random = Random.secure();
    final remote = GroveTvRemoteServer._(server, addresses, (random.nextInt(90000) + 10000).toString(), state, command);
    server.listen((request) => unawaited(remote.handle(request)));
    return remote;
  }

  void setPin(String value) {
    if (!RegExp(r'^\d{5}$').hasMatch(value)) throw const FormatException('Pairing code must be five digits');
    if (pin == value) return;
    pin = value;
    sessions.clear();
    failures.clear();
  }

  static bool _privateAddress(String ip) {
    final parts = ip.split('.').map(int.tryParse).toList();
    if (parts.length != 4 || parts.any((p) => p == null || p < 0 || p > 255)) return false;
    return parts[0] == 10 || parts[0] == 192 && parts[1] == 168 || parts[0] == 172 && parts[1]! >= 16 && parts[1]! <= 31;
  }

  bool get _shuffle {
    try {
      return shuffleNotifier.value;
    } catch (_) {
      return false;
    }
  }

  String get _repeat {
    try {
      return repeatNotifier.value.name;
    } catch (_) {
      return 'none';
    }
  }

  bool _sameOrigin(HttpRequest request) {
    final host = request.headers.value('host');
    final expected = 'http://$host';
    return addresses.any((ip) => host == '$ip:${server.port}') &&
        (request.headers.value('origin') == null || request.headers.value('origin') == expected);
  }

  void _json(HttpRequest request, int status, Object value) {
    request.response.statusCode = status;
    request.response.headers.contentType = ContentType.json;
    request.response.write(jsonEncode(value));
  }

  Future<Map<String, dynamic>> _body(HttpRequest request) async {
    final bytes = <int>[];
    await for (final chunk in request) {
      bytes.addAll(chunk);
      if (bytes.length > 4096) throw const FormatException('Request too large');
    }
    final value = jsonDecode(utf8.decode(bytes));
    if (value is! Map<String, dynamic>) throw const FormatException('Invalid request');
    return value;
  }

  Future<void> handle(HttpRequest request) async {
    try {
      request.response.headers.set('Cache-Control', 'no-store');
      request.response.headers.set('X-Content-Type-Options', 'nosniff');
      request.response.headers.set('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'");
      if (!_sameOrigin(request) || !_privateAddress(request.connectionInfo?.remoteAddress.address ?? '')) {
        _json(request, 403, {'error': 'Local network access only'});
        return;
      }
      final path = request.uri.path;
      if (request.method == 'GET' && (path == '/' || path == '/remote.js' || path == '/remote.css')) {
        final asset = path == '/' ? 'tv-remote.html' : path.substring(1);
        final bytes = await rootBundle.load('web-app/dist/src/$asset');
        request.response.headers.contentType = path == '/' ? ContentType.html : path.endsWith('.js') ? ContentType('text', 'javascript') : ContentType('text', 'css');
        request.response.add(bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes));
        return;
      }
      if (request.method == 'POST' && path == '/pair') {
        final ip = request.connectionInfo!.remoteAddress.address;
        final now = DateTime.now();
        final attempts = failures.putIfAbsent(ip, () => [])..removeWhere((time) => now.difference(time).inMinutes >= 10);
        if (attempts.length >= 5) { _json(request, 429, {'error': 'Too many attempts. Try again in 10 minutes.'}); return; }
        final body = await _body(request);
        if (body['pin']?.toString() != pin) { attempts.add(now); _json(request, 401, {'error': 'Incorrect pairing code'}); return; }
        attempts.clear();
        final random = Random.secure();
        final token = base64UrlEncode(List.generate(32, (_) => random.nextInt(256)));
        sessions[token] = now.add(const Duration(days: 30));
        _json(request, 200, {'token': token});
        return;
      }
      final token = request.headers.value('authorization');
      final expires = token != null && token.startsWith('Bearer ') ? sessions[token.substring(7)] : null;
      if (expires == null || DateTime.now().isAfter(expires)) { _json(request, 401, {'error': 'Pair with the TV to continue'}); return; }
      if (request.method == 'GET' && path == '/state') {
        final value = state();
        Map<String, dynamic>? visibleTrack(Object? track) {
          if (track is! Map) return null;
          return {'title': track['title']?.toString() ?? '', 'artist': track['artist']?.toString() ?? '', 'artwork': track['artwork']?.toString() ?? ''};
        }
        _json(request, 200, {
          'paused': value['paused'], 'position': value['position'], 'duration': value['duration'], 'volume': value['volume'],
          'shuffle': _shuffle, 'repeat': _repeat,
          'index': value['index'], 'track': visibleTrack(value['track']),
          'queue': (value['queue'] as List? ?? []).map(visibleTrack).toList(),
        });
      } else if (request.method == 'POST' && path == '/command') {
        final data = await _body(request);
        final name = data['command'];
        if (name is! String || !{'play', 'pause', 'next', 'previous', 'shuffle', 'repeat', 'seek', 'volume', 'queue-play'}.contains(name)) throw const FormatException('Unknown command');
        await command(name, data);
        _json(request, 200, {'ok': true});
      } else {
        _json(request, 404, {'error': 'Not found'});
      }
    } on FormatException catch (error) {
      _json(request, 400, {'error': error.message});
    } catch (_) {
      _json(request, 500, {'error': 'Remote control unavailable'});
    } finally {
      await request.response.close();
    }
  }
}
