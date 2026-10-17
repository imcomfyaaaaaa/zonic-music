import 'dart:async';

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:hive/hive.dart';
import 'package:musify/grove/native_account.dart';
import 'package:musify/grove/native_widgets.dart';
import 'package:musify/localization/app_localizations.dart';
import 'package:musify/main.dart' as musify;
import 'package:musify/screens/equalizer_page.dart';
import 'package:musify/screens/import_spotify_playlist_page.dart';
import 'package:musify/screens/playlist_page.dart';
import 'package:musify/screens/radio_stations_page.dart';
import 'package:musify/screens/settings_page.dart';
import 'package:musify/screens/time_machine_page.dart';
import 'package:musify/services/artist_service.dart';
import 'package:musify/services/common_services.dart';
import 'package:musify/services/playlist_download_service.dart';
import 'package:musify/services/playlists_manager.dart';
import 'package:musify/services/settings_manager.dart';
import 'package:share_plus/share_plus.dart';

class ZonicPhoneApp extends StatefulWidget {
  const ZonicPhoneApp({super.key, required this.legacyBuilder});

  final WidgetBuilder legacyBuilder;

  @override
  State<ZonicPhoneApp> createState() => _ZonicPhoneAppState();
}

class _ZonicPhoneAppState extends State<ZonicPhoneApp> {
  int index = 0;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Zonic',
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    locale: languageSetting,
    theme: ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: zonicBackground,
      colorScheme: const ColorScheme.dark(
        primary: zonicAccent,
        secondary: Color(0xffff6680),
        surface: Color(0xff19181f),
      ),
      navigationBarTheme: const NavigationBarThemeData(
        labelTextStyle: WidgetStatePropertyAll(TextStyle(fontSize: 11)),
      ),
    ),
    home: Builder(
      builder: (context) => Scaffold(
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              _PhoneHeader(
                onSettings: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) =>
                        _NativeSettings(legacyBuilder: widget.legacyBuilder),
                  ),
                ),
              ),
              Expanded(
                child: IndexedStack(
                  index: index,
                  children: const [
                    _HomePage(),
                    _BrowsePage(),
                    _ArtistsPage(),
                    _LibraryPage(),
                  ],
                ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
              child: ZonicMiniPlayer(
                onExpand: () => Navigator.of(
                  context,
                ).push(MaterialPageRoute(builder: (_) => const _FullPlayer())),
              ),
            ),
            ZonicPhoneNavigation(
              index: index,
              onChanged: (value) => setState(() => index = value),
            ),
          ],
        ),
      ),
    ),
  );
}

class _PhoneHeader extends StatelessWidget {
  const _PhoneHeader({required this.onSettings});

  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 10, 12, 8),
    child: Row(
      children: [
        const Text(
          'zonic',
          style: TextStyle(fontSize: 36, fontWeight: FontWeight.w900),
        ),
        const Spacer(),
        IconButton(
          tooltip: 'Queue',
          onPressed: () => _showQueue(context),
          icon: const Icon(Icons.queue_music_rounded),
        ),
        IconButton(
          tooltip: 'Account, sync, imports and settings',
          onPressed: onSettings,
          icon: const Icon(Icons.settings_rounded),
        ),
      ],
    ),
  );
}

class _NativeSettings extends StatefulWidget {
  const _NativeSettings({required this.legacyBuilder});
  final WidgetBuilder legacyBuilder;
  @override
  State<_NativeSettings> createState() => _NativeSettingsState();
}

class _NativeSettingsState extends State<_NativeSettings> {
  final account = ZonicAccountService();

