import 'package:youtube_explode_dart/src/extensions/helpers_extension.dart';
void main() {
  for (final value in ['Streamed live ago', 'Premiered recently ago', 'Live now', '']) {
    if (value.toDateTime() != null) throw StateError('Unexpected date for $value');
  }
  for (final value in ['5 days ago', 'Streamed 2 years ago']) {
    if (value.toDateTime() == null) throw StateError('Expected a date for $value');
  }
  print('Search date parser regression checks passed.');
}
