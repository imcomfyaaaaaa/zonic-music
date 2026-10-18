import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:audio_service/audio_service.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:hive/hive.dart';
import 'package:http/http.dart' as http;
import 'package:musify/grove/native_account.dart';
import 'package:musify/grove/native_widgets.dart';
import 'package:musify/localization/app_localizations.dart';
import 'package:musify/main.dart' as musify;
import 'package:musify/screens/equalizer_page.dart';
import 'package:musify/screens/import_spotify_playlist_page.dart';
import 'package:musify/screens/radio_stations_page.dart';
import 'package:musify/screens/settings_page.dart';
import 'package:musify/screens/time_machine_page.dart';
import 'package:musify/services/artist_service.dart';
import 'package:musify/services/common_services.dart';
import 'package:musify/services/data_manager.dart';
import 'package:musify/services/io_service.dart';
import 'package:musify/services/playlist_download_service.dart';
import 'package:musify/services/playlists_manager.dart';
import 'package:musify/services/settings_manager.dart';
import 'package:musify/services/update_manager.dart';
import 'package:musify/utilities/offline_playlist_dialogs.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

class ZonicPhoneApp extends StatefulWidget {
  const ZonicPhoneApp({super.key});

  @override
  State<ZonicPhoneApp> createState() => _ZonicPhoneAppState();
}

class _ZonicPhoneAppState extends State<ZonicPhoneApp> {
  int index = 0;
  bool _checkedForUpdate = false;
  StreamSubscription<Uri?>? _dropboxLinks;

  @override
  void initState() {
    super.initState();
    _dropboxLinks = musify.appLinks.uriLinkStream.listen(_cacheDropboxLink);
    unawaited(_cacheInitialDropboxLink());
  }

  @override
  void dispose() {
    _dropboxLinks?.cancel();
    super.dispose();
  }

  Future<void> _cacheInitialDropboxLink() async {
    try {
      await _cacheDropboxLink(await musify.appLinks.getInitialLink());
    } catch (_) {}
  }

  Future<void> _cacheDropboxLink(Uri? uri) async {
    if (uri?.scheme != 'grove' ||
        uri?.host != 'dropbox' ||
        uri?.path != '/callback') {
      return;
    }
    await Hive.box('userNoBackup')
        .put('zonicPendingDropboxLink', uri.toString());
  }

  void _autoCheck(BuildContext context) {
    if (_checkedForUpdate || offlineMode.value) return;
    _checkedForUpdate = true;
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => checkAppUpdates(displayContext: context),
    );
  }

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
      appBarTheme: const AppBarTheme(
        backgroundColor: zonicBackground,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: zonicSurface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: Color(0xff35323e)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: zonicSurface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: zonicAccent, width: 2),
        ),
      ),
    ),
    home: Builder(
      builder: (context) {
        _autoCheck(context);
        return Scaffold(
          body: SafeArea(
            bottom: false,
            child: Column(
              children: [
                _PhoneHeader(
                  onSettings: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const _NativeSettings()),
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
                  onExpand: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const _FullPlayer()),
                  ),
                ),
              ),
              ZonicPhoneNavigation(
                index: index,
                onChanged: (value) => setState(() => index = value),
              ),
            ],
          ),
        );
      },
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
        const _ZonicWordmark(fontSize: 36),
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

class _ZonicWordmark extends StatelessWidget {
  const _ZonicWordmark({required this.fontSize});
  final double fontSize;

  @override
  Widget build(BuildContext context) => RichText(
    text: TextSpan(
      style: TextStyle(
        fontSize: fontSize,
        fontWeight: FontWeight.w900,
        letterSpacing: -1.5,
      ),
      children: const [
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
  );
}

class _NativeSettings extends StatefulWidget {
  const _NativeSettings();
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
          title: 'App updates',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Zonic checks GitHub releases automatically when the app opens.',
                style: TextStyle(color: zonicMuted),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => checkAppUpdates(
                  displayContext: context,
                  showNoUpdate: true,
                ),
                icon: const Icon(Icons.system_update_rounded),
                label: const Text('Check for updates now'),
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
                  MaterialPageRoute(builder: (_) => const _AdvancedFeatures()),
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
                'Import YouTube playlists, back up your library, and connect Dropbox without opening the old web interface.',
                style: TextStyle(color: zonicMuted),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const _NativeTransferPage(),
                  ),
                ),
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
  const _AdvancedFeatures();

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
          onTap: () => _open(context, const _NativeTransferPage()),
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
          trailing: _PlaylistDownloadButton(
            playlist: const {
              'ytid': 'zonic-liked-songs',
              'title': 'Liked Songs',
              'source': 'liked',
            },
            songs: songs.whereType<Map>().toList(),
            compact: true,
          ),
        ),
      ),
      ValueListenableBuilder<List<dynamic>>(
        valueListenable: offlinePlaylistService.offlinePlaylists,
        builder: (context, offlineLists, _) {
          final count = offlineLists.length;
          return _LibraryRow(
            title: 'Downloads',
            subtitle: count > 0
                ? '$count downloaded playlist${count == 1 ? '' : 's'} & songs'
                : 'Downloaded songs and playlists',
            icon: Icons.download_done_rounded,
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) =>
                    const _NativeCollectionPage(kind: _CollectionKind.offline),
              ),
            ),
          );
        },
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
                  builder: (_) => _NativePlaylistPage(
                    playlistId: playlist['ytid']?.toString() ?? '',
                  ),
                ),
              ),
              trailing: _PlaylistDownloadButton(
                playlist: playlist,
                songs: songs,
                compact: true,
              ),
            );
          }).toList(),
        ),
      ),
    ],
  );
}

class _PlaylistDownloadButton extends StatelessWidget {
  const _PlaylistDownloadButton({
    required this.playlist,
    required this.songs,
    this.compact = false,
  });

