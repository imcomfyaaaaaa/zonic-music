import 'dart:async';

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:musify/database/radio_stations.db.dart';
import 'package:musify/grove/native_account.dart';
import 'package:musify/grove/native_server.dart';
import 'package:musify/grove/native_widgets.dart';
import 'package:musify/main.dart' as musify;
import 'package:musify/services/common_services.dart';
import 'package:musify/services/playlists_manager.dart';
import 'package:musify/services/settings_manager.dart';
import 'package:musify/services/update_manager.dart';

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
      appBarTheme: const AppBarTheme(
        backgroundColor: zonicBackground,
        elevation: 0,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: const Color(0xff211f27),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      ),
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
  final account = ZonicAccountService();
  int section = 0;

  @override
  void initState() {
    super.initState();
    _mediaSubscription = musify.audioHandler.mediaItem.listen((_) {
      if (mounted) setState(() {});
    });
    userCustomPlaylists.addListener(_libraryChanged);
    userLikedSongsList.addListener(_libraryChanged);
    userOfflineSongs.addListener(_libraryChanged);
    userRecentlyPlayed.addListener(_libraryChanged);
    if (account.signedIn) _applyAccountPairingCode();
    if (!offlineMode.value) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => checkAppUpdates(displayContext: context),
      );
    }
  }

  void _libraryChanged() {
    if (mounted) setState(() {});
  }

  void _applyAccountPairingCode() {
    final code = account.session?.pairingCode;
    if (code != null && RegExp(r'^\d{5}$').hasMatch(code)) {
      widget.server.tvRemote?.setPin(code);
    }
  }

  @override
  void dispose() {
    unawaited(_mediaSubscription.cancel());
    userCustomPlaylists.removeListener(_libraryChanged);
    userLikedSongsList.removeListener(_libraryChanged);
    userOfflineSongs.removeListener(_libraryChanged);
    userRecentlyPlayed.removeListener(_libraryChanged);
    super.dispose();
  }

  List<Map> get playlists => List<Map>.from(userCustomPlaylists.value);
  List<Map> get liked => List<Map>.from(userLikedSongsList.value);

  void _openPlaylist(String title, List<Map> songs, {String? artwork}) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) =>
            _TvPlaylistPage(title: title, songs: songs, artwork: artwork),
      ),
    );
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
              children: [
                _home(),
                _library(),
                _radio(),
                _nowPlaying(),
                _settings(),
              ],
            ),
          ),
        ],
      ),
    ),
  );

  Widget _header() => Container(
    margin: const EdgeInsets.fromLTRB(32, 20, 32, 4),
    padding: const EdgeInsets.fromLTRB(22, 12, 18, 12),
    decoration: BoxDecoration(
      color: const Color(0x99141218),
      borderRadius: BorderRadius.circular(24),
      border: Border.all(color: const Color(0xff302d37)),
    ),
    child: Row(
      children: [
        RichText(
          text: TextSpan(
            style: TextStyle(
              fontSize: 38,
              fontWeight: FontWeight.w900,
              letterSpacing: -1.5,
            ),
            children: [
              TextSpan(
                text: 'z',
                style: TextStyle(color: Colors.white),
              ),
              TextSpan(
                text: 'o',
                style: TextStyle(color: Color(0xffbc8cff)),
              ),
              TextSpan(
                text: 'nic',
                style: TextStyle(color: Colors.white),
              ),
            ],
          ),
        ),
        const SizedBox(width: 44),
        _nav('Home', 0, Icons.home_rounded),
        _nav('Library', 1, Icons.video_library_rounded),
        _nav('Radio', 2, Icons.radio_rounded),
        _nav('Now playing', 3, Icons.graphic_eq_rounded),
        _nav('Settings', 4, Icons.settings_rounded),
        const Spacer(),
        if (widget.server.tvRemote case final remote?)
          ZonicSurfaceButton(
            onPressed: _showPhoneLink,
            child: Text(
              'Link phone: ${remote.pin}',
              style: const TextStyle(fontSize: 18),
            ),
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
      const SizedBox(height: 30),
      _sectionTitle('Quick access'),
      const SizedBox(height: 16),
      Wrap(
        spacing: 16,
        runSpacing: 16,
        children: [
          _quickAction(
            Icons.favorite_rounded,
            'Liked Songs',
            '${liked.length} songs',
            () => _openPlaylist('Liked Songs', liked),
          ),
          _quickAction(
            Icons.download_done_rounded,
            'Downloads',
            '${userOfflineSongs.value.length} songs',
            () => _openPlaylist(
              'Downloads',
              List<Map>.from(userOfflineSongs.value),
            ),
          ),
          _quickAction(
            Icons.search_rounded,
            'Search music',
            'Songs and artists',
            _showSearch,
          ),
          _quickAction(
            Icons.bedtime_rounded,
            'Sleep timer',
            'Stop playback later',
            _showSleepTimer,
          ),
        ],
      ),
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
          onPressed: () => _openPlaylist('Liked Songs', liked),
        ),
      if (userOfflineSongs.value.isNotEmpty)
        _LibraryTile(
          title: 'Downloads',
          subtitle: '${userOfflineSongs.value.length} songs available offline',
          icon: Icons.download_done_rounded,
          onPressed: () => _openPlaylist(
            'Downloads',
            List<Map>.from(userOfflineSongs.value),
          ),
        ),
      if (userRecentlyPlayed.value.isNotEmpty)
        _LibraryTile(
          title: 'Recently played',
          subtitle: '${userRecentlyPlayed.value.length} songs',
          icon: Icons.history_rounded,
          onPressed: () => _openPlaylist(
            'Recently played',
            List<Map>.from(userRecentlyPlayed.value),
          ),
        ),
      ...playlists.map((playlist) {
        final songs = List<Map>.from(playlist['list'] as List? ?? const []);
        return _LibraryTile(
          title: playlist['title']?.toString() ?? 'Playlist',
          subtitle: '${songs.length} songs',
          artwork: zonicArtworkUrl(playlist),
          onPressed: () => _openPlaylist(
            playlist['title']?.toString() ?? 'Playlist',
            songs,
            artwork: zonicArtworkUrl(playlist),
          ),
        );
      }),
    ],
  );

  Widget _nowPlaying() => ListView(
    padding: const EdgeInsets.fromLTRB(48, 20, 48, 60),
    children: [_playerHero(expanded: true)],
  );

  Widget _radio() => ListView(
    padding: const EdgeInsets.fromLTRB(48, 20, 48, 60),
    children: [
      const Text(
        'Radio',
        style: TextStyle(fontSize: 38, fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 8),
      const Text(
        'Live stations for your TV.',
        style: TextStyle(fontSize: 20, color: Color(0xffb5b0bf)),
      ),
      const SizedBox(height: 22),
      ...radioStationsDB
          .take(24)
          .map(
            (station) => _LibraryTile(
              title: station.name,
              subtitle: station.genre ?? 'Radio',
              artwork: station.image,
              onPressed: () => unawaited(
                musify.audioHandler.playRadioStream(
                  id: station.id,
                  name: station.name,
                  streamUrl: station.streamUrl,
                  image: station.image,
                  genre: station.genre,
                ),
              ),
            ),
          ),
    ],
  );

  Widget _settings() => ListView(
    padding: const EdgeInsets.fromLTRB(48, 20, 48, 60),
    children: [
      const Text(
        'Settings',
        style: TextStyle(fontSize: 38, fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 10),
      _settingsCard(
        'Zonic account',
        account.signedIn
            ? '${account.session!.email}\nPhone link code: ${account.session!.pairingCode}'
            : 'Sign in to show your Zonic account and use the same five-digit phone link code.',
        account.signedIn ? Icons.verified_user_rounded : Icons.login_rounded,
        account.signedIn ? _showPhoneLink : _showAccount,
      ),
      _settingsCard(
        'Link your phone',
        'Open the Zonic TV link on your phone, then enter the five-digit code shown here. Both devices must be on the same Wi-Fi.',
        Icons.phonelink_rounded,
        _showPhoneLink,
      ),
      _settingsCard(
        'App updates',
        'Zonic checks its GitHub releases automatically. Check again now whenever you want.',
        Icons.system_update_rounded,
        () => checkAppUpdates(displayContext: context, showNoUpdate: true),
      ),
      _settingsCard(
        'Music search',
        'Find songs on the TV and add them to playback.',
        Icons.search_rounded,
        _showSearch,
      ),
      _settingsCard(
        'Sleep timer',
        sleepTimerNotifier.value == null ||
                sleepTimerNotifier.value == Duration.zero
            ? 'No timer is active.'
            : 'A sleep timer is active.',
        Icons.bedtime_rounded,
        _showSleepTimer,
      ),
      if (account.signedIn)
        _settingsCard(
          'Sign out',
          'Remove this account from this TV.',
          Icons.logout_rounded,
          () async {
            await account.signOut();
            if (mounted) setState(() {});
          },
        ),
    ],
  );

  Widget _quickAction(
    IconData icon,
    String title,
    String subtitle,
    VoidCallback onPressed,
  ) => SizedBox(
    width: 220,
    child: ZonicSurfaceButton(
      onPressed: onPressed,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 36, color: zonicAccent),
          const SizedBox(height: 18),
          Text(
            title,
            style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 5),
          Text(subtitle, style: const TextStyle(color: zonicMuted)),
        ],
      ),
    ),
  );

  Widget _settingsCard(
    String title,
    String subtitle,
    IconData icon,
    VoidCallback onPressed,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: ZonicSurfaceButton(
      onPressed: onPressed,
      child: Row(
        children: [
          Icon(icon, color: zonicAccent, size: 36),
          const SizedBox(width: 22),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(fontSize: 17, color: zonicMuted),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, size: 34),
        ],
      ),
    ),
  );

  Future<void> _showPhoneLink() async {
    final remote = widget.server.tvRemote;
    if (remote == null) {
      _message('Phone linking is not available on this network yet.');
      return;
    }
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Link your phone'),
        content: SizedBox(
          width: 580,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'On your phone, open this address while connected to the same Wi-Fi:',
              ),
              const SizedBox(height: 14),
              SelectableText(
                remote.url,
                style: const TextStyle(
                  fontSize: 20,
                  color: zonicAccent,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 22),
              const Text('Then enter this five-digit code:'),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  remote.pin,
                  style: const TextStyle(
                    fontSize: 52,
                    letterSpacing: 12,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Once linked, your phone can control the TV playback, queue, volume, shuffle, repeat, and seeking.',
                style: TextStyle(color: zonicMuted),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }

  Future<void> _showAccount() async {
    final email = TextEditingController();
    final password = TextEditingController();
    String? error;
    var busy = false;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Sign in to Zonic'),
          content: SizedBox(
            width: 520,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Use the same Zonic account as your phone. Your TV will use that account’s five-digit phone-link code.',
                  style: TextStyle(color: zonicMuted),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: email,
                  autofocus: true,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Email'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: password,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Password'),
                  onSubmitted: (_) async {
                    if (busy) return;
                    update(() => busy = true);
                    try {
                      await account.signIn(email.text, password.text);
                      _applyAccountPairingCode();
                      if (dialogContext.mounted) Navigator.pop(dialogContext);
                      if (mounted) setState(() {});
                    } catch (caught) {
                      update(() {
                        busy = false;
                        error = caught.toString().replaceFirst(
                          'Bad state: ',
                          '',
                        );
                      });
                    }
                  },
                ),
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Text(error!, style: const TextStyle(color: Colors.redAccent)),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: busy ? null : () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: busy
                  ? null
                  : () async {
                      update(() => busy = true);
                      try {
                        await account.signIn(email.text, password.text);
                        _applyAccountPairingCode();
                        if (dialogContext.mounted) Navigator.pop(dialogContext);
                        if (mounted) setState(() {});
                      } catch (caught) {
                        update(() {
                          busy = false;
                          error = caught.toString().replaceFirst(
                            'Bad state: ',
                            '',
                          );
                        });
                      }
                    },
              child: busy
                  ? const CircularProgressIndicator()
                  : const Text('Sign in'),
            ),
          ],
        ),
      ),
    );
    email.dispose();
    password.dispose();
  }

  Future<void> _showSearch() async {
    final controller = TextEditingController();
    var songs = <Map>[];
    var loading = false;
    String? error;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: const Text('Search music'),
          content: SizedBox(
            width: 740,
            height: 500,
            child: Column(
              children: [
                TextField(
                  controller: controller,
                  autofocus: true,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (value) async {
                    if (value.trim().isEmpty) return;
                    update(() {
                      loading = true;
                      error = null;
                    });
                    try {
                      final results = await fetchSongsList(value.trim());
                      update(() {
                        songs = results.whereType<Map>().toList();
                        loading = false;
                      });
                    } catch (caught) {
                      update(() {
                        error = 'Search failed. Try again.';
                        loading = false;
                      });
                    }
                  },
                  decoration: const InputDecoration(
                    labelText: 'Song, artist, or album',
                    prefixIcon: Icon(Icons.search_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                if (loading) const LinearProgressIndicator(),
                if (error != null)
                  Text(error!, style: const TextStyle(color: Colors.redAccent)),
                Expanded(
                  child: ListView.builder(
                    itemCount: songs.length,
                    itemBuilder: (_, index) {
                      final song = songs[index];
                      return ListTile(
                        leading: ZonicArtwork(
                          url: zonicArtworkUrl(song),
                          size: 48,
                          radius: 8,
                        ),
                        title: Text(song['title']?.toString() ?? 'Song'),
                        subtitle: Text(song['artist']?.toString() ?? ''),
                        trailing: const Icon(Icons.play_arrow_rounded),
                        onTap: () {
                          unawaited(
                            musify.audioHandler.playBrowserPlaylist(
                              songs,
                              songIndex: index,
                            ),
                          );
                          Navigator.pop(dialogContext);
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Close'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
  }

  Future<void> _showSleepTimer() async {
    final choice = await showDialog<Object>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sleep timer'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final minutes in const [15, 30, 45, 60, 90])
              ListTile(
                title: Text('$minutes minutes'),
                onTap: () => Navigator.pop(dialogContext, minutes),
              ),
            ListTile(
              title: const Text('End of current song'),
              onTap: () => Navigator.pop(dialogContext, 'song'),
            ),
            ListTile(
              title: const Text('Turn timer off'),
              onTap: () => Navigator.pop(dialogContext, 'off'),
            ),
          ],
        ),
      ),
    );
    if (choice is int)
      await musify.audioHandler.setSleepTimer(Duration(minutes: choice));
    if (choice == 'song') await musify.audioHandler.setSleepTimerEndOfSong();
    if (choice == 'off') musify.audioHandler.cancelSleepTimer();
    if (choice != null && mounted) setState(() {});
  }

  void _message(String value) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(value)));

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
                          Icons.shuffle_rounded,
                          'Shuffle',
                          () => musify.audioHandler.setShuffleMode(
                            shuffleNotifier.value
                                ? AudioServiceShuffleMode.none
                                : AudioServiceShuffleMode.all,
                          ),
                        ),
                        const SizedBox(width: 16),
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
                        const SizedBox(width: 16),
                        _control(
                          repeatNotifier.value == AudioServiceRepeatMode.one
                              ? Icons.repeat_one_rounded
                              : Icons.repeat_rounded,
                          'Repeat',
                          () {
                            final next =
                                repeatNotifier.value ==
                                    AudioServiceRepeatMode.none
                                ? AudioServiceRepeatMode.all
                                : repeatNotifier.value ==
                                      AudioServiceRepeatMode.all
                                ? AudioServiceRepeatMode.one
                                : AudioServiceRepeatMode.none;
                            return musify.audioHandler.setRepeatMode(next);
                          },
                        ),
                      ],
                    ),
                    if (song != null) ...[
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          _control(
                            isSongAlreadyLiked(song['ytid'])
                                ? Icons.favorite_rounded
                                : Icons.favorite_border_rounded,
                            'Like',
                            () => updateSongLikeStatus(
                              song['ytid'],
                              !isSongAlreadyLiked(song['ytid']),
                              songData: song,
                            ),
                          ),
                          const SizedBox(width: 16),
                          _control(
                            Icons.download_rounded,
                            'Download',
                            () async {
                              await makeSongOffline(song);
                            },
                          ),
                        ],
                      ),
                    ],
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
            onPressed: () => _openPlaylist(
              playlist['title']?.toString() ?? 'Playlist',
              songs,
              artwork: zonicArtworkUrl(playlist),
            ),
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

