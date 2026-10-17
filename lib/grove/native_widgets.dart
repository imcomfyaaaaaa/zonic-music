import 'dart:async';

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:musify/main.dart' as musify;

const zonicBackground = Color(0xff09090b);
const zonicSurface = Color(0xff211f27);
const zonicSurfaceRaised = Color(0xff2a2732);
const zonicAccent = Color(0xff9d8cff);
const zonicMuted = Color(0xffb5b0bf);

String? zonicArtworkUrl(Map? value) {
  for (final key in ['artwork', 'image', 'highResImage', 'lowResImage']) {
    final candidate = value?[key]?.toString().trim();
    if (candidate != null && candidate.isNotEmpty && candidate != 'null') {
      return candidate;
    }
  }
  return null;
}

class ZonicSurfaceButton extends StatefulWidget {
  const ZonicSurfaceButton({
    super.key,
    required this.child,
    required this.onPressed,
    this.selected = false,
    this.autofocus = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
    this.borderRadius = 14,
  });

  final Widget child;
  final VoidCallback onPressed;
  final bool selected;
  final bool autofocus;
  final EdgeInsets padding;
  final double borderRadius;

  @override
  State<ZonicSurfaceButton> createState() => _ZonicSurfaceButtonState();
}

class _ZonicSurfaceButtonState extends State<ZonicSurfaceButton> {
  bool focused = false;

  @override
  Widget build(BuildContext context) => FocusableActionDetector(
    autofocus: widget.autofocus,
    onShowFocusHighlight: (value) => setState(() => focused = value),
    mouseCursor: SystemMouseCursors.click,
    actions: {
      ActivateIntent: CallbackAction<ActivateIntent>(
        onInvoke: (_) {
          widget.onPressed();
          return null;
        },
      ),
    },
    child: GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.onPressed,
      child: AnimatedScale(
        scale: focused ? 1.028 : 1,
        duration: const Duration(milliseconds: 110),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 110),
          padding: widget.padding,
          decoration: BoxDecoration(
            gradient: focused
                ? const LinearGradient(
                    colors: [Color(0xfffaf9ff), Color(0xffddd7ff)],
                  )
                : widget.selected
                ? const LinearGradient(
                    colors: [Color(0xffa594ff), Color(0xff755fe5)],
                  )
                : const LinearGradient(
                    colors: [Color(0xff292631), Color(0xff1d1b22)],
                  ),
            borderRadius: BorderRadius.circular(widget.borderRadius),
            border: Border.all(
              color: focused
                  ? Colors.white
                  : widget.selected
                  ? const Color(0xffb9adff)
                  : const Color(0xff3a3742),
              width: focused ? 3 : 1,
            ),
            boxShadow: focused
                ? const [
                    BoxShadow(
                      color: Color(0x669d8cff),
                      blurRadius: 20,
                      spreadRadius: 1,
                    ),
                  ]
                : widget.selected
                ? const [BoxShadow(color: Color(0x33755fe5), blurRadius: 14)]
                : null,
          ),
          child: DefaultTextStyle.merge(
            style: TextStyle(color: focused ? Colors.black : Colors.white),
            child: IconTheme(
              data: IconThemeData(color: focused ? Colors.black : Colors.white),
              child: widget.child,
            ),
          ),
        ),
      ),
    ),
  );
}

class ZonicArtwork extends StatelessWidget {
  const ZonicArtwork({
    super.key,
    required this.url,
    required this.size,
    this.radius = 14,
  });

  final String? url;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(radius),
    child: Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xff373242), Color(0xff17161d)],
        ),
        border: Border.all(color: const Color(0x443f3a4b)),
      ),
      child: url == null
          ? const Icon(Icons.music_note_rounded, size: 42, color: zonicAccent)
          : Image.network(
              url!,
              fit: BoxFit.cover,
              filterQuality: FilterQuality.medium,
              errorBuilder: (_, _, _) => const Icon(
                Icons.music_note_rounded,
                size: 42,
                color: zonicAccent,
              ),
            ),
    ),
  );
}

/// Native replacement for the TSX mini-player. It intentionally mirrors the
/// compact artwork/title/artist/actions layout used by the current phone UI.
class ZonicMiniPlayer extends StatelessWidget {
  const ZonicMiniPlayer({super.key, required this.onExpand});

  final VoidCallback onExpand;

  @override
  Widget build(BuildContext context) => StreamBuilder<PlaybackState>(
    stream: musify.audioHandler.playbackState,
    builder: (context, snapshot) {
      final song = musify.audioHandler.currentSong;
      final playing = snapshot.data?.playing == true;
      return Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: Ink(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xff302d39), Color(0xff201e27)],
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xff45404d)),
          ),
          child: InkWell(
            onTap: onExpand,
            child: SizedBox(
              height: 72,
              child: Row(
                children: [
                  const SizedBox(width: 8),
                  ZonicArtwork(
                    url: zonicArtworkUrl(song),
                    size: 56,
                    radius: 11,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          song?['title']?.toString() ??
                              'Choose something to play',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          song?['artist']?.toString() ?? 'Zonic',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 13,
                            color: zonicMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: playing ? 'Pause' : 'Play',
                    onPressed: () => unawaited(
                      playing
                          ? musify.audioHandler.pause()
                          : musify.audioHandler.play(),
                    ),
                    icon: Icon(
                      playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
                      size: 32,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Next',
                    onPressed: () =>
                        unawaited(musify.audioHandler.skipToNext()),
                    icon: const Icon(Icons.skip_next_rounded, size: 30),
                  ),
                  const SizedBox(width: 4),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}

class ZonicPhoneNavigation extends StatelessWidget {
  const ZonicPhoneNavigation({
    super.key,
    required this.index,
    required this.onChanged,
  });

  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => NavigationBar(
    height: 68,
    selectedIndex: index,
    onDestinationSelected: onChanged,
    backgroundColor: const Color(0xff121116),
    indicatorColor: const Color(0xff6f5ee8),
    elevation: 0,
    destinations: const [
      NavigationDestination(
        icon: Icon(Icons.home_outlined),
        selectedIcon: Icon(Icons.home_rounded),
        label: 'Home',
      ),
      NavigationDestination(icon: Icon(Icons.search_rounded), label: 'Browse'),
      NavigationDestination(
        icon: Icon(Icons.person_outline_rounded),
        selectedIcon: Icon(Icons.person_rounded),
        label: 'Artists',
      ),
      NavigationDestination(
        icon: Icon(Icons.library_music_outlined),
        selectedIcon: Icon(Icons.library_music_rounded),
        label: 'Library',
      ),
    ],
  );
}
