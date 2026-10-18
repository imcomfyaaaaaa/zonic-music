import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:musify/services/update_manager.dart';

void main() {
  test('selects the arm64 APK and digest from a GitHub release', () {
    final release = parseZonicRelease({
      'tag_name': 'v0.2.33',
      'html_url':
          'https://github.com/imcomfyaaaaaa/zonic-music/releases/tag/v0.2.33',
      'body': 'Fixes updates',
      'assets': [
        {
          'name': 'app-github-release.apk',
          'browser_download_url': 'https://github.com/other.apk',
        },
        {
          'name': 'app-arm64-v8a-github-release.apk',
          'browser_download_url': 'https://github.com/arm64.apk',
          'digest': 'sha256:abc123',
        },
      ],
    });

    expect(release.version, '0.2.33');
    expect(release.apkUrl, 'https://github.com/arm64.apk');
    expect(release.digest, 'sha256:abc123');
    expect(isLatestVersionHigher('0.2.32', release.version), isTrue);
    expect(isLatestVersionHigher('0.2.32 DEBUG', release.version), isTrue);
    expect(isLatestVersionHigher('0.2.33', release.version), isFalse);
  });

  test('reads the latest release from GitHub Atom feed', () {
    final release = parseZonicReleaseFeed('''
<feed><entry>
  <id>tag:github.com,2008:Repository/1420762793/v0.2.33</id>
</entry><entry>
  <id>tag:github.com,2008:Repository/1420762793/v0.2.32</id>
</entry></feed>
''');
    expect(release.version, '0.2.33');
    expect(
      release.apkUrl,
      contains('/v0.2.33/app-arm64-v8a-github-release.apk'),
    );
  });

  test('uses the public feed if the GitHub API is rate limited', () async {
    final client = MockClient((request) async {
      if (request.url.host == 'api.github.com') {
        return http.Response('rate limited', 403);
      }
      return http.Response('''
<feed><entry><id>tag:github.com,2008:Repository/1420762793/v0.2.33</id></entry></feed>
''', 200);
    });
    final release = await fetchLatestZonicRelease(client: client);
    expect(release.version, '0.2.33');
  });
}