  Future<void> _account({required bool create}) async {
    final email = TextEditingController();
    final password = TextEditingController();
    var accepted = false;
    String? error;
    var busy = false;
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          title: Text(create ? 'Create Zonic account' : 'Log in to Zonic'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email'),
              ),
              TextField(
                controller: password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password'),
              ),
              if (create)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: accepted,
                  onChanged: busy
                      ? null
                      : (value) => update(() => accepted = value == true),
                  title: const Text(
                    'I agree to the Terms of Use and Privacy Policy.',
                  ),
                ),
              if (error != null)
                Text(error!, style: const TextStyle(color: Colors.redAccent)),
            ],
          ),
          actions: [
            TextButton(
              onPressed: busy ? null : () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: busy || create && !accepted
                  ? null
                  : () async {
                      update(() {
                        busy = true;
                        error = null;
                      });
                      try {
                        if (create) {
                          await account.signUp(email.text, password.text);
                        } else {
                          await account.signIn(email.text, password.text);
                        }
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
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(create ? 'Create account' : 'Log in'),
            ),
          ],
        ),
      ),
    );
    email.dispose();
    password.dispose();
  }

  Future<void> _save(
    String key,
    ValueNotifier<bool> notifier,
    bool value,
  ) async {
    notifier.value = value;
    await Hive.box('settings').put(key, value);
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Settings')),
    body: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _SettingsCard(
          title: 'Account',
          child: account.signedIn
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(account.session!.email),
                    const SizedBox(height: 6),
                    Text(
                      'TV pairing code: ${account.session!.pairingCode}',
                      style: const TextStyle(color: zonicMuted),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () async {
                        await account.signOut();
                        if (mounted) setState(() {});
                      },
                      child: const Text('Sign out'),
                    ),
                  ],
                )
              : Wrap(
                  spacing: 10,
                  children: [
                    FilledButton(
                      onPressed: () => _account(create: false),
                      child: const Text('Log in'),
                    ),
                    OutlinedButton(
                      onPressed: () => _account(create: true),
                      child: const Text('Create account'),
                    ),
                  ],
                ),
        ),
        _SettingsCard(
          title: 'Playback',
          child: Column(
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Autoplay'),
                value: playNextSongAutomatically.value,
                onChanged: (value) => _save(
                  'playNextSongAutomatically',
                  playNextSongAutomatically,
                  value,
                ),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('SponsorBlock'),
                value: sponsorBlockSupport.value,
                onChanged: (value) =>
                    _save('sponsorBlockSupport', sponsorBlockSupport, value),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Offline mode'),
                value: offlineMode.value,
                onChanged: (value) => _save('offlineMode', offlineMode, value),
              ),
            ],
          ),
        ),
        _SettingsCard(
          title: 'Advanced features',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Equalizer, listening history, radio, downloads, imports, sleep timer, and playlist tools.',
                style: TextStyle(color: zonicMuted),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) =>
                        _AdvancedFeatures(legacyBuilder: widget.legacyBuilder),
                  ),
                ),
                icon: const Icon(Icons.tune_rounded),
                label: const Text('Open advanced features'),
              ),
            ],
          ),
        ),
        _SettingsCard(
          title: 'Transfer tools',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Dropbox, backup, and playlist imports remain available during their native migration.',
                style: TextStyle(color: zonicMuted),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: () =>
                    Navigator.of(context)
                        .push(MaterialPageRoute(builder: widget.legacyBuilder)),
                icon: const Icon(Icons.swap_horiz_rounded),
                label: const Text('Open transfer tools'),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _AdvancedFeatures extends StatelessWidget {
  const _AdvancedFeatures({required this.legacyBuilder});

  final WidgetBuilder legacyBuilder;

  void _open(BuildContext context, Widget page) =>
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));

  Future<void> _sleepTimer(BuildContext context) async {
    final choice = await showModalBottomSheet<Object>(
      context: context,
      backgroundColor: const Color(0xff17161b),
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text(
                'Sleep timer',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
            ),
            for (final minutes in const [15, 30, 45, 60, 90])
              ListTile(
                leading: const Icon(Icons.timer_outlined),
                title: Text('$minutes minutes'),
                onTap: () => Navigator.pop(sheetContext, minutes),
              ),
            ListTile(
              leading: const Icon(Icons.music_off_rounded),
              title: const Text('End of current song'),
              onTap: () => Navigator.pop(sheetContext, 'song'),
            ),
            ListTile(
              leading: const Icon(Icons.timer_off_outlined),
              title: const Text('Turn timer off'),
              onTap: () => Navigator.pop(sheetContext, 'off'),
            ),
          ],
        ),
      ),
    );
    if (choice is int) {
      await musify.audioHandler.setSleepTimer(Duration(minutes: choice));
    } else if (choice == 'song') {
      await musify.audioHandler.setSleepTimerEndOfSong();
    } else if (choice == 'off') {
      musify.audioHandler.cancelSleepTimer();
    } else {
      return;
    }
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            choice == 'off'
                ? 'Sleep timer turned off.'
                : 'Sleep timer updated.',
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Advanced features')),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        _AdvancedTile(
          icon: Icons.equalizer_rounded,
          title: 'Equalizer',
          subtitle: 'Presets and individual frequency bands',
          onTap: () => _open(context, const EqualizerPage()),
        ),
        _AdvancedTile(
          icon: Icons.bedtime_rounded,
          title: 'Sleep timer',
          subtitle: 'Stop after a time or at the end of the song',
          onTap: () => _sleepTimer(context),
        ),
        _AdvancedTile(
          icon: Icons.history_rounded,
          title: 'Listening history',
          subtitle: 'Songs you recently played',
          onTap: () => _open(
            context,
            const _NativeCollectionPage(kind: _CollectionKind.recent),
          ),
        ),
        _AdvancedTile(
          icon: Icons.auto_graph_rounded,
          title: 'Time Machine & statistics',
          subtitle: 'Monthly and yearly listening recaps',
          onTap: () => _open(context, const TimeMachinePage()),
        ),
        _AdvancedTile(
          icon: Icons.radio_rounded,
          title: 'Radio stations',
          subtitle: 'Live music radio and saved stations',
          onTap: () => _open(context, const RadioStationsPage()),
        ),
        _AdvancedTile(
          icon: Icons.download_done_rounded,
          title: 'Downloaded songs',
          subtitle: 'Manage music available offline',
          onTap: () => _open(
            context,
            const _NativeCollectionPage(kind: _CollectionKind.offline),
          ),
        ),
        _AdvancedTile(
          icon: Icons.table_view_rounded,
          title: 'Import Spotify CSV',
          subtitle: 'Turn an exported Spotify list into a Zonic playlist',
          onTap: () => _open(context, const ImportSpotifyPlaylistPage()),
        ),
        _AdvancedTile(
          icon: Icons.settings_suggest_rounded,
          title: 'Playback, proxy & updates',
          subtitle: 'All engine, quality, proxy and update controls',
          onTap: () => _open(context, const SettingsPage()),
        ),
        _AdvancedTile(
          icon: Icons.cloud_sync_rounded,
          title: 'Cloud, backup & YouTube import',
          subtitle: 'Dropbox sync, archives and linked playlist transfers',
          onTap: () => _open(context, Builder(builder: legacyBuilder)),
        ),
      ],
    ),
  );
}

