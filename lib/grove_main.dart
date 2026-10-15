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

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await musify.initialisation(grove: true);
  final server = await GroveNativeServer.start();
  runApp(MaterialApp(debugShowCheckedModeBanner: false, title: 'Zonic', theme: ThemeData.dark(), home: GroveWebShell(server: server)));
}

class GroveWebShell extends StatefulWidget {
  const GroveWebShell({super.key, required this.server});
  final GroveNativeServer server;
  @override
  State<GroveWebShell> createState() => _GroveWebShellState();
}

class _GroveWebShellState extends State<GroveWebShell> with WidgetsBindingObserver {
  late final WebViewController controller;
  String? remoteOrigin;
  bool isPrivateRemote(Uri uri) {
    if (uri.scheme != 'http' || uri.path != '/' || uri.hasQuery || uri.hasFragment || uri.port == 80 || uri.userInfo.isNotEmpty) return false;
    final parts = uri.host.split('.').map(int.tryParse).toList();
    if (parts.length != 4 || parts.any((p) => p == null || p < 0 || p > 255)) return false;
    return parts[0] == 10 || parts[0] == 192 && parts[1] == 168 || parts[0] == 172 && parts[1]! >= 16 && parts[1]! <= 31;
  }
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xff101414))
      ..setNavigationDelegate(NavigationDelegate(onNavigationRequest: (request) {
        final uri = Uri.tryParse(request.url);
        if (uri == null) return NavigationDecision.prevent;
        if ((uri.scheme == 'http' || uri.scheme == 'https') && uri.origin == widget.server.origin) return NavigationDecision.navigate;
        if (isPrivateRemote(uri)) { remoteOrigin = uri.origin; return NavigationDecision.navigate; }
        return NavigationDecision.prevent;
      }))
      ..loadRequest(widget.server.entry);
    if (controller.platform is AndroidWebViewController) {
      final android = controller.platform as AndroidWebViewController;
      android.setMediaPlaybackRequiresUserGesture(false);
      android.setOnShowFileSelector((params) async {
        final result = await FilePicker.pickFiles();
        return result.where((f) => f.path != null).map((f) => Uri.file(f.path!).toString()).toList();
      });
    }
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  }
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      listeningStatsService.recordListeningSessionProgress(wasPlaying: musify.audioHandler.audioPlayer.playing);
      unawaited(listeningStatsService.flush());
    }
  }
  @override
  void dispose() { WidgetsBinding.instance.removeObserver(this); super.dispose(); }
  @override
  Widget build(BuildContext context) => PopScope(canPop: false, onPopInvokedWithResult: (didPop, _) async { if (didPop) return; final url = await controller.currentUrl(); if (url != null && remoteOrigin != null && Uri.tryParse(url)?.origin == remoteOrigin) { remoteOrigin = null; await controller.loadRequest(widget.server.entry); return; } final handled = await controller.runJavaScriptReturningResult('window.groveBack?.() ?? false'); if (handled != true && handled != 'true') await SystemNavigator.pop(); }, child: Scaffold(body: SafeArea(child: WebViewWidget(controller: controller))));
}
