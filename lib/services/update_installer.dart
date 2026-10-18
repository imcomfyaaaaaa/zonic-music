import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

Future<void> showZonicUpdateInstaller(
  BuildContext context, {
  required String version,
  required String url,
  String? digest,
}) => showDialog<void>(
  context: context,
  barrierDismissible: false,
  builder: (_) =>
      _UpdateInstallerDialog(version: version, url: url, digest: digest),
);

class _UpdateInstallerDialog extends StatefulWidget {
  const _UpdateInstallerDialog({
    required this.version,
    required this.url,
    this.digest,
  });

  final String version;
  final String url;
  final String? digest;

  @override
  State<_UpdateInstallerDialog> createState() => _UpdateInstallerDialogState();
}

class _UpdateInstallerDialogState extends State<_UpdateInstallerDialog> {
  static const _platform = MethodChannel('grove/platform');
  final http.Client _client = http.Client();
  String _status = 'Downloading update…';
  String? _apkPath;
  int _received = 0;
  int? _total;
  bool _downloading = true;
  bool _cancelled = false;

  @override
  void initState() {
    super.initState();
    unawaited(_download());
  }

  @override
  void dispose() {
    _cancelled = true;
    _client.close();
    super.dispose();
  }

  Future<void> _download() async {
    File? partial;
    try {
      final uri = Uri.parse(widget.url);
      if (uri.scheme != 'https' || uri.host != 'github.com') {
        throw const FormatException('Unexpected update download URL');
      }
      final cache = await getTemporaryDirectory();
      final directory = await Directory('${cache.path}/updates').create();
      final baseName = 'zonic-${widget.version}';
      partial = File('${directory.path}/$baseName.apk.part');
      final destination = File('${directory.path}/$baseName.apk');
      final request = http.Request('GET', uri)
        ..headers['User-Agent'] = 'Zonic-Music-Updater';
      final response = await _client
          .send(request)
          .timeout(const Duration(seconds: 30));
      if (response.statusCode != 200) {
        throw HttpException('Download returned ${response.statusCode}');
      }
      _total = response.contentLength;
      final output = partial.openWrite();
      Digest? calculatedDigest;
      final hash = sha256.startChunkedConversion(
        ChunkedConversionSink.withCallback((digests) {
          calculatedDigest = digests.single;
        }),
      );
      try {
        await for (final chunk in response.stream) {
          if (_cancelled) throw const HttpException('Download cancelled');
          output.add(chunk);
          hash.add(chunk);
          _received += chunk.length;
          if (mounted) setState(() {});
        }
      } finally {
        hash.close();
        await output.close();
      }
      if (_received < 1024 * 1024) {
        throw const FormatException(
          'Downloaded file is too small to be an APK',
        );
      }
      final header = await partial.openRead(0, 4).first;
      if (header.length < 4 || header[0] != 0x50 || header[1] != 0x4b) {
        throw const FormatException('Downloaded file is not an APK');
      }
      final expected = widget.digest?.replaceFirst('sha256:', '').toLowerCase();
      if (expected != null &&
          expected.isNotEmpty &&
          calculatedDigest.toString().toLowerCase() != expected) {
        throw const FormatException('APK checksum does not match GitHub');
      }
      if (await destination.exists()) await destination.delete();
      await partial.rename(destination.path);
      partial = null;
      if (!mounted || _cancelled) return;
      setState(() {
        _apkPath = destination.path;
        _downloading = false;
        _status = 'Download complete. Opening Android installer…';
      });
      await _install();
    } catch (error) {
      if (mounted && !_cancelled) {
        setState(() {
          _downloading = false;
          _status = 'Update failed: $error';
        });
      }
    } finally {
      if (partial != null && await partial.exists()) await partial.delete();
    }
  }

  Future<void> _install() async {
    final path = _apkPath;
    if (path == null) return;
    try {
      await _platform.invokeMethod<bool>('installUpdate', {'path': path});
      if (mounted)
        setState(() => _status = 'Follow the Android installer prompt.');
    } on PlatformException catch (error) {
      if (mounted) {
        setState(
          () => _status = error.code == 'permission_required'
              ? 'Allow installs from Zonic in Android settings, then return here and tap Install now.'
              : 'Could not open Android installer: ${error.message ?? error.code}',
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final progress = _total == null || _total == 0
        ? null
        : (_received / _total!).clamp(0.0, 1.0);
    return AlertDialog(
      title: Text('Zonic v${widget.version}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_status),
          if (_downloading) ...[
            const SizedBox(height: 18),
            LinearProgressIndicator(value: progress),
            const SizedBox(height: 8),
            Text(
              _total == null
                  ? '${(_received / 1048576).toStringAsFixed(1)} MB'
                  : '${(_received / 1048576).toStringAsFixed(1)} / ${(_total! / 1048576).toStringAsFixed(1)} MB',
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () {
            _cancelled = true;
            _client.close();
            Navigator.pop(context);
          },
          child: Text(_downloading ? 'Cancel' : 'Close'),
        ),
        if (!_downloading && _apkPath != null)
          FilledButton(onPressed: _install, child: const Text('Install now')),
      ],
    );
  }
}