class _AdvancedTile extends StatelessWidget {
  const _AdvancedTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    color: const Color(0xff19181f),
    clipBehavior: Clip.antiAlias,
    child: ListTile(
      minVerticalPadding: 14,
      leading: Container(
        width: 46,
        height: 46,
        decoration: BoxDecoration(
          color: zonicAccent.withValues(alpha: .14),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Icon(icon, color: zonicAccent),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(subtitle, style: const TextStyle(color: zonicMuted)),
      trailing: const Icon(Icons.chevron_right_rounded),
      onTap: onTap,
    ),
  );
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.title, required this.child});
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: const Color(0xff19181f),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: const Color(0xff302d39)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 12),
        child,
      ],
    ),
  );
}

class _HomePage extends StatelessWidget {
  const _HomePage();

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(20, 14, 20, 30),
    children: [
      const Text(
        'Your music, your space.',
        style: TextStyle(fontSize: 31, fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 8),
      const Text(
        'Pick up where you left off or start something new.',
        style: TextStyle(fontSize: 15, color: zonicMuted),
      ),
      const SizedBox(height: 24),
      ValueListenableBuilder<List>(
        valueListenable: userRecentlyPlayed,
        builder: (_, songs, _) => _SongSection(
          title: 'Recently played',
          songs: songs.whereType<Map>().take(8).toList(),
        ),
      ),
      const SizedBox(height: 28),
      ValueListenableBuilder<List<Map>>(
        valueListenable: userCustomPlaylists,
        builder: (_, playlists, _) => _PlaylistSection(playlists: playlists),
      ),
    ],
  );
}

class _BrowsePage extends StatefulWidget {
  const _BrowsePage();

  @override
  State<_BrowsePage> createState() => _BrowsePageState();
}

