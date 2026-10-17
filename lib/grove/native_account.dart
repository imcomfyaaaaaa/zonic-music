import 'dart:convert';
import 'dart:math';

import 'package:hive/hive.dart';
import 'package:http/http.dart' as http;

class ZonicAccountSession {
  const ZonicAccountSession({
    required this.idToken,
    required this.refreshToken,
    required this.uid,
    required this.email,
    required this.expiresAt,
    required this.pairingCode,
  });

  final String idToken;
  final String refreshToken;
  final String uid;
  final String email;
  final int expiresAt;
  final String pairingCode;

  Map<String, Object> toJson() => {
    'idToken': idToken,
    'refreshToken': refreshToken,
    'localId': uid,
    'email': email,
    'expiresAt': expiresAt,
    'pairingCode': pairingCode,
  };

  factory ZonicAccountSession.fromJson(Map value) => ZonicAccountSession(
    idToken: value['idToken']?.toString() ?? '',
    refreshToken: value['refreshToken']?.toString() ?? '',
    uid: value['localId']?.toString() ?? '',
    email: value['email']?.toString() ?? '',
    expiresAt: (value['expiresAt'] as num? ?? 0).toInt(),
    pairingCode: value['pairingCode']?.toString() ?? '',
  );
}

class ZonicAccountService {
  static const apiKey = 'AIzaSyDyPv5ZeGbFvsBE1oADVOciiQqwzAuTJjE';
  static const projectId = 'zonic-music';
  static const _sessionKey = 'zonicFirebaseSession';

  final http.Client _client = http.Client();
  ZonicAccountSession? session;

  ZonicAccountService() {
    final saved = Hive.box('userNoBackup').get(_sessionKey);
    if (saved is Map) session = ZonicAccountSession.fromJson(saved);
  }

  bool get signedIn => session != null && session!.refreshToken.isNotEmpty;

  Future<ZonicAccountSession> signIn(String email, String password) =>
      _authenticate('signInWithPassword', email, password, create: false);

  Future<ZonicAccountSession> signUp(String email, String password) =>
      _authenticate('signUp', email, password, create: true);