  final Map playlist;
  final List<Map> songs;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final playlistId =
        playlist['ytid']?.toString() ?? playlist['title']?.toString() ?? '';
    if (playlistId.isEmpty) return const SizedBox.shrink();

    return ValueListenableBuilder<List<dynamic>>(
      valueListenable: offlinePlaylistService.offlinePlaylists,
      builder: (context, _, __) {
        final isDownloaded =
            offlinePlaylistService.isPlaylistDownloaded(playlistId) ||
            (songs.isNotEmpty && isPlaylistFullyOffline(songs));

        return ValueListenableBuilder<DownloadProgress>(
          valueListenable: offlinePlaylistService.getProgressNotifier(
            playlistId,
          ),
          builder: (context, progress, _) {
            final isDownloading = offlinePlaylistService.isPlaylistDownloading(
              playlistId,
            );

            if (isDownloading) {
              final percent = progress.total > 0
                  ? ' (${progress.completed}/${progress.total})'
                  : '';
              if (compact) {
                return Tooltip(
                  message: 'Downloading$percent · Tap to cancel',
                  child: IconButton(
                    onPressed: () => offlinePlaylistService.cancelDownload(
                      context,
                      playlistId,
                    ),
                    icon: const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2.2),
                    ),
                  ),
                );
              }
              return OutlinedButton.icon(
                onPressed: () =>
                    offlinePlaylistService.cancelDownload(context, playlistId),
                icon: const SizedBox.square(
                  dimension: 18,
                  child: CircularProgressIndicator(strokeWidth: 2.2),
                ),
                label: Text('Downloading$percent · Cancel'),
              );
            }

            if (isDownloaded) {
              if (compact) {
                return Tooltip(
                  message: 'Downloaded · Tap to remove',
                  child: IconButton(
                    onPressed: () =>
                        showRemoveOfflinePlaylistDialog(context, playlistId),
                    icon: const Icon(
                      Icons.download_done_rounded,
                      color: Color(0xff9ff0bd),
                    ),
                  ),
                );
              }
              return OutlinedButton.icon(
                onPressed: () =>
                    showRemoveOfflinePlaylistDialog(context, playlistId),
                icon: const Icon(
                  Icons.download_done_rounded,
                  color: Color(0xff9ff0bd),
                ),
                label: const Text(
                  'Downloaded',
                  style: TextStyle(color: Color(0xff9ff0bd)),
                ),
              );
            }

            if (compact) {
              return Tooltip(
                message: 'Download playlist',
                child: IconButton(
                  onPressed: songs.isEmpty
                      ? null
                      : () => offlinePlaylistService.downloadPlaylist(
                          context,
                          playlist,
                        ),
                  icon: const Icon(Icons.download_for_offline_outlined),
                ),
              );
            }

            return FilledButton.icon(
              onPressed: songs.isEmpty
                  ? null
                  : () => offlinePlaylistService.downloadPlaylist(
                      context,
                      playlist,
                    ),
              icon: const Icon(Icons.download_for_offline_outlined),
              label: const Text('Download playlist'),
            );
          },
        );
      },
    );
  }
}

class _NativePlaylistPage extends StatefulWidget {
  const _NativePlaylistPage({required this.playlistId});

  final String playlistId;

  @override
  State<_NativePlaylistPage> createState() => _NativePlaylistPageState();
}

class _NativePlaylistPageState extends State<_NativePlaylistPage> {
  final search = TextEditingController();
  String query = '';

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  Future<void> _rename(Map playlist) async {
    final controller = TextEditingController(
      text: playlist['title']?.toString() ?? '',
    );
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Rename playlist'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 80,
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
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (name == null || name.isEmpty) return;
    final updated = userCustomPlaylists.value
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final index = updated.indexWhere(
      (item) => item['ytid']?.toString() == widget.playlistId,
    );
    if (index < 0) return;
    updated[index]['title'] = name;
    userCustomPlaylists.value = updated;
    await Hive.box('user').put('customPlaylists', updated);
  }