class _BrowsePageState extends State<_BrowsePage> {
  final controller = TextEditingController();
  List<Map> results = [];
  bool loading = false;
  String? error;

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  Future<void> search() async {
    final query = controller.text.trim();
    if (query.isEmpty) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final songs = await fetchSongsList(query);
      if (mounted) setState(() => results = songs.whereType<Map>().toList());
    } catch (searchError) {
      if (mounted) setState(() => error = searchError.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
        child: TextField(
          controller: controller,
          textInputAction: TextInputAction.search,
          onSubmitted: (_) => search(),
          decoration: InputDecoration(
            hintText: 'What do you want to hear?',
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: IconButton(
              onPressed: search,
              icon: const Icon(Icons.arrow_forward_rounded),
            ),
            filled: true,
            fillColor: zonicSurface,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(24),
              borderSide: BorderSide.none,
            ),
          ),
        ),
      ),
      if (loading) const LinearProgressIndicator(minHeight: 2),
      if (error != null)
        Padding(
          padding: const EdgeInsets.all(20),
          child: Text(error!, style: const TextStyle(color: Colors.redAccent)),
        ),
      Expanded(
        child: results.isEmpty && !loading
            ? const Center(
                child: Text(
                  'Search songs and artists',
                  style: TextStyle(color: zonicMuted),
                ),
              )
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(12, 4, 12, 30),
                itemCount: results.length,
                itemBuilder: (_, i) => _SongTile(
                  song: results[i],
                  onTap: () => musify.audioHandler.playBrowserPlaylist(
                    results,
                    songIndex: i,
                  ),
                ),
              ),
      ),
    ],
  );
}

class _ArtistsPage extends StatefulWidget {
  const _ArtistsPage();

  @override
  State<_ArtistsPage> createState() => _ArtistsPageState();
}

class _ArtistsPageState extends State<_ArtistsPage> {
  final controller = TextEditingController();
  List<Map<String, dynamic>> artists = [];
  bool loading = false;

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  Future<void> search() async {
    if (controller.text.trim().isEmpty) return;
    setState(() => loading = true);
    final value = await searchVerifiedArtists(controller.text, limit: 20);
    if (mounted) {
      setState(() {
        artists = value;
        loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(20, 14, 20, 30),
    children: [
      const Text(
        'Artists',
        style: TextStyle(fontSize: 31, fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 14),
      TextField(
        controller: controller,
        onSubmitted: (_) => search(),
        decoration: InputDecoration(
          hintText: 'Search artists',
          prefixIcon: const Icon(Icons.person_search_rounded),
          suffixIcon: IconButton(
            onPressed: search,
            icon: const Icon(Icons.search),
          ),
          filled: true,
          fillColor: zonicSurface,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: BorderSide.none,
          ),
        ),
      ),
      if (loading)
        const Padding(
          padding: EdgeInsets.all(30),
          child: Center(child: CircularProgressIndicator()),
        ),
      ...artists.map(
        (artist) => ListTile(
          contentPadding: const EdgeInsets.symmetric(vertical: 6),
          leading: ClipOval(
            child: ZonicArtwork(
              url: zonicArtworkUrl(artist),
              size: 54,
              radius: 27,
            ),
          ),
          title: Text(
            artist['title']?.toString() ??
                artist['name']?.toString() ??
                'Artist',
          ),
          subtitle: const Text('Artist', style: TextStyle(color: zonicMuted)),
          trailing: const Icon(Icons.chevron_right_rounded),
        ),
      ),
    ],
  );
}

class _LibraryPage extends StatelessWidget {
  const _LibraryPage();

  Future<void> _createPlaylist(BuildContext context) async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Create playlist'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(hintText: 'Playlist name'),
          onSubmitted: (value) => Navigator.pop(dialogContext, value.trim()),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.pop(dialogContext, controller.text.trim()),
            child: const Text('Create'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (name == null || name.isEmpty || !context.mounted) return;
    final result = createCustomPlaylist(name, null, context);
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(result.$1)));
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(20, 14, 20, 30),
    children: [
      Row(
        children: [
          const Expanded(
            child: Text(
              'Your Library',
              style: TextStyle(fontSize: 31, fontWeight: FontWeight.w800),
            ),
          ),
          IconButton.filled(
            tooltip: 'Create playlist',
            onPressed: () => _createPlaylist(context),
            icon: const Icon(Icons.add_rounded),
          ),
        ],
      ),
      const SizedBox(height: 18),
      ValueListenableBuilder<List>(
        valueListenable: userLikedSongsList,
        builder: (_, songs, _) => _LibraryRow(
          title: 'Liked Songs',
          subtitle: '${songs.length} songs',
          icon: Icons.favorite_rounded,
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) =>
                  const _NativeCollectionPage(kind: _CollectionKind.liked),
            ),
          ),
          trailing: IconButton(
            tooltip: 'Download Liked Songs',
            onPressed: songs.isEmpty
                ? null
                : () => offlinePlaylistService.downloadPlaylist(context, {
                    'ytid': 'zonic-liked-songs',
                    'title': 'Liked Songs',
                    'source': 'liked',
                    'list': songs.whereType<Map>().toList(),
                  }),
            icon: const Icon(Icons.download_for_offline_outlined),
          ),
        ),
      ),
      ValueListenableBuilder<List<Map>>(
        valueListenable: userCustomPlaylists,
        builder: (_, playlists, _) => Column(
          children: playlists.map((playlist) {
            final songs = (playlist['list'] as List? ?? const [])
                .whereType<Map>()
                .toList();
            return _LibraryRow(
              title: playlist['title']?.toString() ?? 'Playlist',
              subtitle: '${songs.length} songs',
              artwork: zonicArtworkUrl(playlist),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => PlaylistPage(playlistData: playlist),
                ),
              ),
              trailing: IconButton(
                tooltip: 'Download playlist',
                onPressed: songs.isEmpty
                    ? null
                    : () => offlinePlaylistService.downloadPlaylist(
                        context,
                        playlist,
                      ),
                icon: const Icon(Icons.download_for_offline_outlined),
              ),
            );
          }).toList(),
        ),
      ),
    ],
  );
}

