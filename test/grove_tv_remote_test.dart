import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:musify/grove/tv_remote_server.dart';

class RealHttp extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) => super.createHttpClient(context);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMessageHandler('flutter/assets', (message) async {
    final path = utf8.decode(message!.buffer.asUint8List(message.offsetInBytes, message.lengthInBytes));
    if (!path.startsWith('web-app/dist/src/remote.') && path != 'web-app/dist/src/tv-remote.html') return null;
    return ByteData.sublistView(await File(path).readAsBytes());
  });

  test('TV remote pairs, limits its data, and controls playback', () => HttpOverrides.runWithHttpOverrides(() async {
    final commands = <String>[];
    final remote = await GroveTvRemoteServer.start(
      () => {'paused': false, 'position': 12, 'duration': 180, 'index': 0, 'track': {'title': 'Song', 'artist': 'Artist', 'artwork': 'https://example.com/art.jpg', 'url': 'secret-audio-url'}, 'queue': [{'title': 'Song', 'artist': 'Artist', 'url': 'secret-audio-url'}]},
      (name, _) async => commands.add(name),
    );
    if (remote == null) return; // Build hosts without a private network adapter.
    final client = HttpClient()..findProxy = (_) => 'DIRECT';
    Future<(int, Map)> call(String path, {Map? data, String? token}) async {
      final request = data == null ? await client.getUrl(Uri.parse(remote.url + path)) : await client.postUrl(Uri.parse(remote.url + path));
      if (token != null) request.headers.set('authorization', 'Bearer $token');
      if (data != null) { request.headers.contentType = ContentType.json; request.write(jsonEncode(data)); }
      final response = await request.close();
      return (response.statusCode, jsonDecode(await utf8.decoder.bind(response).join()) as Map);
    }
    try {
      expect((await call('state')).$1, 401);
      expect((await call('pair', data: {'pin': '000000'})).$1, 401);
      final paired = await call('pair', data: {'pin': remote.pin});
      expect(paired.$1, 200);
      final token = paired.$2['token'] as String;
      final state = await call('state', token: token);
      expect(state.$1, 200);
      expect(state.$2['track']['title'], 'Song');
      expect(jsonEncode(state.$2), isNot(contains('secret-audio-url')));
      expect((await call('command', data: {'command': 'next'}, token: token)).$1, 200);
      expect(commands, ['next']);
      expect((await call('command', data: {'command': 'delete-library'}, token: token)).$1, 400);
      expect(commands, ['next']);
    } finally { client.close(force: true); await remote.server.close(force: true); }
  }, RealHttp()));
}
