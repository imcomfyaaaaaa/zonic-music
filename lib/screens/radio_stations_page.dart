/*
 *     Copyright (C) 2026 Valeri Gokadze
 *
 *     Musify is free software: you can redistribute it and/or modify
 *     it under the terms of the GNU General Public License as published by
 *     the Free Software Foundation, either version 3 of the License, or
 *     (at your option) any later version.
 *
 *     Musify is distributed in the hope that it will be useful,
 *     but WITHOUT ANY WARRANTY; without even the implied warranty of
 *     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *     GNU General Public License for more details.
 *
 *     You should have received a copy of the GNU General Public License
 *     along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 *
 *     For more information about Musify, including how to contribute,
 *     please visit: https://github.com/gokadzev/Musify
 */
import 'package:flutter/material.dart';
import 'package:musify/database/radio_stations.db.dart';
import 'package:musify/extensions/l10n.dart';
import 'package:musify/grove/native_widgets.dart';
import 'package:musify/main.dart';
import 'package:musify/models/radio_model.dart';
import 'package:musify/services/common_services.dart';
import 'package:musify/utilities/flutter_toast.dart';

class RadioStationsPage extends StatelessWidget {
  const RadioStationsPage({super.key, this.showAppBar = true});

  final bool showAppBar;

  @override
  Widget build(BuildContext context) {
    final stationsList = ValueListenableBuilder(
      valueListenable: userLikedRadioStations,
      builder: (context, likedStations, _) {
        final stations = _sortWithLikedFirst(
          radioStationsDB,
          likedStations.toSet(),
        );

        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(18, 8, 18, 40),
          itemCount: stations.length + 1,
          itemBuilder: (context, index) {
            if (index == 0) {
              return const Padding(
                padding: EdgeInsets.fromLTRB(4, 12, 4, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'LIVE RADIO',
                      style: TextStyle(
                        color: zonicAccent,
                        fontSize: 12,
                        letterSpacing: 1.8,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    SizedBox(height: 6),
                    Text(
                      'Tune in',
                      style: TextStyle(
                        fontSize: 29,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      'Pick a station and keep listening.',
                      style: TextStyle(color: zonicMuted),
                    ),
                  ],
                ),
              );
            }
            final station = stations[index - 1];
            final liked = likedStations.contains(station.id);
            return Padding(
              key: ValueKey(station.id),
              padding: const EdgeInsets.only(bottom: 10),
              child: Container(
                decoration: BoxDecoration(
                  color: zonicSurface,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xff35323e)),
                ),
                child: ListTile(
                  contentPadding: const EdgeInsets.fromLTRB(10, 7, 6, 7),
                  leading: ZonicArtwork(
                    url: station.image,
                    size: 54,
                    radius: 11,
                  ),
                  title: Text(
                    station.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: Text(
                    station.genre ?? 'Radio',
                    style: const TextStyle(color: zonicMuted),
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        tooltip: liked
                            ? 'Remove from favorites'
                            : 'Add to favorites',
                        icon: Icon(
                          liked
                              ? Icons.favorite_rounded
                              : Icons.favorite_border_rounded,
                          color: liked ? const Color(0xffff6680) : zonicMuted,
                        ),
                        onPressed: () => liked
                            ? removeRadioStationFromLiked(station.id)
                            : addRadioStationToLiked(station.id),
                      ),
                      IconButton.filled(
                        tooltip: 'Play ${station.name}',
                        icon: const Icon(Icons.play_arrow_rounded),
                        onPressed: () => _playStation(context, station),
                      ),
                    ],
                  ),
                  onTap: () => _playStation(context, station),
                ),
              ),
            );
          },
        );
      },
    );
    if (!showAppBar) return stationsList;
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n!.radioStations)),
      body: stationsList,
    );
  }

  Future<void> _playStation(BuildContext context, RadioStation station) async {
    final success = await audioHandler.playRadioStream(
      id: station.id,
      name: station.name,
      streamUrl: station.streamUrl,
      image: station.image,
      genre: station.genre,
    );
    if (!success && context.mounted) {
      showToast(context, context.l10n!.error);
    }
  }
}

List<RadioStation> _sortWithLikedFirst(
  List<RadioStation> stations,
  Set<String> likedIds,
) {
  final liked = <RadioStation>[];
  final rest = <RadioStation>[];

  for (final station in stations) {
    if (likedIds.contains(station.id)) {
      liked.add(station);
    } else {
      rest.add(station);
    }
  }

  return [...liked, ...rest];
}