enum _CollectionKind { liked, recent, offline }

class _NativeCollectionPage extends StatefulWidget {
  const _NativeCollectionPage({required this.kind});

  final _CollectionKind kind;

  @override
  State<_NativeCollectionPage> createState() => _NativeCollectionPageState();
}

class _NativeCollectionPageState extends State<_NativeCollectionPage> {
  final search = TextEditingController();
  String query = '';

  ValueNotifier<List> get source => switch (widget.kind) {
    _CollectionKind.liked => userLikedSongsList,
    _CollectionKind.recent => userRecentlyPlayed,
    _CollectionKind.offline => userOfflineSongs,
  };

  String get title => switch (widget.kind) {
    _CollectionKind.liked => 'Liked Songs',
    _CollectionKind.recent => 'Recently played',
    _CollectionKind.offline => 'Downloads',
  };

  IconData get icon => switch (widget.kind) {
    _CollectionKind.liked => Icons.favorite_rounded,
    _CollectionKind.recent => Icons.history_rounded,
    _CollectionKind.offline => Icons.download_done_rounded,
  };

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> _downloadAll(List<Map> songs) async {
    if (songs.isEmpty) return;
    await offlinePlaylistService.downloadPlaylist(context, {
      'ytid': 'zonic-liked-songs',
      'title': 'Liked Songs',
      'source': 'liked',
      'list': songs,
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: zonicBackground,
    appBar: AppBar(
      backgroundColor: zonicBackground,
      foregroundColor: Colors.white,
      title: Text(title),
    ),
    body: ValueListenableBuilder<List>(
      valueListenable: source,
      builder: (context, values, _) {
        final allSongs = values.whereType<Map>().toList();
        final normalized = query.trim().toLowerCase();
        final songs = normalized.isEmpty
            ? allSongs
            : allSongs.where((song) {
                final text = '${song['title'] ?? ''} ${song['artist'] ?? ''}'
                    .toLowerCase();
                return text.contains(normalized);
              }).toList();
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 14),
              child: Column(
                children: [
                  Row(
                    children: [
                      Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [Color(0xff7968ef), Color(0xffff6680)],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Icon(icon, size: 34, color: Colors.white),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: const TextStyle(
                                fontSize: 27,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              '${allSongs.length} songs',
                              style: const TextStyle(color: zonicMuted),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: allSongs.isEmpty
                              ? null
                              : () => _playList(allSongs),
                          icon: const Icon(Icons.play_arrow_rounded),
                          label: const Text('Play'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: allSongs.isEmpty
                              ? null
                              : () => musify.audioHandler.addPlaylistToQueue(
                                  allSongs,
                                  replace: true,
                                  shuffle: true,
                                ),
                          icon: const Icon(Icons.shuffle_rounded),
                          label: const Text('Shuffle'),
                        ),
                      ),
                      if (widget.kind == _CollectionKind.liked) ...[
                        const SizedBox(width: 6),
                        IconButton(
                          tooltip: 'Download all',
                          onPressed: allSongs.isEmpty
                              ? null
                              : () => _downloadAll(allSongs),
                          icon: const Icon(Icons.download_for_offline_outlined),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: search,
                    onChanged: (value) => setState(() => query = value),
                    decoration: InputDecoration(
                      hintText: 'Search $title',
                      prefixIcon: const Icon(Icons.search_rounded),
                      filled: true,
                      fillColor: zonicSurface,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(18),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: songs.isEmpty
                  ? Center(
                      child: Text(
                        normalized.isEmpty
                            ? 'No songs here yet.'
                            : 'No matching songs.',
                        style: const TextStyle(color: zonicMuted),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 30),
                      itemCount: songs.length,
                      itemBuilder: (_, index) => _SongTile(
                        song: songs[index],
                        onTap: () => musify.audioHandler.playBrowserPlaylist(
                          songs,
                          songIndex: index,
                        ),
                      ),
                    ),
            ),
          ],
        );
      },
    ),
  );
}

class _FullPlayer extends StatelessWidget {
  const _FullPlayer();

  @override
  Widget build(BuildContext context) => StreamBuilder<PlaybackState>(
    stream: musify.audioHandler.playbackState,
    builder: (context, state) {
      final song = musify.audioHandler.currentSong;
      final playing = state.data?.playing == true;
      return Scaffold(
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          title: const Text('Now playing'),
        ),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              children: [
                const Spacer(),
                LayoutBuilder(
                  builder: (_, constraints) {
                    final size = constraints.maxWidth.clamp(220.0, 380.0);
                    return ZonicArtwork(
                      url: zonicArtworkUrl(song),
                      size: size,
                      radius: 24,
                    );
                  },
                ),
                const SizedBox(height: 30),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    song?['title']?.toString() ?? 'Nothing playing',
                    style: const TextStyle(
                      fontSize: 27,
                      fontWeight: FontWeight.w800,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    song?['artist']?.toString() ?? 'Zonic',
                    style: const TextStyle(fontSize: 17, color: zonicMuted),
                  ),
                ),
                const SizedBox(height: 18),
                StreamBuilder<Duration>(
                  stream: musify.audioHandler.audioPlayer.positionStream,
                  builder: (_, position) {
                    final duration =
                        musify.audioHandler.audioPlayer.duration ??
                        Duration.zero;
                    final max = duration.inMilliseconds
                        .toDouble()
                        .clamp(1.0, double.infinity)
                        .toDouble();
                    return Slider(
                      value:
                          position.data?.inMilliseconds
                              .toDouble()
                              .clamp(0, max)
                              .toDouble() ??
                          0,
                      max: max,
                      onChanged: (value) => musify.audioHandler.seek(
                        Duration(milliseconds: value.round()),
                      ),
                    );
                  },
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    IconButton(
                      tooltip: 'Shuffle',
                      color: shuffleNotifier.value ? zonicAccent : null,
                      onPressed: () => musify.audioHandler.setShuffleMode(
                        shuffleNotifier.value
                            ? AudioServiceShuffleMode.none
                            : AudioServiceShuffleMode.all,
                      ),
                      icon: const Icon(Icons.shuffle_rounded),
                    ),
                    IconButton(
                      iconSize: 42,
                      onPressed: musify.audioHandler.skipToPrevious,
                      icon: const Icon(Icons.skip_previous_rounded),
                    ),
                    FilledButton(
                      style: FilledButton.styleFrom(
                        shape: const CircleBorder(),
                        backgroundColor: Colors.white,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.all(20),
                      ),
                      onPressed: playing
                          ? musify.audioHandler.pause
                          : musify.audioHandler.play,
                      child: Icon(
                        playing
                            ? Icons.pause_rounded
                            : Icons.play_arrow_rounded,
                        size: 42,
                      ),
                    ),
                    IconButton(
                      iconSize: 42,
                      onPressed: musify.audioHandler.skipToNext,
                      icon: const Icon(Icons.skip_next_rounded),
                    ),
                    IconButton(
                      tooltip: 'Repeat',
                      color: repeatNotifier.value != AudioServiceRepeatMode.none
                          ? zonicAccent
                          : null,
                      onPressed: () {
                        final next =
                            repeatNotifier.value == AudioServiceRepeatMode.none
                            ? AudioServiceRepeatMode.all
                            : repeatNotifier.value == AudioServiceRepeatMode.all
                            ? AudioServiceRepeatMode.one
                            : AudioServiceRepeatMode.none;
                        musify.audioHandler.setRepeatMode(next);
                      },
                      icon: Icon(
                        repeatNotifier.value == AudioServiceRepeatMode.one
                            ? Icons.repeat_one_rounded
                            : Icons.repeat_rounded,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    IconButton(
                      tooltip: 'Like',
                      onPressed: song == null
                          ? null
                          : () => updateSongLikeStatus(
                              song['ytid'],
                              !isSongAlreadyLiked(song['ytid']),
                              songData: song,
                            ),
                      icon: Icon(
                        song != null && isSongAlreadyLiked(song['ytid'])
                            ? Icons.favorite_rounded
                            : Icons.favorite_border_rounded,
                      ),
                    ),
                    IconButton(
                      tooltip: 'Lyrics',
                      onPressed: song == null
                          ? null
                          : () => Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => _LyricsPage(song: song),
                              ),
                            ),
                      icon: const Icon(Icons.lyrics_rounded),
                    ),
                    IconButton(
                      tooltip: 'Download',
                      onPressed: song == null
                          ? null
                          : () => _download(context, song),
                      icon: const Icon(Icons.download_rounded),
                    ),
                    IconButton(
                      tooltip: 'More',
                      onPressed: song == null
                          ? null
                          : () => _showSongActions(context, song),
                      icon: const Icon(Icons.more_horiz_rounded),
                    ),
                  ],
                ),
                const Spacer(),
              ],
            ),
          ),
        ),
      );
    },
  );
}

