// Grove keeps Musify's GPLv3 native engine and renders its interface with HTML.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:file_picker/file_picker.dart';
import 'package:musify/main.dart' as musify;
import 'package:musify/services/listening_stats_service.dart';
import 'package:musify/grove/native_server.dart';
import 'package:musify/grove/phone_app.dart';
import 'package:musify/grove/tv_app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ZonicBootstrap());
}

class ZonicBootstrap extends StatefulWidget {
  const ZonicBootstrap({super.key});

  @override
  State<ZonicBootstrap> createState() => _ZonicBootstrapState();
}

class _ZonicBootstrapState extends State<ZonicBootstrap> {
  GroveNativeServer? server;
  Object? error;

  @override
  void initState() {
    super.initState();
    unawaited(_start());
  }

  Future<void> _start() async {
    try {
      await musify.initialisation(grove: true);
      final startedServer = await GroveNativeServer.start();
      if (mounted) setState(() => server = startedServer);
    } catch (startupError, stackTrace) {
      debugPrint('Zonic startup failed: $startupError\n$stackTrace');
      if (mounted) setState(() => error = startupError);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (server case final activeServer?) return ZonicApp(server: activeServer);
    if (error case final startupError?) {
      return ZonicStartupFailure(error: startupError);
    }
    return const ZonicStartingApp();
  }
}

class ZonicStartingApp extends StatelessWidget {
  const ZonicStartingApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: ThemeData.dark(),
    home: const Scaffold(
      backgroundColor: Color(0xff09090b),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'zonic',
              style: TextStyle(fontSize: 46, fontWeight: FontWeight.w900),
            ),
            SizedBox(height: 28),
            SizedBox.square(
              dimension: 34,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                color: Color(0xff9d8cff),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class ZonicApp extends StatelessWidget {
  const ZonicApp({super.key, required this.server});

  final GroveNativeServer server;

  @override
  Widget build(BuildContext context) => server.platform['tv'] == true
      ? ZonicTvApp(server: server)
      : const ZonicPhoneApp();
}

class ZonicStartupFailure extends StatelessWidget {
  const ZonicStartupFailure({super.key, required this.error});

  final Object error;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Zonic',
    theme: ThemeData.dark(),
    home: Scaffold(
      backgroundColor: const Color(0xff0a0a0a),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.tv_off_rounded,
                    size: 64,
                    color: Color(0xff9d8cff),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'Zonic could not start',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Restart the app. If this keeps happening, send the message below with your TV model.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 17, color: Color(0xffb9b6c3)),
                  ),
                  const SizedBox(height: 18),
                  SelectableText(
                    error.toString(),
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xff817d8c),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class GroveWebShell extends StatefulWidget {
  const GroveWebShell({super.key, required this.server});
  final GroveNativeServer server;
  @override
  State<GroveWebShell> createState() => _GroveWebShellState();
}

class _GroveWebShellState extends State<GroveWebShell>
    with WidgetsBindingObserver {
  late final WebViewController controller;
  bool loading = true;
  String? remoteOrigin;
  bool isPrivateRemote(Uri uri) {
    if (uri.scheme != 'http' ||
        uri.path != '/' ||
        uri.hasQuery ||
        uri.hasFragment ||
        uri.port == 80 ||
        uri.userInfo.isNotEmpty)
      return false;
    final parts = uri.host.split('.').map(int.tryParse).toList();
    if (parts.length != 4 || parts.any((p) => p == null || p < 0 || p > 255))
      return false;
    return parts[0] == 10 ||
        parts[0] == 192 && parts[1] == 168 ||
        parts[0] == 172 && parts[1]! >= 16 && parts[1]! <= 31;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    SystemChrome.setSystemUIOverlayStyle(
      const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        systemNavigationBarColor: Color(0xff0a0a0a),
        systemNavigationBarIconBrightness: Brightness.light,
        systemNavigationBarDividerColor: Colors.transparent,
      ),
    );
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xff101414))
      ..addJavaScriptChannel(
        'ZonicNative',
        onMessageReceived: (message) {
          switch (message.message) {
            case 'selection':
              HapticFeedback.selectionClick();
              break;
            case 'medium':
              HapticFeedback.mediumImpact();
              break;
            default:
              HapticFeedback.lightImpact();
          }
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) setState(() => loading = true);
          },
          onPageFinished: (_) {
            if (mounted) setState(() => loading = false);
          },
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri == null) return NavigationDecision.prevent;
            if ((uri.scheme == 'http' || uri.scheme == 'https') &&
                uri.origin == widget.server.origin)
              return NavigationDecision.navigate;
            if (isPrivateRemote(uri)) {
              remoteOrigin = uri.origin;
              return NavigationDecision.navigate;
            }
            return NavigationDecision.prevent;
          },
        ),
      )
      ..loadRequest(widget.server.entry);
    if (controller.platform is AndroidWebViewController) {
      final android = controller.platform as AndroidWebViewController;
      android.setMediaPlaybackRequiresUserGesture(false);
      android.enableZoom(false);
      android.setTextZoom(100);
      android.setOnShowFileSelector((params) async {
        final result = await FilePicker.pickFiles();
        return result
            .where((f) => f.path != null)
            .map((f) => Uri.file(f.path!).toString())
            .toList();
      });
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      return;
    }
    if (state != AppLifecycleState.resumed) {
      listeningStatsService.recordListeningSessionProgress(
        wasPlaying: musify.audioHandler.audioPlayer.playing,
      );
      unawaited(listeningStatsService.flush());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    onPopInvokedWithResult: (didPop, _) async {
      if (didPop) return;
      final url = await controller.currentUrl();
      if (url != null &&
          remoteOrigin != null &&
          Uri.tryParse(url)?.origin == remoteOrigin) {
        remoteOrigin = null;
        await controller.loadRequest(widget.server.entry);
        return;
      }
      final handled = await controller.runJavaScriptReturningResult(
        'window.groveBack?.() ?? false',
      );
      if (handled != true && handled != 'true') await SystemNavigator.pop();
    },
    child: Scaffold(
      backgroundColor: const Color(0xff0a0a0a),
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            WebViewWidget(controller: controller),
            IgnorePointer(
              ignoring: !loading,
              child: AnimatedOpacity(
                opacity: loading ? 1 : 0,
                duration: const Duration(milliseconds: 160),
                child: const ColoredBox(
                  color: Color(0xff0a0a0a),
                  child: Center(
                    child: SizedBox.square(
                      dimension: 26,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: Color(0xff9d8cff),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
