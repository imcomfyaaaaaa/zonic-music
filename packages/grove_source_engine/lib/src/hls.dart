import 'dart:convert';
import 'dart:io';
import 'dart:math';
class HlsRelay {
  final resources = <String, ({Uri uri, DateTime expiry})>{};
  final tokens = <String, String>{};
  void clear() { resources.clear(); tokens.clear(); }
  String register(Uri uri) {
    if (uri.scheme != 'https' || !(uri.host.endsWith('.googlevideo.com') || uri.host.endsWith('.youtube.com'))) throw const FormatException('Unsupported live media host');
    final existing = tokens[uri.toString()];
    if (existing != null && resources.containsKey(existing)) return 'hls?token=$existing';
    if (resources.length > 20000) { resources.removeWhere((_, resource) => resource.expiry.isBefore(DateTime.now())); tokens.removeWhere((_, token) => !resources.containsKey(token)); }
    final token = base64Url.encode(List.generate(18, (_) => Random.secure().nextInt(256)));
    resources[token] = (uri: uri, expiry: DateTime.now().add(const Duration(hours: 6))); tokens[uri.toString()] = token;
    return 'hls?token=$token';
  }
  Uri lookup(String token) { final resource = resources[token]; if (resource == null || resource.expiry.isBefore(DateTime.now())) throw const FormatException('Live stream resource expired'); return resource.uri; }
  Future<void> relay(HttpRequest req, Uri uri, String Function(Uri) proxy) async {
    final client = HttpClient()..findProxy = proxy;
    try {
      final request = await client.getUrl(uri).timeout(const Duration(seconds: 20));
      final range = req.headers.value('range'); if (range != null && RegExp(r'^bytes=\d*-\d*$').hasMatch(range)) request.headers.set('range', range);
      request.headers.set('user-agent', 'Mozilla/5.0');
      final response = await request.close().timeout(const Duration(seconds: 20)); req.response.statusCode = response.statusCode;
      if (response.statusCode >= 400) { await req.response.addStream(response); return; }
      final type = response.headers.contentType?.mimeType ?? '';
      if (type.contains('mpegurl') || uri.path.endsWith('.m3u8')) {
        final playlist = await utf8.decoder.bind(response).join();
        final rewritten = playlist.split('\n').map((line) {
          if (line.trim().isEmpty) return line;
          if (!line.startsWith('#')) return register(uri.resolve(line.trim()));
          return line.replaceAllMapped(RegExp('URI="([^"]+)"'), (match) => 'URI="${register(uri.resolve(match[1]!))}"');
        }).join('\n');
        req.response.headers.set('Content-Type', 'application/vnd.apple.mpegurl'); req.response.write(rewritten);
      } else {
        for (final header in ['content-type', 'content-length', 'content-range', 'accept-ranges']) { final value = response.headers.value(header); if (value != null) req.response.headers.set(header, value); }
        await req.response.addStream(response);
      }
    } finally { client.close(force: true); }
  }
}
