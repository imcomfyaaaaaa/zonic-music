/// Places one recommendation after up to two upcoming playlist songs.
/// Returns null while another Smart Shuffle pick is already upcoming.
int? smartShuffleInsertIndex(List<Map> queue, int currentIndex) {
  if (currentIndex < 0 || currentIndex >= queue.length) return null;
  if (queue
      .skip(currentIndex + 1)
      .any((song) => song['isSmartShuffle'] == true)) {
    return null;
  }
  final target = currentIndex + 3;
  return target < queue.length ? target : queue.length;
}

/// Rotate listening-history and liked-song seeds each day or when refreshed.
/// The current song is included, but it is not the only source of suggestions.
List<String> smartShuffleSeedIds({
  required String? currentId,
  required Iterable recentSongs,
  required Iterable likedSongs,
  required int dayKey,
  required int rotation,
}) {
  final ids = <String>[];
  final seen = <String>{};
  void add(dynamic song) {
    final id = song is Map ? song['ytid']?.toString() : song?.toString();
    if (id != null && id.isNotEmpty && seen.add(id)) ids.add(id);
  }

  add(currentId);
  for (final song in recentSongs.take(12)) add(song);
  for (final song in likedSongs.take(40)) add(song);
  if (ids.isEmpty) return const [];
  final start = (dayKey + rotation).abs() % ids.length;
  return [...ids.skip(start), ...ids.take(start)];
}
