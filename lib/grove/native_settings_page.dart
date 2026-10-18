import 'package:flutter/material.dart';
import 'package:musify/grove/native_widgets.dart';
import 'package:musify/screens/equalizer_page.dart';
import 'package:musify/services/data_manager.dart';
import 'package:musify/services/settings_manager.dart';
import 'package:musify/services/update_manager.dart';

/// Settings for the native Zonic interface. The original settings screen is
/// still used by the legacy router, but native navigation stays visually
/// consistent with the rest of the phone app.
class ZonicSettingsPage extends StatelessWidget {
  const ZonicSettingsPage({super.key});

  Future<void> _set(String key, ValueNotifier<bool> setting, bool value) async {
    setting.value = value;
    await addOrUpdateData<bool>('settings', key, value);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Settings')),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 32),
      children: [
        const _SectionLabel('SOUND'),
        _SettingsGroup(
          children: [
            _SettingsAction(
              icon: Icons.graphic_eq_rounded,
              title: 'Equalizer',
              subtitle: 'Presets and frequency bands',
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const EqualizerPage()),
              ),
            ),
            ValueListenableBuilder<String>(
              valueListenable: audioQualitySetting,
              builder: (context, quality, _) => _SettingsAction(
                icon: Icons.high_quality_rounded,
                title: 'Audio quality',
                subtitle: '${quality[0].toUpperCase()}${quality.substring(1)}',
                onTap: () => showModalBottomSheet<void>(
                  context: context,
                  backgroundColor: zonicSurface,
                  showDragHandle: true,
                  builder: (sheetContext) => SafeArea(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const ListTile(
                          title: Text(
                            'Audio quality',
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        for (final option in const ['low', 'medium', 'high'])
                          ListTile(
                            title: Text(
                              '${option[0].toUpperCase()}${option.substring(1)}',
                            ),
                            trailing: option == quality
                                ? const Icon(
                                    Icons.check_rounded,
                                    color: zonicAccent,
                                  )
                                : null,
                            onTap: () async {
                              audioQualitySetting.value = option;
                              await addOrUpdateData<String>(
                                'settings',
                                'audioQuality',
                                option,
                              );
                              if (sheetContext.mounted)
                                Navigator.pop(sheetContext);
                            },
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
        const _SectionLabel('PLAYBACK'),
        _SettingsGroup(
          children: [
            _SettingsToggle(
              icon: Icons.skip_next_rounded,
              title: 'Play the next song automatically',
              value: playNextSongAutomatically,
              onChanged: (value) => _set(
                'playNextSongAutomatically',
                playNextSongAutomatically,
                value,
              ),
            ),
            _SettingsToggle(
              icon: Icons.bar_chart_rounded,
              title: 'Listening stats',
              subtitle: 'Track plays for Time Machine',
              value: wrappedEnabled,
              onChanged: (value) =>
                  _set('wrappedEnabled', wrappedEnabled, value),
            ),
            _SettingsToggle(
              icon: Icons.cloud_off_rounded,
              title: 'Offline mode',
              subtitle: 'Play downloaded music only',
              value: offlineMode,
              onChanged: (value) => _set('offlineMode', offlineMode, value),
            ),
          ],
        ),
        const _SectionLabel('CONNECTION'),
        _SettingsGroup(
          children: [
            _SettingsToggle(
              icon: Icons.shield_outlined,
              title: 'Use proxy',
              subtitle: 'Use when direct streaming fails',
              value: useProxy,
              onChanged: (value) => _set('useProxy', useProxy, value),
            ),
            _SettingsToggle(
              icon: Icons.content_cut_rounded,
              title: 'SponsorBlock',
              value: sponsorBlockSupport,
              onChanged: (value) =>
                  _set('sponsorBlockSupport', sponsorBlockSupport, value),
            ),
          ],
        ),
        const _SectionLabel('APP'),
        _SettingsGroup(
          children: [
            _SettingsAction(
              icon: Icons.system_update_rounded,
              title: 'Check for updates',
              subtitle: 'Get the latest Zonic APK',
              onTap: () =>
                  checkAppUpdates(displayContext: context, showNoUpdate: true),
            ),
          ],
        ),
      ],
    ),
  );
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label);
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(5, 22, 5, 10),
    child: Text(
      label,
      style: const TextStyle(
        color: zonicAccent,
        fontSize: 12,
        letterSpacing: 1.8,
        fontWeight: FontWeight.w800,
      ),
    ),
  );
}

class _SettingsGroup extends StatelessWidget {
  const _SettingsGroup({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Container(
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      color: zonicSurface,
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: const Color(0xff35323e)),
    ),
    child: Column(
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0)
            const Divider(height: 1, indent: 58, color: Color(0xff35323e)),
          children[i],
        ],
      ],
    ),
  );
}

class _SettingsAction extends StatelessWidget {
  const _SettingsAction({
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
  Widget build(BuildContext context) => ListTile(
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
    leading: _SettingIcon(icon),
    title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
    subtitle: Text(subtitle, style: const TextStyle(color: zonicMuted)),
    trailing: const Icon(Icons.chevron_right_rounded, color: zonicMuted),
    onTap: onTap,
  );
}

class _SettingsToggle extends StatelessWidget {
  const _SettingsToggle({
    required this.icon,
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final ValueNotifier<bool> value;
  final ValueChanged<bool> onChanged;
  @override
  Widget build(BuildContext context) => ValueListenableBuilder<bool>(
    valueListenable: value,
    builder: (_, enabled, __) => SwitchListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      secondary: _SettingIcon(icon),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: subtitle == null
          ? null
          : Text(subtitle!, style: const TextStyle(color: zonicMuted)),
      value: enabled,
      onChanged: onChanged,
    ),
  );
}

class _SettingIcon extends StatelessWidget {
  const _SettingIcon(this.icon);
  final IconData icon;
  @override
  Widget build(BuildContext context) => Container(
    width: 40,
    height: 40,
    decoration: BoxDecoration(
      color: const Color(0xff383149),
      borderRadius: BorderRadius.circular(12),
    ),
    child: Icon(icon, size: 21, color: zonicAccent),
  );
}
