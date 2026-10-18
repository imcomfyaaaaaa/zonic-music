import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:musify/grove/native_widgets.dart';
import 'package:musify/localization/app_localizations.dart';
import 'package:musify/widgets/listening_recap_card.dart';

void main() {
  testWidgets('recap songs stay compact and tappable', (tester) async {
    int? tapped;
    await tester.pumpWidget(MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: ThemeData.dark(),
      home: Scaffold(
        body: SizedBox(
          width: 360,
          child: ListeningRecapCard(
            periodLabel: 'October 2026',
            minutes: 2,
            songs: const [
              {'ytid': 'track-1', 'title': 'Test song', 'artist': 'Artist'},
            ],
            onSongTap: (index) => tapped = index,
          ),
        ),
      ),
    ));

    expect(find.text('Test song'), findsOneWidget);
    expect(tester.getSize(find.byType(ZonicArtwork)).height, 46);
    await tester.tap(find.text('Test song'));
    expect(tapped, 0);
  });
}
