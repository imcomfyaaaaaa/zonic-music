import 'dart:async';
import 'dart:convert';
import 'dart:io';

typedef StreamResolver = Future<({Uri url, Map<String, String> headers})> Function(String id, String quality);
class GroveFiles {
  GroveFiles() : root = Directory(Platform.environment['GROVE_DATA_ROOT'] ?? '${Directory.current.path}/.grove-data');
  Directory root;
  final Map<String, Map<String, dynamic>> jobs = {};
  String key(String id) { if (id.isEmpty || id.length > 200) throw const FormatException('Invalid audio identifier'); return base64Url.encode(utf8.encode(id)); }
  File file(String id) => File('${root.path}/${key(id)}.audio');
  File metadata(String id) => File('${root.path}/${key(id)}.json');
  String safeType(String? value) => value != null && (value.startsWith('audio/') || value.startsWith('video/')) ? value : 'audio/mpeg';
  void json(HttpRequest req, Object value) { req.response.headers.contentType = ContentType.json; req.response.write(jsonEncode(value)); }
  Future<void> handle(HttpRequest req, String command, StreamResolver resolve, String Function(Uri) findProxy) async {
    await root.create(recursive: true);
    final id = req.uri.queryParameters['id'] ?? '';
    if (command == 'downloads') { json(req, jobs); return; }
    if (command == 'cancel-downloads') { for (final job in jobs.values) { if (job['status'] == 'active') job['cancelled'] = true; } json(req, {'ok': true}); return; }
    if (command == 'download') {
      final data = jsonDecode(await utf8.decoder.bind(req).join()) as Map;
      final trackId = data['id'].toString(); key(trackId);
      if (jobs[trackId]?['status'] == 'active') { json(req, jobs[trackId]!); return; }
      final job = jobs[trackId] = {'id': trackId, 'status': 'active', 'received': 0, 'total': 0, 'cancelled': false};
      unawaited(download(data, job, resolve, findProxy));
      req.response.statusCode = 202; json(req, job); return;
    }
    if (command == 'remove-file') { final f = file(id), m = metadata(id); if (await f.exists()) await f.delete(); if (await m.exists()) await m.delete(); json(req, {'ok': true}); return; }
    final target = file(id);
    if (req.method == 'POST') {
      final temp = File('${target.path}.partial'), sink = temp.openWrite();
      try { await sink.addStream(req); await sink.flush(); await sink.close(); await temp.rename(target.path); await metadata(id).writeAsString(jsonEncode({'type': safeType(req.headers.contentType?.mimeType)})); json(req, {'ok': true}); }
      catch (_) { try { await sink.close(); } catch (_) {} if (await temp.exists()) await temp.delete(); rethrow; }
      return;
    }
    if (!await target.exists()) { req.response.statusCode = 404; json(req, {'error': 'Audio is not stored on this device.'}); return; }
    final size = await target.length(); var start = 0, end = size;
    final range = req.headers.value('range');
    if (range != null) {
      final match = RegExp(r'^bytes=(\d*)-(\d*)$').firstMatch(range);
      if (match == null) { req.response.statusCode = 416; return; }
      if (match[1]!.isEmpty) start = (size - (int.tryParse(match[2]!) ?? 0)).clamp(0, size);
      else { start = int.parse(match[1]!); if (match[2]!.isNotEmpty) end = (int.parse(match[2]!) + 1).clamp(0, size); }
      if (start >= end || start >= size) { req.response.statusCode = 416; return; }
      req.response.statusCode = 206; req.response.headers.set('Content-Range', 'bytes $start-${end - 1}/$size');
    }
    var type = 'audio/mpeg'; if (await metadata(id).exists()) { type = (jsonDecode(await metadata(id).readAsString()) as Map)['type'] ?? type; }
    req.response.headers.set('Content-Type', type); req.response.headers.set('Accept-Ranges', 'bytes'); req.response.contentLength = end - start;
    if (req.method != 'HEAD') await req.response.addStream(target.openRead(start, end));
  }
  Future<void> download(Map track, Map<String, dynamic> job, StreamResolver resolve, String Function(Uri) findProxy) async {
    final client = HttpClient()..findProxy = findProxy;
    final target = file(job['id']), temp = File('${file(job['id']).path}.partial');
    IOSink? sink;
    try {
      await root.create(recursive: true);
      final source = track['ytid'] != null ? await resolve(track['ytid'].toString(), track['quality']?.toString() ?? 'high') : (url: Uri.parse(track['url'].toString()), headers: <String, String>{});
      if (!['http', 'https'].contains(source.url.scheme) || source.url.userInfo.isNotEmpty) throw const FormatException('Invalid audio URL');
      final request = await client.getUrl(source.url); source.headers.forEach(request.headers.set);
      final response = await request.close(); if (response.statusCode >= 400) throw StateError('Audio source returned ${response.statusCode}');
      job['total'] = response.contentLength; sink = temp.openWrite();
      await for (final chunk in response) { if (job['cancelled'] == true) throw const FileSystemException('Download cancelled'); sink.add(chunk); job['received'] = (job['received'] as int) + chunk.length; }
      await sink.flush(); await sink.close(); sink = null;
      await temp.rename(target.path); await metadata(job['id']).writeAsString(jsonEncode({'type': safeType(response.headers.contentType?.mimeType)}));
      job['status'] = 'complete';
    } catch (e) { job['status'] = job['cancelled'] == true ? 'cancelled' : 'failed'; job['error'] = e.toString(); try { await sink?.close(); } catch (_) {} if (await temp.exists()) await temp.delete(); }
    finally { client.close(force: true); }
  }
}
