import 'dart:async';

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:musify/grove/native_server.dart';
import 'package:musify/grove/native_widgets.dart';
import 'package:musify/main.dart' as musify;
import 'package:musify/services/common_services.dart';
import 'package:musify/services/playlists_manager.dart';

class ZonicTvApp extends StatelessWidget {
  const ZonicTvApp({super.key, required this.server});

  final GroveNativeServer server;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Zonic TV',
    theme: ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: zonicBackground,
      colorScheme: const ColorScheme.dark(
        primary: zonicAccent,
        secondary: Color(0xffff6680),
        surface: Color(0xff19181f),
      ),
      focusColor: const Color(0xff9d8cff),
      hoverColor: const Color(0x229d8cff),
      textTheme: ThemeData.dark().textTheme.apply(fontFamily: 'Roboto'),
    ),
    home: _TvHome(server: server),
  );
}

class _TvHome extends StatefulWidget {
  const _TvHome({required this.server});

  final GroveNativeServer server;

  @override
  State<_TvHome> createState() => _TvHomeState();
}

class _TvHomeState extends State<_TvHome> {
  late final StreamSubscription<MediaItem?> _mediaSubscription;
  int section = 0;

  @override
  void initState() {
    super.initState();
    _mediaSubscription = musify.audioHandler.mediaItem.listen((_) {
      if (mounted) setState(() {});
    });
    userCustomPlaylists.addListener(_libraryChanged);
    userLikedSongsList.addListener(_libraryChanged);
  }