class _SongSection extends StatelessWidget {
  const _SongSection({required this.title, required this.songs});
  final String title;
  final List<Map> songs;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: 12),
      ...songs.asMap().entries.map(
        (entry) => _SongTile(
          song: entry.value,
          onTap: () => musify.audioHandler.playBrowserPlaylist(
            songs,
            songIndex: entry.key,
          ),
        ),
      ),
    ],
  );
}

class _SongTile extends StatelessWidget {
  const _SongTile({required this.song, required this.onTap});
  final Map song;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
    onTap: onTap,
    leading: ZonicArtwork(url: zonicArtworkUrl(song), size: 48, radius: 9),
    title: Text(
      song['title']?.toString() ?? 'Unknown song',
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    ),
    subtitle: Text(
      song['artist']?.toString() ?? 'Unknown artist',
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(color: zonicMuted),
    ),
    trailing: IconButton(
      tooltip: 'Song options',
      onPressed: () => _showSongActions(context, song),
      icon: const Icon(Icons.more_vert_rounded),
    ),
  );
}

class _LyricsPage extends StatefulWidget {
  const _LyricsPage({required this.song});
  final Map song;
  @override
  State<_LyricsPage> createState() => _LyricsPageState();
}

class _LyricsPageState extends State<_LyricsPage> {
  late final Future<String?> value = getSongLyrics(
    widget.song['artist']?.toString(),
    widget.song['title']?.toString() ?? '',
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Lyrics')),
    body: FutureBuilder<String?>(
      future: value,
      builder: (_, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(28, 20, 28, 60),
          child: Text(
            snapshot.data ?? 'Lyrics are not available for this song.',
            style: const TextStyle(
              fontSize: 25,
              height: 1.45,
              fontWeight: FontWeight.w700,
            ),
          ),
        );
      },
    ),
  );
}