/// A full, remote-friendly playlist view. It deliberately avoids dense phone
/// controls: every important action has a large focusable target.
class _TvPlaylistPage extends StatelessWidget {
  const _TvPlaylistPage({
    required this.title,
    required this.songs,
    this.artwork,
  });

  final String title;
  final List<Map> songs;
  final String? artwork;

  Future<void> _play(int index) =>
      musify.audioHandler.playBrowserPlaylist(songs, songIndex: index);

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: FocusTraversalGroup(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(56, 28, 56, 70),
          children: [
            Row(
              children: [
                IconButton.filled(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.arrow_back_rounded),
                ),
                const SizedBox(width: 22),
                ZonicArtwork(url: artwork, size: 112, radius: 18),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 38,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '${songs.length} songs',
                        style: const TextStyle(fontSize: 20, color: zonicMuted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 28),
            Wrap(
              spacing: 16,
              runSpacing: 12,
              children: [
                ZonicSurfaceButton(
                  autofocus: true,
                  selected: true,
                  onPressed: songs.isEmpty ? () {} : () => unawaited(_play(0)),
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.play_arrow_rounded),
                        SizedBox(width: 8),
                        Text('Play', style: TextStyle(fontSize: 20)),
                      ],
                    ),
                  ),
                ),
                ZonicSurfaceButton(
                  onPressed: songs.isEmpty
                      ? () {}
                      : () {
                          final shuffled = List<Map>.from(songs)..shuffle();
                          unawaited(
                            musify.audioHandler.playBrowserPlaylist(
                              shuffled,
                              songIndex: 0,
                            ),
                          );
                        },
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.shuffle_rounded),
                        SizedBox(width: 8),
                        Text('Shuffle', style: TextStyle(fontSize: 20)),
                      ],
                    ),
                  ),
                ),
                ZonicSurfaceButton(
                  onPressed: songs.isEmpty
                      ? () {}
                      : () async {
                          for (final song in songs) {
                            await makeSongOffline(song);
                          }
                          if (context.mounted)
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Playlist download started.'),
                              ),
                            );
                        },
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.download_rounded),
                        SizedBox(width: 8),
                        Text('Download', style: TextStyle(fontSize: 20)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 30),
            if (songs.isEmpty)
              const Padding(
                padding: EdgeInsets.all(48),
                child: Center(
                  child: Text(
                    'No songs in this playlist.',
                    style: TextStyle(fontSize: 22, color: zonicMuted),
                  ),
                ),
              )
            else
              ...songs.asMap().entries.map((entry) {
                final song = entry.value;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ZonicSurfaceButton(
                    onPressed: () => unawaited(_play(entry.key)),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 34,
                          child: Text(
                            '${entry.key + 1}',
                            style: const TextStyle(
                              color: zonicMuted,
                              fontSize: 17,
                            ),
                          ),
                        ),
                        ZonicArtwork(
                          url: zonicArtworkUrl(song),
                          size: 60,
                          radius: 10,
                        ),
                        const SizedBox(width: 18),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                song['title']?.toString() ?? 'Song',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 21,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Text(
                                song['artist']?.toString() ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: zonicMuted),
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.play_arrow_rounded, size: 32),
                      ],
                    ),
                  ),
                );
              }),
          ],
        ),
      ),
    ),
  );
}