  void _libraryChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    unawaited(_mediaSubscription.cancel());
    userCustomPlaylists.removeListener(_libraryChanged);
    userLikedSongsList.removeListener(_libraryChanged);
    super.dispose();
  }

  List<Map> get playlists => List<Map>.from(userCustomPlaylists.value);
  List<Map> get liked => List<Map>.from(userLikedSongsList.value);

  Future<void> _playSongs(List<Map> songs) async {
    if (songs.isEmpty) return;
    await musify.audioHandler.playBrowserPlaylist(songs, songIndex: 0);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Column(
        children: [
          _header(),
          Expanded(
            child: IndexedStack(
              index: section,
              children: [_home(), _library(), _nowPlaying()],
            ),
          ),
        ],
      ),
    ),
  );

  Widget _header() => Padding(
    padding: const EdgeInsets.fromLTRB(48, 24, 48, 12),
    child: Row(
      children: [
        const Text(
          'zonic',
          style: TextStyle(fontSize: 38, fontWeight: FontWeight.w900),
        ),
        const SizedBox(width: 44),
        _nav('Home', 0, Icons.home_rounded),
        _nav('Library', 1, Icons.video_library_rounded),
        _nav('Now playing', 2, Icons.graphic_eq_rounded),
        const Spacer(),
        if (widget.server.tvRemote case final remote?)
          Text(
            'Connect: ${remote.pin}',
            style: const TextStyle(fontSize: 18, color: Color(0xffb8b4c4)),
          ),
      ],
    ),
  );

  Widget _nav(String label, int index, IconData icon) => Padding(
    padding: const EdgeInsets.only(right: 12),
    child: ZonicSurfaceButton(
      autofocus: index == 0,
      selected: section == index,
      onPressed: () => setState(() => section = index),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 22),
          const SizedBox(width: 10),
          Text(label, style: const TextStyle(fontSize: 18)),
        ],
      ),
    ),
  );

  Widget _home() => ListView(
    padding: const EdgeInsets.fromLTRB(48, 20, 48, 60),
    children: [
      _playerHero(),
      const SizedBox(height: 34),
      _sectionTitle('Your playlists'),
      const SizedBox(height: 16),
      _playlistRow(playlists.take(8).toList()),
    ],
  );

  Widget _library() => ListView(
    padding: const EdgeInsets.fromLTRB(48, 20, 48, 60),
    children: [
      const Text(
        'Your Library',
        style: TextStyle(fontSize: 38, fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 22),
      if (liked.isNotEmpty)
        _LibraryTile(
          title: 'Liked Songs',
          subtitle: '${liked.length} songs',
          icon: Icons.favorite_rounded,
          onPressed: () => _playSongs(liked),
        ),
      ...playlists.map((playlist) {
        final songs = List<Map>.from(playlist['list'] as List? ?? const []);
        return _LibraryTile(
          title: playlist['title']?.toString() ?? 'Playlist',
          subtitle: '${songs.length} songs',
          artwork: zonicArtworkUrl(playlist),
          onPressed: () => _playSongs(songs),
        );
      }),
    ],
  );

  Widget _nowPlaying() => ListView(
    padding: const EdgeInsets.fromLTRB(48, 20, 48, 60),
    children: [_playerHero(expanded: true)],
  );

  Widget _playerHero({bool expanded = false}) {
    final song = musify.audioHandler.currentSong;
    return StreamBuilder<PlaybackState>(
      stream: musify.audioHandler.playbackState,
      builder: (context, snapshot) {
        final playing = snapshot.data?.playing == true;
        return Container(
          constraints: BoxConstraints(minHeight: expanded ? 420 : 250),
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            gradient: const LinearGradient(
              colors: [Color(0xff30284b), Color(0xff17151e)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Row(
            children: [
              ZonicArtwork(
                url: zonicArtworkUrl(song),
                size: expanded ? 340 : 210,
                radius: 22,
              ),
              const SizedBox(width: 36),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      song?['title']?.toString() ?? 'Choose something to play',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: expanded ? 42 : 34,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      song?['artist']?.toString() ?? 'Your music, your space',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 22,
                        color: Color(0xffc0bbc9),
                      ),
                    ),
                    const SizedBox(height: 30),
                    Row(
                      children: [
                        _control(
                          Icons.skip_previous_rounded,
                          'Previous',
                          musify.audioHandler.skipToPrevious,
                        ),
                        const SizedBox(width: 16),
                        _control(
                          playing
                              ? Icons.pause_rounded
                              : Icons.play_arrow_rounded,
                          playing ? 'Pause' : 'Play',
                          playing
                              ? musify.audioHandler.pause
                              : musify.audioHandler.play,
                          primary: true,
                        ),
                        const SizedBox(width: 16),
                        _control(
                          Icons.skip_next_rounded,
                          'Next',
                          musify.audioHandler.skipToNext,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _control(
    IconData icon,
    String label,
    Future<void> Function() action, {
    bool primary = false,
  }) => ZonicSurfaceButton(
    selected: primary,
    onPressed: () => unawaited(action()),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 30),
          const SizedBox(width: 9),
          Text(label, style: const TextStyle(fontSize: 18)),
        ],
      ),
    ),
  );

  Widget _sectionTitle(String title) => Text(
    title,
    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700),
  );

  Widget _playlistRow(List<Map> items) {
    if (items.isEmpty) {
      return const Text(
        'Your playlists will appear here after they sync.',
        style: TextStyle(fontSize: 20, color: Color(0xffaaa6b2)),
      );
    }
    return SizedBox(
      height: 250,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: items.length,
        separatorBuilder: (_, _) => const SizedBox(width: 18),
        itemBuilder: (context, index) {
          final playlist = items[index];
          final songs = List<Map>.from(playlist['list'] as List? ?? const []);
          return _PlaylistCard(
            title: playlist['title']?.toString() ?? 'Playlist',
            subtitle: '${songs.length} songs',
            artwork: zonicArtworkUrl(playlist),
            onPressed: () => _playSongs(songs),
          );
        },
      ),
    );
  }
}

class _PlaylistCard extends StatelessWidget {
  const _PlaylistCard({
    required this.title,
    required this.subtitle,
    required this.artwork,
    required this.onPressed,
  });

  final String title;
  final String subtitle;
  final String? artwork;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 190,
    child: ZonicSurfaceButton(
      onPressed: onPressed,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ZonicArtwork(url: artwork, size: 148),
          const SizedBox(height: 10),
          Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
          Text(
            subtitle,
            style: const TextStyle(fontSize: 13, color: Color(0xffb5b0bf)),
          ),
        ],
      ),
    ),
  );
}

class _LibraryTile extends StatelessWidget {
  const _LibraryTile({
    required this.title,
    required this.subtitle,
    required this.onPressed,
    this.artwork,
    this.icon,
  });

  final String title;
  final String subtitle;
  final String? artwork;
  final IconData? icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: ZonicSurfaceButton(
      onPressed: onPressed,
      child: Row(
        children: [
          if (icon != null)
            SizedBox(width: 64, height: 64, child: Icon(icon, size: 36))
          else
            ZonicArtwork(url: artwork, size: 64),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(color: Color(0xffb5b0bf)),
                ),
              ],
            ),
          ),
          const Icon(Icons.play_arrow_rounded, size: 34),
        ],
      ),
    ),
  );
}