class _PlaylistSection extends StatelessWidget {
  const _PlaylistSection({required this.playlists});
  final List<Map> playlists;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const Text(
        'Your playlists',
        style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: 12),
      SizedBox(
        height: 190,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: playlists.length,
          separatorBuilder: (_, _) => const SizedBox(width: 14),
          itemBuilder: (_, i) {
            final playlist = playlists[i];
            final songs = (playlist['list'] as List? ?? const [])
                .whereType<Map>()
                .toList();
            return SizedBox(
              width: 130,
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () => _playList(songs),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ZonicArtwork(url: zonicArtworkUrl(playlist), size: 130),
                    const SizedBox(height: 8),
                    Text(
                      playlist['title']?.toString() ?? 'Playlist',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    ],
  );
}

class _LibraryRow extends StatelessWidget {
  const _LibraryRow({
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.artwork,
    this.icon,
    this.trailing,
  });
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final String? artwork;
  final IconData? icon;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: const EdgeInsets.symmetric(vertical: 5),
    onTap: onTap,
    leading: icon == null
        ? ZonicArtwork(url: artwork, size: 58, radius: 10)
        : Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              gradient: const LinearGradient(
                colors: [Color(0xff7563ef), Color(0xffb7e6ee)],
              ),
            ),
            child: Icon(icon, color: Colors.white),
          ),
    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
    subtitle: Text(subtitle, style: const TextStyle(color: zonicMuted)),
    trailing: trailing,
  );
}

Future<void> _download(BuildContext context, Map song) async {
  final messenger = ScaffoldMessenger.of(context);
  messenger.showSnackBar(const SnackBar(content: Text('Downloading song…')));
  final ok = await makeSongOffline(song);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(content: Text(ok ? 'Song downloaded.' : 'Download failed.')),
  );
}

