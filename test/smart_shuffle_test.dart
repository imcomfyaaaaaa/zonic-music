import 'package:flutter_test/flutter_test.dart';
import 'package:musify/utilities/smart_shuffle.dart';

void main() {
  test('inserts a recommendation after two upcoming songs', () {
    final queue = List<Map>.generate(6, (index) => {'ytid': '$index'});
    expect(smartShuffleInsertIndex(queue, 0), 3);
    expect(smartShuffleInsertIndex(queue, 4), 6);
    expect(smartShuffleInsertIndex(queue, 6), isNull);
  });

  test('keeps only one unplayed recommendation in the queue', () {
    final queue = <Map>[
      {'ytid': 'a'},
      {'ytid': 'b', 'isSmartShuffle': true},
      {'ytid': 'c'},
    ];
    expect(smartShuffleInsertIndex(queue, 0), isNull);
    expect(smartShuffleInsertIndex(queue, 1), 3);
  });

  test('uses current listening, history and likes with a rotating order', () {
    final first = smartShuffleSeedIds(
      currentId: 'now',
      recentSongs: [
        {'ytid': 'recent'},
        {'ytid': 'now'},
      ],
      likedSongs: [
        {'ytid': 'liked'},
      ],
      dayKey: 1,
      rotation: 0,
    );
    final refreshed = smartShuffleSeedIds(
      currentId: 'now',
      recentSongs: [
        {'ytid': 'recent'},
      ],
      likedSongs: [
        {'ytid': 'liked'},
      ],
      dayKey: 1,
      rotation: 1,
    );
    expect(first.toSet(), {'now', 'recent', 'liked'});
    expect(refreshed.toSet(), first.toSet());
    expect(refreshed.first, isNot(first.first));
  });
}