  Future<void> _addLikedSong(Map playlist) async {
    final candidates = userLikedSongsList.value.whereType<Map>().toList();
    if (candidates.isEmpty) {
      _notice('Like songs first, then add them here.');
      return;
    }
    final selected = await showModalBottomSheet<Map>(
      context: context,
      backgroundColor: const Color(0xff17161b),
      showDragHandle: true,
      builder: (_) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(14, 0, 14, 28),
          children: [
            const ListTile(
              title: Text(
                'Add liked song',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
              ),
              subtitle: Text('Choose a song to add to this playlist.'),
            ),
            ...candidates.map(
              (song) => ListTile(
                leading: ZonicArtwork(
                  url: zonicArtworkUrl(song),
                  size: 46,
                  radius: 9,
                ),
                title: Text(song['title']?.toString() ?? 'Song'),
                subtitle: Text(song['artist']?.toString() ?? ''),
                onTap: () => Navigator.pop(context, song),
              ),
            ),
          ],
        ),
      ),
    );
    if (selected == null) return;
    final updated = userCustomPlaylists.value
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final index = updated.indexWhere(
      (item) => item['ytid']?.toString() == widget.playlistId,
    );
    if (index < 0) return;
    final songs = List<Map>.from(updated[index]['list'] as List? ?? const []);
    final id = selected['ytid']?.toString();
    if (songs.any((song) => song['ytid']?.toString() == id)) {
      _notice('That song is already in this playlist.');
      return;
    }
    songs.add(Map<String, dynamic>.from(selected));
    updated[index]['list'] = songs;
    userCustomPlaylists.value = updated;
    await Hive.box('user').put('customPlaylists', updated);
    _notice('Added to ${playlist['title'] ?? 'playlist'}.');
  }

  void _notice(String text) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<List<Map>>(
    valueListenable: userCustomPlaylists,
    builder: (context, allPlaylists, _) {
      final playlist =
          allPlaylists.cast<Map?>().firstWhere(
            (item) => item?['ytid']?.toString() == widget.playlistId,
            orElse: () => null,
          ) ??
          offlinePlaylistService.getOfflinePlaylist(widget.playlistId);
      if (playlist == null) {
        return Scaffold(
          backgroundColor: zonicBackground,
          appBar: AppBar(backgroundColor: zonicBackground),
          body: const Center(
            child: Text('This playlist is no longer available.'),
          ),
        );
      }
      final songs = (playlist['list'] as List? ?? const [])
          .whereType<Map>()
          .toList();
      final term = query.trim().toLowerCase();
      final visible = term.isEmpty
          ? songs
          : songs
                .where(
                  (song) => '${song['title'] ?? ''} ${song['artist'] ?? ''}'
                      .toLowerCase()
                      .contains(term),
                )
                .toList();
      final title = playlist['title']?.toString() ?? 'Playlist';
      return Scaffold(
        backgroundColor: zonicBackground,
        appBar: AppBar(
          backgroundColor: zonicBackground,
          foregroundColor: Colors.white,
          title: const Text('Playlist'),
          actions: [
            IconButton(
              tooltip: 'Rename playlist',
              onPressed: () => _rename(playlist),
              icon: const Icon(Icons.edit_rounded),
            ),
          ],
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 2, 20, 14),
              child: Row(
                children: [
                  ZonicArtwork(
                    url: zonicArtworkUrl(playlist),
                    size: 106,
                    radius: 22,
                  ),
                  const SizedBox(width: 18),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          '${songs.length} songs · Zonic playlist',
                          style: const TextStyle(color: zonicMuted),
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            FilledButton.icon(
                              onPressed: songs.isEmpty
                                  ? null
                                  : () => _playList(songs),
                              icon: const Icon(Icons.play_arrow_rounded),
                              label: const Text('Play'),
                            ),
                            OutlinedButton.icon(
                              onPressed: songs.isEmpty
                                  ? null
                                  : () =>
                                        musify.audioHandler.addPlaylistToQueue(
                                          songs,
                                          replace: true,
                                          shuffle: true,
                                        ),
                              icon: const Icon(Icons.shuffle_rounded),
                              label: const Text('Shuffle'),
                            ),
                            _PlaylistDownloadButton(
                              playlist: playlist,
                              songs: songs,
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _addLikedSong(playlist),
                      icon: const Icon(Icons.playlist_add_rounded),
                      label: const Text('Add liked song'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    tooltip: 'Share playlist',
                    onPressed: () => SharePlus.instance.share(
                      ShareParams(text: 'Zonic playlist: $title'),
                    ),
                    icon: const Icon(Icons.share_rounded),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            if (songs.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: TextField(
                  controller: search,
                  onChanged: (value) => setState(() => query = value),
                  decoration: InputDecoration(
                    hintText: 'Search this playlist',
                    prefixIcon: const Icon(Icons.search_rounded),
                    filled: true,
                    fillColor: zonicSurface,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(18),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),
            Expanded(
              child: songs.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.queue_music_rounded,
                            size: 56,
                            color: zonicAccent,
                          ),
                          const SizedBox(height: 14),
                          const Text(
                            'This playlist is ready for music.',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Add songs you have liked, then play them here.',
                            style: TextStyle(color: zonicMuted),
                          ),
                          const SizedBox(height: 18),
                          FilledButton.icon(
                            onPressed: () => _addLikedSong(playlist),
                            icon: const Icon(Icons.add_rounded),
                            label: const Text('Add a song'),
                          ),
                        ],
                      ),
                    )
                  : visible.isEmpty
                  ? const Center(
                      child: Text(
                        'No matching songs.',
                        style: TextStyle(color: zonicMuted),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(12, 0, 12, 30),
                      itemCount: visible.length,
                      itemBuilder: (_, index) => _SongTile(
                        song: visible[index],
                        onTap: () => musify.audioHandler.playBrowserPlaylist(
                          // Keep the complete playlist as the queue—even if
                          // the user found the song through the in-playlist
                          // search box—then begin at the tapped song.
                          songs,
                          songIndex: songs.indexOf(visible[index]),
                        ),
                      ),
                    ),
            ),
          ],
        ),
      );
    },
  );
}

enum _CollectionKind { liked, recent, offline }

class _DownloadStorageUsage {
  const _DownloadStorageUsage({required this.bytes});

  final int bytes;
}

class _NativeCollectionPage extends StatefulWidget {
  const _NativeCollectionPage({required this.kind});

  final _CollectionKind kind;

  @override
  State<_NativeCollectionPage> createState() => _NativeCollectionPageState();
}

class _NativeCollectionPageState extends State<_NativeCollectionPage> {
  final search = TextEditingController();
  String query = '';
  late final Future<_DownloadStorageUsage> _storageUsage;

  @override
  void initState() {
    super.initState();
    _storageUsage = _readDownloadStorageUsage();
  }

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

  Future<_DownloadStorageUsage> _readDownloadStorageUsage() async {
    var bytes = 0;
    for (final directoryName in [FilePaths.tracksDir, FilePaths.artworksDir]) {
      final directory = Directory('${applicationDirPath}/$directoryName');
      if (!await directory.exists()) continue;
      await for (final entity in directory.list(recursive: true)) {
        if (entity is File) {
          try {
            bytes += await entity.length();
          } catch (_) {}
        }
      }
    }
    return _DownloadStorageUsage(bytes: bytes);
  }

