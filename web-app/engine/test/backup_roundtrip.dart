import 'dart:convert';
import 'dart:io';
import 'package:hive/hive.dart';
import 'package:grove_source_engine/grove_source_engine.dart' as core;
Future<void> main() async {
  final dir = await Directory.systemTemp.createTemp('grove-hive-test-');
  final box = await Hive.openBox('fixture', path: dir.path);
  await box.put('likedSongs', [{'ytid': 'abcdefghijk', 'title': 'Roundtrip', 'artist': 'Artist'}]);
  await box.put('date', DateTime.utc(2026, 1, 1)); await box.close();
  final bytes = await File('${dir.path}/fixture.hive').readAsBytes();
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen(core.handle); final client = HttpClient();
  try {
    final request = await client.postUrl(Uri.parse('http://127.0.0.1:${server.port}/import-backup')); request.add(bytes);
    final response = await request.close(); final result = jsonDecode(await utf8.decoder.bind(response).join()) as Map;
    if (response.statusCode != 200 || result['likedSongs'][0]['title'] != 'Roundtrip' || result['date'] != '2026-01-01T00:00:00.000Z') throw StateError('Hive backup import failed: $result');
    print('Real Musify Hive binary backup roundtrip passed.');
  } finally { client.close(force: true); await server.close(force: true); await dir.delete(recursive: true); }
}