  Future<ZonicAccountSession> _authenticate(
    String action,
    String email,
    String password, {
    required bool create,
  }) async {
    final response = await _client
        .post(
          Uri.parse(
            'https://identitytoolkit.googleapis.com/v1/accounts:$action?key=$apiKey',
          ),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'email': email.trim(),
            'password': password,
            'returnSecureToken': true,
          }),
        )
        .timeout(const Duration(seconds: 20));
    final data = jsonDecode(response.body) as Map;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError(_message(data['error']?['message']?.toString()));
    }
    final pairingCode = await _profile(data, create: create);
    session = ZonicAccountSession(
      idToken: data['idToken'].toString(),
      refreshToken: data['refreshToken'].toString(),
      uid: data['localId'].toString(),
      email: data['email'].toString(),
      expiresAt:
          DateTime.now().millisecondsSinceEpoch +
          (int.tryParse(data['expiresIn']?.toString() ?? '') ?? 3600) * 1000,
      pairingCode: pairingCode,
    );
    await Hive.box('userNoBackup').put(_sessionKey, session!.toJson());
    return session!;
  }

  Future<String> _profile(Map auth, {required bool create}) async {
    final uid = auth['localId'].toString();
    final token = auth['idToken'].toString();
    final url = Uri.parse(
      'https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/users/$uid',
    );
    final headers = {
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
    };
    if (!create) {
      final response = await _client.get(url, headers: headers);
      if (response.statusCode == 200) {
        final document = jsonDecode(response.body) as Map;
        final code = document['fields']?['tvPairingCode']?['stringValue']
            ?.toString();
        if (code != null && RegExp(r'^\d{5}$').hasMatch(code)) return code;
      }
    }
    final code = (10000 + Random.secure().nextInt(90000)).toString();
    final fields = <String, Object>{
      'email': {'stringValue': auth['email'].toString()},
      'tvPairingCode': {'stringValue': code},
      if (create) ...{
        'termsVersion': {'stringValue': '2026-10-17'},
        'privacyVersion': {'stringValue': '2026-10-17'},
        'consentAt': {
          'timestampValue': DateTime.now().toUtc().toIso8601String(),
        },
      },
    };
    final response = await _client.patch(
      url,
      headers: headers,
      body: jsonEncode({'fields': fields}),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Your account profile could not be saved.');
    }
    return code;
  }

  Future<void> signOut() async {
    session = null;
    await Hive.box('userNoBackup').delete(_sessionKey);
  }

  /// Stores account-scoped settings (such as a Dropbox refresh token). Firestore
  /// rules limit this document to the signed-in user; playlist content remains
  /// normal, shareable library data as requested.
  Future<void> writePrivate(String name, String payload) async {
    final active = await _freshSession();
    final url = Uri.parse(
      'https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/users/${active.uid}/private/$name',
    );
    final response = await _client.patch(
      url,
      headers: {
        'Authorization': 'Bearer ${active.idToken}',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'fields': {
          'payload': {'stringValue': payload},
        },
      }),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Could not save your secure account connection.');
    }
  }

  Future<String?> readPrivate(String name) async {
    final active = await _freshSession();
    final url = Uri.parse(
      'https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/users/${active.uid}/private/$name',
    );
    final response = await _client.get(
      url,
      headers: {'Authorization': 'Bearer ${active.idToken}'},
    );
    if (response.statusCode == 404) return null;
    if (response.statusCode != 200)
      throw StateError('Could not read your account connection.');
    return (jsonDecode(
      response.body,
    ) as Map)['fields']?['payload']?['stringValue']?.toString();
  }

  Future<void> deletePrivate(String name) async {
    final active = await _freshSession();
    final url = Uri.parse(
      'https://firestore.googleapis.com/v1/projects/$projectId/databases/(default)/documents/users/${active.uid}/private/$name',
    );
    final response = await _client.delete(
      url,
      headers: {'Authorization': 'Bearer ${active.idToken}'},
    );
    if (response.statusCode != 200 &&
        response.statusCode != 204 &&
        response.statusCode != 404) {
      throw StateError('Could not disconnect the account connection.');
    }
  }

  Future<ZonicAccountSession> _freshSession() async {
    final current = session;
    if (current == null)
      throw StateError('Sign in to your Zonic account first.');
    if (current.expiresAt > DateTime.now().millisecondsSinceEpoch + 60000)
      return current;
    final response = await _client.post(
      Uri.parse('https://securetoken.googleapis.com/v1/token?key=$apiKey'),
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body:
          'grant_type=refresh_token&refresh_token=${Uri.encodeQueryComponent(current.refreshToken)}',
    );
    final data = jsonDecode(response.body) as Map;
    if (response.statusCode != 200)
      throw StateError('Your sign-in session expired. Please sign in again.');
    session = ZonicAccountSession(
      idToken: data['id_token'].toString(),
      refreshToken: data['refresh_token'].toString(),
      uid: data['user_id'].toString(),
      email: current.email,
      expiresAt:
          DateTime.now().millisecondsSinceEpoch +
          (int.tryParse(data['expires_in']?.toString() ?? '') ?? 3600) * 1000,
      pairingCode: current.pairingCode,
    );
    await Hive.box('userNoBackup').put(_sessionKey, session!.toJson());
    return session!;
  }

  String _message(String? code) => switch (code?.split(' : ').first) {
    'EMAIL_EXISTS' => 'That email is already registered.',
    'EMAIL_NOT_FOUND' => 'No account was found for that email.',
    'INVALID_PASSWORD' ||
    'INVALID_LOGIN_CREDENTIALS' => 'The email or password is incorrect.',
    'INVALID_EMAIL' => 'Enter a valid email address.',
    'WEAK_PASSWORD' => 'Use a password with at least 6 characters.',
    'TOO_MANY_ATTEMPTS_TRY_LATER' => 'Too many attempts. Try again later.',
    _ => 'Authentication failed. Please try again.',
  };
}
