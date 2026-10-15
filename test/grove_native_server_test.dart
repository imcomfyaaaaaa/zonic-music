import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:musify/grove/native_server.dart';
import 'package:musify/services/io_service.dart';
class RealHttp extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) => super.createHttpClient(context);
}
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMessageHandler('flutter/assets', (message) async {
    final path = utf8.decode(message!.buffer.asUint8List(message.offsetInBytes, message.lengthInBytes));
    if (path != 'web-app/dist/index.html' && !path.startsWith('web-app/dist/src/ai/')) return null;
    final bytes = await File(path).readAsBytes(); return ByteData.sublistView(bytes);
  });
  test('native server protects the bridge and stores local audio', () => HttpOverrides.runWithHttpOverrides(() async {
    final dir = await Directory.systemTemp.createTemp('grove-native-test-');
    applicationDirPath = dir.path;
    final app = await GroveNativeServer.start(); final client = HttpClient();
    try {
      final denied = await (await client.getUrl(Uri.parse('${app.origin}/index.html'))).close();
      expect(denied.statusCode, 403); await denied.drain<void>();
      final bootstrap = await (await client.getUrl(app.entry)).close(); final bootstrapBody = await utf8.decoder.bind(bootstrap).join(); expect(bootstrap.statusCode, 200, reason: bootstrapBody);
      final cookie = bootstrap.cookies.single;
      for (final asset in {
        'runtime/ort-wasm-simd-threaded.jsep.mjs': 'text/javascript',
        'runtime/ort-wasm-simd-threaded.jsep.wasm': 'application/wasm',
        'models/minilm/onnx/model_quantized.onnx': 'application/octet-stream',
      }.entries) {
        final request = await client.getUrl(Uri.parse('${app.origin}/src/ai/${asset.key}'));
        request.cookies.add(cookie); final response = await request.close();
        expect(response.statusCode, 200); expect(response.headers.contentType?.mimeType, asset.value);
        final received = await response.fold<int>(0, (total, bytes) => total + bytes.length);
        expect(received, await File('web-app/dist/src/ai/${asset.key}').length());
      }
      final upload = await client.postUrl(Uri.parse('${app.origin}/native/file?id=local-fixture')); upload.cookies.add(cookie); upload.add([1, 2, 3, 4]);
      final stored = await upload.close(); expect(stored.statusCode, 200); expect(jsonDecode(await utf8.decoder.bind(stored).join())['ok'], true);
      expect(await File(app.filePath('local-fixture')).readAsBytes(), [1, 2, 3, 4]);
      final foreign = await client.getUrl(Uri.parse('${app.origin}/native/file?id=local-fixture')); foreign.cookies.add(cookie); foreign.headers.set('origin', 'https://example.com'); final blocked = await foreign.close(); expect(blocked.statusCode, 403); await blocked.drain<void>();
    } finally { client.close(force: true); for (final sub in app.subscriptions) { await sub.cancel(); } await app.server.close(force: true); await dir.delete(recursive: true); }
  }, RealHttp()));
}