  String _formatStorage(int bytes) {
    if (bytes < 1024 * 1024) return '${(bytes / 1024).ceil()} KB';
    if (bytes < 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
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
                            if (widget.kind == _CollectionKind.offline)
                              FutureBuilder<_DownloadStorageUsage>(
                                future: _storageUsage,
                                builder: (_, snapshot) {
                                  if (!snapshot.hasData) {
                                    return const Padding(
                                      padding: EdgeInsets.only(top: 4),
                                      child: Text(
                                        'Calculating storage…',
                                        style: TextStyle(color: zonicMuted),
                                      ),
                                    );
                                  }
                                  return Padding(
                                    padding: const EdgeInsets.only(top: 4),
                                    child: Text(
                                      '${_formatStorage(snapshot.data!.bytes)} used on this device',
                                      style: const TextStyle(
                                        color: zonicAccent,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  );
                                },
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
                    ],
                  ),
                  if (widget.kind == _CollectionKind.liked) ...[
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: _PlaylistDownloadButton(
                        playlist: const {
                          'ytid': 'zonic-liked-songs',
                          'title': 'Liked Songs',
                          'source': 'liked',
                        },
                        songs: allSongs,
                      ),
                    ),
                  ],
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
              child: widget.kind == _CollectionKind.offline
                  ? ValueListenableBuilder<List<dynamic>>(
                      valueListenable: offlinePlaylistService.offlinePlaylists,
                      builder: (context, offlineLists, _) {
                        final downloadedPlaylists = offlineLists
                            .whereType<Map>()
                            .toList();
                        if (songs.isEmpty && downloadedPlaylists.isEmpty) {
                          return Center(
                            child: Text(
                              normalized.isEmpty
                                  ? 'No offline songs or playlists yet.'
                                  : 'No matching songs.',
                              style: const TextStyle(color: zonicMuted),
                            ),
                          );
                        }
                        return ListView(
                          padding: const EdgeInsets.fromLTRB(12, 0, 12, 30),
                          children: [
                            if (downloadedPlaylists.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.fromLTRB(8, 0, 8, 16),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'Downloaded Playlists',
                                      style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    for (final p in downloadedPlaylists)
                                      _LibraryRow(
                                        title:
                                            p['title']?.toString() ??
                                            'Playlist',
                                        subtitle:
                                            '${(p['list'] as List? ?? []).length} songs available offline',
                                        artwork: zonicArtworkUrl(p),
                                        onTap: () => Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) => _NativePlaylistPage(
                                              playlistId:
                                                  p['ytid']?.toString() ?? '',
                                            ),
                                          ),
                                        ),
                                        trailing: const Icon(
                                          Icons.chevron_right_rounded,
                                          color: zonicMuted,
                                        ),
                                      ),
                                    if (songs.isNotEmpty) ...[
                                      const SizedBox(height: 14),
                                      const Text(
                                        'Downloaded Songs',
                                        style: TextStyle(
                                          fontSize: 18,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                    ],
                                  ],
                                ),
                              ),
                            for (var i = 0; i < songs.length; i++)
                              _SongTile(
                                song: songs[i],
                                onTap: () => musify.audioHandler
                                    .playBrowserPlaylist(songs, songIndex: i),
                              ),
                          ],
                        );
                      },
                    )
                  : songs.isEmpty
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
            child: ListView(
              physics: const BouncingScrollPhysics(),
              children: [
                const SizedBox(height: 16),
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
                if (song != null) ...[
                  const SizedBox(height: 24),
                  _PlayerLyricsCard(song: song),
                ],
                const SizedBox(height: 32),
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

class _TimedLyric {
  const _TimedLyric(this.time, this.text, {this.estimated = false});

  final Duration time;
  final String text;
  final bool estimated;
}

Future<(List<_TimedLyric>, bool)> _loadTimedLyrics(Map song) async {
  final artist = song['artist']?.toString();
  final title = song['title']?.toString() ?? '';
  String? raw;
  var hasSyncedTiming = false;
  if (artist != null && artist.trim().isNotEmpty && title.trim().isNotEmpty) {
    try {
      final duration = musify.audioHandler.audioPlayer.duration?.inSeconds;
      final response = await http
          .get(
            Uri.https('lrclib.net', '/api/get', {
              'artist_name': artist.length > 200
                  ? artist.substring(0, 200)
                  : artist,
              'track_name': title.length > 300
                  ? title.substring(0, 300)
                  : title,
              if (duration != null && duration > 0) 'duration': '$duration',
            }),
          )
          .timeout(const Duration(seconds: 7));
      final body = response.statusCode == 200
          ? jsonDecode(response.body)
          : null;
      if (body is Map && body['syncedLyrics'] is String) {
        raw = body['syncedLyrics'] as String;
        hasSyncedTiming = true;
      }
    } catch (_) {}
  }
  raw ??= await getSongLyrics(artist, title);
  final parsed = _parseTimedLyrics(
    raw,
    musify.audioHandler.audioPlayer.duration,
  );
  return (parsed.$1, parsed.$2 || !hasSyncedTiming);
}

(List<_TimedLyric>, bool) _parseTimedLyrics(String? raw, Duration? duration) {
  final source = (raw ?? '').split(RegExp(r'\r?\n'));
  final timed = <_TimedLyric>[];
  final stamp = RegExp(r'\[(\d{1,2}):(\d{2}(?:\.\d+)?)\]');
  for (final row in source) {
    final matches = stamp.allMatches(row).toList();
    final text = row.replaceAll(RegExp(r'\[[^\]]+\]'), '').trim();
    if (text.isEmpty || matches.isEmpty) continue;
    for (final match in matches) {
      final minutes = int.tryParse(match.group(1) ?? '') ?? 0;
      final seconds = double.tryParse(match.group(2) ?? '') ?? 0;
      timed.add(
        _TimedLyric(
          Duration(milliseconds: ((minutes * 60 + seconds) * 1000).round()),
          text,
        ),
      );
    }
  }
  if (timed.isNotEmpty) {
    timed.sort((a, b) => a.time.compareTo(b.time));
    return (timed, false);
  }
  final plain = source
      .map((line) => line.trim())
      .where((line) => line.isNotEmpty && !line.startsWith('©'))
      .toList();
  final total = (duration?.inMilliseconds ?? 180000).clamp(20000, 3600000);
  final start = total < 200000 ? (total * .06).round() : 12000;
  final usable =
      (total - start - (total < 250000 ? (total * .04).round() : 10000)).clamp(
        1000,
        total,
      );
  return (
    List<_TimedLyric>.generate(
      plain.length,
      (index) => _TimedLyric(
        Duration(
          milliseconds:
              start +
              (usable * index / (plain.length <= 1 ? 1 : plain.length - 1))
                  .round(),
        ),
        plain[index],
        estimated: true,
      ),
    ),
    true,
  );
}

class _PlayerLyricsCard extends StatefulWidget {
  const _PlayerLyricsCard({required this.song});
  final Map song;
  @override
  State<_PlayerLyricsCard> createState() => _PlayerLyricsCardState();
}

class _PlayerLyricsCardState extends State<_PlayerLyricsCard> {
  late Future<(List<_TimedLyric>, bool)> lyrics = _loadTimedLyrics(widget.song);

  int _activeIndex(List<_TimedLyric> lines, Duration position) {
    var active = -1;
    for (var index = 0; index < lines.length; index++) {
      if (lines[index].time <= position + const Duration(milliseconds: 150))
        active = index;
      else
        break;
    }
    return active;
  }

  @override
  Widget build(
    BuildContext context,
  ) => FutureBuilder<(List<_TimedLyric>, bool)>(
    future: lyrics,
    builder: (context, snapshot) {
      final lines = snapshot.data?.$1 ?? const <_TimedLyric>[];
      if (snapshot.connectionState != ConnectionState.done || lines.isEmpty)
        return const SizedBox.shrink();
      return Container(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 12),
        decoration: BoxDecoration(
          color: zonicSurface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: const Color(0xff37333f)),
        ),
        child: StreamBuilder<Duration>(
          stream: musify.audioHandler.audioPlayer.positionStream,
          builder: (_, position) {
            final active = _activeIndex(lines, position.data ?? Duration.zero);
            final first = (active < 0 ? 0 : active).clamp(0, lines.length - 1);
            final preview = lines.skip(first).take(3).toList();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.lyrics_rounded, color: zonicAccent),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Lyrics',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => _LyricsPage(song: widget.song),
                        ),
                      ),
                      child: const Text('Full screen'),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                ...preview.asMap().entries.map(
                  (entry) => Padding(
                    padding: const EdgeInsets.only(top: 7),
                    child: Text(
                      entry.value.text,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: entry.key == 0 ? 21 : 17,
                        height: 1.2,
                        fontWeight: entry.key == 0
                            ? FontWeight.w800
                            : FontWeight.w600,
                        color: entry.key == 0 ? Colors.white : zonicMuted,
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      );
    },
  );
}

class _LyricsPage extends StatefulWidget {
  const _LyricsPage({required this.song});
  final Map song;
  @override
  State<_LyricsPage> createState() => _LyricsPageState();
}

class _LyricsPageState extends State<_LyricsPage> {
  final scroll = ScrollController();
  StreamSubscription<Duration>? positionSubscription;
  List<_TimedLyric> lines = const [];
  List<GlobalKey> lineKeys = const [];
  bool loading = true;
  bool autoScroll = true;
  bool estimated = false;
  int activeIndex = -1;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
    positionSubscription = musify.audioHandler.audioPlayer.positionStream
        .listen(_updatePosition);
  }

  @override
  void dispose() {
    unawaited(positionSubscription?.cancel());
    scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final artist = widget.song['artist']?.toString();
    final title = widget.song['title']?.toString() ?? '';
    String? raw;
    var hasSyncedTiming = false;
    if (artist != null && artist.trim().isNotEmpty && title.trim().isNotEmpty) {
      try {
        final duration = musify.audioHandler.audioPlayer.duration?.inSeconds;
        final parameters = <String, String>{
          'artist_name': artist.length > 200
              ? artist.substring(0, 200)
              : artist,
          'track_name': title.length > 300 ? title.substring(0, 300) : title,
          if (duration != null && duration > 0) 'duration': '$duration',
        };
        final response = await http
            .get(Uri.https('lrclib.net', '/api/get', parameters))
            .timeout(const Duration(seconds: 7));
        if (response.statusCode == 200) {
          final body = jsonDecode(response.body);
          if (body is Map && body['syncedLyrics'] is String) {
            raw = body['syncedLyrics'] as String;
            hasSyncedTiming = true;
          }
        }
      } catch (_) {
        // Fall back to the existing lyrics provider below.
      }
    }
    raw ??= await getSongLyrics(artist, title);
    final parsed = _parseLyrics(raw, musify.audioHandler.audioPlayer.duration);
    if (!mounted) return;
    setState(() {
      lines = parsed.$1;
      estimated = parsed.$2 || !hasSyncedTiming;
      lineKeys = List<GlobalKey>.generate(lines.length, (_) => GlobalKey());
      loading = false;
    });
    _updatePosition(musify.audioHandler.audioPlayer.position);
  }

  (List<_TimedLyric>, bool) _parseLyrics(String? raw, Duration? duration) {
    final source = (raw ?? '').split(RegExp(r'\r?\n'));
    final timed = <_TimedLyric>[];
    final stamp = RegExp(r'\[(\d{1,2}):(\d{2}(?:\.\d+)?)\]');
    for (final row in source) {
      final matches = stamp.allMatches(row).toList();
      final text = row.replaceAll(RegExp(r'\[[^\]]+\]'), '').trim();
      if (text.isEmpty || matches.isEmpty) continue;
      for (final match in matches) {
        final minutes = int.tryParse(match.group(1) ?? '') ?? 0;
        final seconds = double.tryParse(match.group(2) ?? '') ?? 0;
        timed.add(
          _TimedLyric(
            Duration(milliseconds: ((minutes * 60 + seconds) * 1000).round()),
            text,
          ),
        );
      }
    }
    if (timed.isNotEmpty) {
      timed.sort((a, b) => a.time.compareTo(b.time));
      return (timed, false);
    }
    final plain = source
        .map((line) => line.trim())
        .where((line) => line.isNotEmpty && !line.startsWith('©'))
        .toList();
    final total = (duration?.inMilliseconds ?? 180000).clamp(20000, 3600000);
    final start = total < 200000 ? (total * .06).round() : 12000;
    final endPadding = total < 250000 ? (total * .04).round() : 10000;
    final usable = (total - start - endPadding).clamp(1000, total);
    return (
      List<_TimedLyric>.generate(
        plain.length,
        (index) => _TimedLyric(
          Duration(
            milliseconds:
                start +
                (usable * index / (plain.length <= 1 ? 1 : plain.length - 1))
                    .round(),
          ),
          plain[index],
          estimated: true,
        ),
      ),
      true,
    );
  }

  void _updatePosition(Duration position) {
    if (!mounted || lines.isEmpty) return;
    var next = -1;
    for (var index = 0; index < lines.length; index++) {
      if (lines[index].time <= position + const Duration(milliseconds: 150)) {
        next = index;
      } else {
        break;
      }
    }
    if (next == activeIndex) return;
    setState(() => activeIndex = next);
    if (autoScroll && next >= 0) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final target = lineKeys[next].currentContext;
        if (target != null && mounted && autoScroll) {
          Scrollable.ensureVisible(
            target,
            duration: const Duration(milliseconds: 420),
            curve: Curves.easeOutCubic,
            alignment: .42,
          );
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Lyrics'),
      actions: [
        IconButton(
          tooltip: autoScroll ? 'Auto-scroll on' : 'Auto-scroll off',
          color: autoScroll ? zonicAccent : null,
          onPressed: () => setState(() => autoScroll = !autoScroll),
          icon: const Icon(Icons.auto_mode_rounded),
        ),
      ],
    ),
    body: loading
        ? const Center(child: CircularProgressIndicator())
        : lines.isEmpty
        ? const Center(
            child: Text(
              'Lyrics are not available for this song.',
              style: TextStyle(color: zonicMuted),
            ),
          )
        : Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        estimated ? 'Estimated timing' : 'Synchronized lyrics',
                        style: const TextStyle(color: zonicMuted),
                      ),
                    ),
                    Text(
                      autoScroll ? 'Auto-scroll on' : 'Auto-scroll off',
                      style: TextStyle(
                        color: autoScroll ? zonicAccent : zonicMuted,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.builder(
                  controller: scroll,
                  padding: const EdgeInsets.fromLTRB(28, 56, 28, 140),
                  itemCount: lines.length,
                  itemBuilder: (_, index) {
                    final line = lines[index];
                    final active = index == activeIndex;
                    final passed = index < activeIndex;
                    return Padding(
                      key: lineKeys[index],
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Text(
                        line.text,
                        style: TextStyle(
                          fontSize: active ? 29 : 24,
                          height: 1.27,
                          fontWeight: active
                              ? FontWeight.w900
                              : FontWeight.w700,
                          color: active
                              ? Colors.white
                              : passed
                              ? const Color(0xff8b8695)
                              : const Color(0xffc2bdca),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
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

/// Native replacement for the former WebView transfer screen. Dropbox uses the
/// system browser only for its own authentication page; Zonic handles the
/// callback, sync and library changes itself.
class _NativeTransferPage extends StatefulWidget {
  const _NativeTransferPage();
  @override
  State<_NativeTransferPage> createState() => _NativeTransferPageState();
}

class _NativeTransferPageState extends State<_NativeTransferPage> {
  static const _dropboxKey = 'zonicDropboxAuth';
  final _account = ZonicAccountService();
  StreamSubscription<Uri?>? _links;
  bool _busy = false;
  String _dropboxState = 'Not connected';

  @override
  void initState() {
    super.initState();
    _links = musify.appLinks.uriLinkStream.listen(_onLink);
    // The browser can open Zonic from Dropbox while it is fully closed. A
    // stream only receives links delivered after this page exists, so also
    // process the launch link to complete that first connection reliably.
    unawaited(_handleInitialDropboxLink());
    unawaited(_loadDropbox());
  }

  @override
  void dispose() {
    _links?.cancel();
    super.dispose();
  }

  Future<void> _loadDropbox() async {
    if (!_account.signedIn) {
      if (mounted)
        setState(() => _dropboxState = 'Sign in to Zonic to connect Dropbox');
      return;
    }
    try {
      final saved = await _account.readPrivate('dropbox');
      if (mounted)
        setState(
          () => _dropboxState = saved == null
              ? 'Not connected'
              : 'Connected to your Zonic account',
        );
    } catch (_) {
      if (mounted) setState(() => _dropboxState = 'Connection needs attention');
    }
  }

  void _toast(String message) =>
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));

  Future<void> _handleInitialDropboxLink() async {
    try {
      final saved = Hive.box('userNoBackup').get('zonicPendingDropboxLink');
      if (saved is String && saved.isNotEmpty) {
        await _onLink(Uri.tryParse(saved));
        return;
      }
      await _onLink(await musify.appLinks.getInitialLink());
    } catch (_) {
      // Dropbox can still return through the regular stream while Zonic is
      // already open; do not interrupt the transfer page for this fallback.
    }
  }

  Future<void> _importYoutube() async {
    final controller = TextEditingController();
    final link = await showDialog<String>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Import YouTube playlist'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Paste a YouTube playlist link',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, controller.text.trim()),
            child: const Text('Import'),
          ),
        ],
      ),
    );
    if (link == null || link.isEmpty) return;
    setState(() => _busy = true);
    final result = await addUserPlaylist(link, context);
    if (mounted) {
      setState(() => _busy = false);
      _toast(result);
    }
  }

  Future<void> _backup() async {
    setState(() => _busy = true);
    final result = await backupData(context);
    if (mounted) {
      setState(() => _busy = false);
      _toast(result.message);
    }
  }

  Future<void> _restore() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Restore library?'),
        content: const Text(
          'This replaces this device’s Zonic library and settings with the selected backup.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Restore'),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    setState(() => _busy = true);
    final result = await restoreData(context);
    if (mounted) {
      setState(() => _busy = false);
      _toast(result.message);
    }
  }

  String _random(int length) {
    const chars =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';
    final random = Random.secure();
    return List.generate(
      length,
      (_) => chars[random.nextInt(chars.length)],
    ).join();
  }

  Future<void> _connectDropbox() async {
    if (!_account.signedIn) {
      _toast('Sign in to your Zonic account first.');
      return;
    }
    final verifier = _random(72), state = 'n.${_random(32)}';
    await Hive.box('userNoBackup')
        .put(_dropboxKey, {'verifier': verifier, 'state': state});
    final uri = Uri.https('www.dropbox.com', '/oauth2/authorize', {
      'client_id': 'bpdb3vsvzzdgzk7',
      'response_type': 'code',
      'redirect_uri': 'https://zonic-music.web.app/dropbox-callback',
      'code_challenge': base64Url
          .encode(sha256.convert(utf8.encode(verifier)).bytes)
          .replaceAll('=', ''),
      'code_challenge_method': 'S256',
      'token_access_type': 'offline',
      'state': state,
    });
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) _toast('Could not open Dropbox sign-in.');
  }

  Future<void> _onLink(Uri? uri) async {
    if (uri == null ||
        uri.scheme != 'grove' ||
        uri.host != 'dropbox' ||
        uri.path != '/callback')
      return;
    final code = uri.queryParameters['code'],
        state = uri.queryParameters['state'];
    final saved = Hive.box('userNoBackup').get(_dropboxKey);
    if (code == null || saved is! Map || state != saved['state']) {
      if (mounted) _toast('Dropbox sign-in could not be verified. Try again.');
      return;
    }
    setState(() => _busy = true);
    try {
      final response = await http
          .post(
            Uri.parse('https://api.dropboxapi.com/oauth2/token'),
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: {
              'code': code,
              'grant_type': 'authorization_code',
              'client_id': 'bpdb3vsvzzdgzk7',
              'redirect_uri': 'https://zonic-music.web.app/dropbox-callback',
              'code_verifier': saved['verifier'].toString(),
            },
          )
          .timeout(const Duration(seconds: 20));
      final data = jsonDecode(response.body) as Map;
      if (response.statusCode != 200 || data['refresh_token'] == null) {
        throw StateError(
          data['error_description']?.toString() ?? 'Dropbox sign-in failed.',
        );
      }
      await _account.writePrivate(
        'dropbox',
        jsonEncode({'version': 2, 'refreshToken': data['refresh_token']}),
      );
      await Hive.box('userNoBackup').delete(_dropboxKey);
      await Hive.box('userNoBackup').delete('zonicPendingDropboxLink');
      if (mounted) {
        setState(() => _dropboxState = 'Connected to your Zonic account');
        _toast('Dropbox connected.');
      }
    } catch (error) {
      if (mounted) {
        _toast(
          'Dropbox could not connect. ${error is StateError ? error.message : 'Check your connection and try again.'}',
        );
      }
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<String> _dropboxAccessToken() async {
    final raw = await _account.readPrivate('dropbox');
    if (raw == null) throw StateError('Connect Dropbox first.');
    final saved = jsonDecode(raw) as Map;
    final refresh = saved['refreshToken']?.toString();
    if (refresh == null || refresh.isEmpty)
      throw StateError('Reconnect Dropbox to continue.');
    final response = await http
        .post(
          Uri.parse('https://api.dropboxapi.com/oauth2/token'),
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body: {
            'refresh_token': refresh,
            'grant_type': 'refresh_token',
            'client_id': 'bpdb3vsvzzdgzk7',
          },
        )
        .timeout(const Duration(seconds: 20));
    final value = jsonDecode(response.body) as Map;
    if (response.statusCode != 200 || value['access_token'] == null)
      throw StateError(
        value['error_description']?.toString() ?? 'Dropbox session expired.',
      );
    return value['access_token'].toString();
  }

  String _cloudPlaylistId(Map playlist) {
    final savedId = playlist['ytid']?.toString().trim();
    if (savedId != null && savedId.isNotEmpty) return savedId;
    // Older locally-created playlists did not always have an ID. Give them a
    // deterministic cloud ID so they can be restored and de-duplicated.
    final name = playlist['title']?.toString().trim().toLowerCase() ?? '';
    return 'zonic-${sha1.convert(utf8.encode(name)).toString().substring(0, 16)}';
  }

  Map<String, Object?> _cloudSong(Map song) => Map<String, Object?>.from(
    song.map((key, value) => MapEntry(key.toString(), value)),
  );

  String _cloudSongId(Map song) {
    final id = song['ytid'] ?? song['videoId'] ?? song['id'];
    if (id != null && id.toString().isNotEmpty) return id.toString();
    return '${song['title'] ?? ''}|${song['artist'] ?? ''}'
        .trim()
        .toLowerCase();
  }

  List<Map<String, Object?>> _cloudPlaylists() => userCustomPlaylists.value
      .map(
        (playlist) => <String, Object?>{
          'id': _cloudPlaylistId(playlist),
          'name': playlist['title']?.toString() ?? 'Untitled playlist',
          'artwork': playlist['image']?.toString(),
          'source': playlist['source']?.toString() ?? 'user-created',
          'tracks': (playlist['list'] as List? ?? const [])
              .map(
                (song) => song is Map
                    ? Map<String, Object?>.from(
                        song.map(
                          (key, value) => MapEntry(key.toString(), value),
                        ),
                      )
                    : <String, Object?>{},
              )
              .toList(),
        },
      )
      .toList();

  Future<void> _pushDropbox() async {
    setState(() => _busy = true);
    try {
      final response = await http
          .post(
            Uri.parse('https://content.dropboxapi.com/2/files/upload'),
            headers: {
              'Authorization': 'Bearer ${await _dropboxAccessToken()}',
              'Content-Type': 'application/octet-stream',
              'Dropbox-API-Arg': jsonEncode({
                'path': '/zonic-playlists.json',
                'mode': 'overwrite',
                'autorename': false,
                'mute': true,
              }),
            },
            body: jsonEncode({
              'schemaVersion': 3,
              'updatedAt': DateTime.now().millisecondsSinceEpoch,
              'playlists': _cloudPlaylists(),
              'likedSongs': userLikedSongsList.value
                  .whereType<Map>()
                  .map(_cloudSong)
                  .toList(),
            }),
          )
          .timeout(const Duration(seconds: 25));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw StateError(
          'Could not upload playlists to Dropbox (${response.statusCode}).',
        );
      }
      if (mounted) {
        _toast('Playlists and ${userLikedSongsList.value.length} liked songs synced.');
      }
    } catch (error) {
      if (mounted) _toast(error.toString());
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _pullDropbox() async {
    setState(() => _busy = true);
    try {
      final response = await http
          .post(
            Uri.parse('https://content.dropboxapi.com/2/files/download'),
            headers: {
              'Authorization': 'Bearer ${await _dropboxAccessToken()}',
              'Dropbox-API-Arg': jsonEncode({'path': '/zonic-playlists.json'}),
            },
          )
          .timeout(const Duration(seconds: 25));
      if (response.statusCode == 409)
        throw StateError('No Zonic playlist backup was found in Dropbox.');
      final data = jsonDecode(response.body) as Map;
      final remote = (data['playlists'] as List? ?? const []).whereType<Map>();
      final existing = List<Map>.from(userCustomPlaylists.value);
      var playlistsImported = 0;
      for (final item in remote) {
        final id = item['id']?.toString();
        if (id == null ||
            id.isEmpty ||
            existing.any((p) => p['ytid']?.toString() == id))
          continue;
        existing.add({
          'ytid': id,
          'title': item['name']?.toString() ?? 'Imported playlist',
          'image': item['artwork'],
          'source': item['source'] ?? 'user-created',
          'list': List<Map>.from(
            (item['tracks'] as List? ?? const []).whereType<Map>(),
          ),
        });
        playlistsImported++;
      }
      userCustomPlaylists.value = existing;
      await addOrUpdateData<List>('user', 'customPlaylists', existing);
      final currentLikes = userLikedSongsList.value.whereType<Map>().toList();
      final existingLikeIds = currentLikes.map(_cloudSongId).toSet();
      var likesImported = 0;
      for (final song in (data['likedSongs'] as List? ?? const []).whereType<Map>()) {
        final id = _cloudSongId(song);
        if (id.isEmpty || !existingLikeIds.add(id)) continue;
        currentLikes.add(Map.from(song));
        likesImported++;
      }
      if (likesImported > 0) {
        userLikedSongsList.value = currentLikes;
        await addOrUpdateData<List>('user', 'likedSongs', currentLikes);
      }
      if (mounted)
        _toast(
          playlistsImported == 0 && likesImported == 0
              ? 'Your library is already up to date.'
              : 'Imported $playlistsImported playlist${playlistsImported == 1 ? '' : 's'} and $likesImported liked song${likesImported == 1 ? '' : 's'} from Dropbox.',
        );
    } catch (error) {
      if (mounted) _toast(error.toString());
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Transfer & sync')),
    body: Stack(
      children: [
        ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            const Text(
              'Bring your music to Zonic',
              style: TextStyle(fontSize: 25, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            const Text(
              'Every option below is a native Zonic screen.',
              style: TextStyle(color: zonicMuted),
            ),
            const SizedBox(height: 18),
            _AdvancedTile(
              icon: Icons.playlist_add_rounded,
              title: 'Import YouTube playlist',
              subtitle: 'Use the playlist name from YouTube and keep it linked',
              onTap: _importYoutube,
            ),
            _AdvancedTile(
              icon: Icons.table_view_rounded,
              title: 'Import Spotify CSV',
              subtitle: 'Create an editable Zonic playlist from your export',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const ImportSpotifyPlaylistPage(),
                ),
              ),
            ),
            _AdvancedTile(
              icon: Icons.backup_outlined,
              title: 'Back up library',
              subtitle: 'Save your playlists and settings on this device',
              onTap: _backup,
            ),
            _AdvancedTile(
              icon: Icons.restore_rounded,
              title: 'Restore library',
              subtitle: 'Restore a Zonic backup file',
              onTap: _restore,
            ),
            const SizedBox(height: 12),
            const Divider(),
            const SizedBox(height: 12),
            const Text(
              'Dropbox playlist sync',
              style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Text(_dropboxState, style: const TextStyle(color: zonicMuted)),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _connectDropbox,
              icon: const Icon(Icons.cloud_done_rounded),
              label: Text(
                _dropboxState.startsWith('Connected')
                    ? 'Reconnect Dropbox'
                    : 'Connect Dropbox',
              ),
            ),
            if (_dropboxState.startsWith('Connected')) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pullDropbox,
                      icon: const Icon(Icons.cloud_download_outlined),
                      label: const Text('Get from Dropbox'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pushDropbox,
                      icon: const Icon(Icons.cloud_upload_outlined),
                      label: const Text('Sync to Dropbox'),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 8),
            const Text(
              'Sync to Dropbox saves your playlists and Liked Songs. On another device, sign in to the same Dropbox and choose Get from Dropbox. Its connection is saved to your Zonic account, so no recovery key is needed.',
              style: TextStyle(color: zonicMuted, fontSize: 12),
            ),
          ],
        ),
        if (_busy) const Center(child: CircularProgressIndicator()),
      ],
    ),
  );
}
