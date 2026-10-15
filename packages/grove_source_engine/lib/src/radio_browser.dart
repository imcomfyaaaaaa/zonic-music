import 'dart:convert';
import 'package:http/http.dart' as http;

const _host = 'de1.api.radio-browser.info';
const _headers = {'User-Agent': 'Grove-Music/0.2.0', 'Accept': 'application/json'};
final _uuid = RegExp(r'^[0-9a-fA-F-]{36}$');
final _excluded = RegExp(r'\b(?:news|talk|sports?|sermon|religious|christian|podcast|audiobook)\b', caseSensitive: false);

String _safeUrl(Object? value) {
  final uri = Uri.tryParse(value?.toString() ?? '');
  return uri != null && ['http', 'https'].contains(uri.scheme) && uri.host.isNotEmpty && uri.userInfo.isEmpty ? uri.toString() : '';
}

Future<List<Map<String, Object?>>> searchRadioBrowser({String query = '', String genre = ''}) async {
  if (query.length > 100 || genre.length > 40) throw const FormatException('Radio search is too long.');
  final uri = Uri.https(_host, '/json/stations/search', {
    if (query.trim().isNotEmpty) 'name': query.trim(),
    if (genre.trim().isNotEmpty && genre != 'All') 'tag': genre.trim().toLowerCase(),
    'hidebroken': 'true', 'order': 'clickcount', 'reverse': 'true', 'limit': '120',
  });
  final response = await http.get(uri, headers: _headers).timeout(const Duration(seconds: 15));
  if (response.statusCode != 200) throw StateError('Radio Browser is unavailable. Try the built-in stations.');
  final entries = jsonDecode(response.body);
  if (entries is! List) throw const FormatException('Radio Browser returned invalid station data.');
  final results = <Map<String, Object?>>[];
  final seen = <String>{};
  for (final value in entries) {
    if (value is! Map) continue;
    final id = value['stationuuid']?.toString() ?? '';
    final name = (value['name']?.toString() ?? '').replaceAll(RegExp(r'\s+'), ' ').trim();
    final stream = _safeUrl(value['url_resolved']).isNotEmpty ? _safeUrl(value['url_resolved']) : _safeUrl(value['url']);
    final tags = value['tags']?.toString() ?? '';
    final codec = (value['codec']?.toString() ?? '').toUpperCase();
    if (!_uuid.hasMatch(id) || !seen.add(id) || name.isEmpty || stream.isEmpty || value['lastcheckok'] != 1 || value['hls'] == 1) continue;
    if (!RegExp('MP3|AAC|OGG|OPUS').hasMatch(codec) || _excluded.hasMatch('$name,$tags')) continue;
    final country = (value['countrycode']?.toString() ?? '').toUpperCase();
    results.add({'id': 'radio-browser:$id', 'title': name.length > 200 ? name.substring(0, 200) : name,
      'artist': tags.split(',').map((s) => s.trim()).firstWhere((s) => s.isNotEmpty && !_excluded.hasMatch(s), orElse: () => 'Music radio'),
      'countrycode': RegExp(r'^[A-Z]{2}$').hasMatch(country) ? country : '',
      'url': stream, 'artwork': _safeUrl(value['favicon']), 'kind': 'radio', 'isLive': true});
    if (results.length >= 48) break;
  }
  return results;
}

Future<void> countRadioBrowserClick(String id) async {
  if (!_uuid.hasMatch(id)) throw const FormatException('Invalid radio station.');
  await http.get(Uri.https(_host, '/json/url/$id'), headers: _headers).timeout(const Duration(seconds: 8));
}