Future<void> _addSongToPlaylist(BuildContext context, Map song) async {
  final playlists = userCustomPlaylists.value
      .where((playlist) => playlist['source'] == null)
      .toList();
  if (playlists.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Create a Zonic playlist first.')),
    );
    return;
  }
  final selected = await showModalBottomSheet<Map>(
    context: context,
    backgroundColor: const Color(0xff17161b),
    showDragHandle: true,
    builder: (_) => ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 30),
      children: [
        const Text(
          'Add to playlist',
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 12),
        ...playlists.map(
          (playlist) => ListTile(
            leading: ZonicArtwork(
              url: zonicArtworkUrl(playlist),
              size: 48,
              radius: 9,
            ),
            title: Text(playlist['title']?.toString() ?? 'Playlist'),
            onTap: () => Navigator.pop(context, playlist),
          ),
        ),
      ],
    ),
  );
  if (selected == null) return;
  final updated = userCustomPlaylists.value
      .map((playlist) => Map<String, dynamic>.from(playlist))
      .toList();
  final index = updated.indexWhere(
    (playlist) => playlist['ytid'] == selected['ytid'],
  );
  if (index < 0) return;
  final songs = List<Map>.from(updated[index]['list'] as List? ?? const []);
  final id = song['ytid']?.toString();
  if (!songs.any((item) => item['ytid']?.toString() == id)) {
    songs.add(Map<String, dynamic>.from(song));
    updated[index]['list'] = songs;
    userCustomPlaylists.value = updated;
    await Hive.box('user').put('customPlaylists', updated);
  }
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Added to ${selected['title'] ?? 'playlist'}.')),
    );
  }
}

void _showSongActions(BuildContext context, Map song) {
  final liked = isSongAlreadyLiked(song['ytid']);
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: const Color(0xff17161b),
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: Wrap(
        children: [
          ListTile(
            leading: const Icon(Icons.playlist_play_rounded),
            title: const Text('Play next'),
            onTap: () {
              Navigator.pop(sheetContext);
              musify.audioHandler.addToQueue(song, playNext: true);
            },
          ),
          ListTile(
            leading: const Icon(Icons.queue_music_rounded),
            title: const Text('Add to queue'),
            onTap: () {
              Navigator.pop(sheetContext);
              musify.audioHandler.addToQueue(song);
            },
          ),
          ListTile(
            leading: const Icon(Icons.playlist_add_rounded),
            title: const Text('Add to playlist'),
            onTap: () {
              Navigator.pop(sheetContext);
              _addSongToPlaylist(context, song);
            },
          ),
          ListTile(
            leading: Icon(
              liked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
            ),
            title: Text(
              liked ? 'Remove from Liked Songs' : 'Add to Liked Songs',
            ),
            onTap: () {
              Navigator.pop(sheetContext);
              updateSongLikeStatus(song['ytid'], !liked, songData: song);
            },
          ),
          ListTile(
            leading: const Icon(Icons.lyrics_rounded),
            title: const Text('Lyrics'),
            onTap: () {
              Navigator.pop(sheetContext);
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => _LyricsPage(song: song)),
              );
            },
          ),
          ListTile(
            leading: const Icon(Icons.download_rounded),
            title: const Text('Download'),
            onTap: () {
              Navigator.pop(sheetContext);
              _download(context, song);
            },
          ),
          ListTile(
            leading: const Icon(Icons.share_rounded),
            title: const Text('Share'),
            onTap: () {
              Navigator.pop(sheetContext);
              final ytid = song['ytid']?.toString() ?? '';
              SharePlus.instance.share(
                ShareParams(
                  text: ytid.isEmpty
                      ? '${song['title']} — ${song['artist']}'
                      : 'https://music.youtube.com/watch?v=$ytid',
                ),
              );
            },
          ),
        ],
      ),
    ),
  );
}

Future<void> _playList(List<Map> songs) async {
  if (songs.isNotEmpty)
    await musify.audioHandler.playBrowserPlaylist(songs, songIndex: 0);
}

void _showQueue(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: const Color(0xff17161b),
    showDragHandle: true,
    builder: (_) => ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 30),
      children: [
        const Text(
          'Up next',
          style: TextStyle(fontSize: 25, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 12),
        ...musify.audioHandler.browserQueue.asMap().entries.map(
          (entry) => _SongTile(
            song: entry.value,
            onTap: () => musify.audioHandler.skipToQueueItem(entry.key),
          ),
        ),
      ],
    ),
  );
}
