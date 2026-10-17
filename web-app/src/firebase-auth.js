const key = 'zonic-firebase-session';
let config;
const pairingCodePattern = /^\d{5}$/;
const messages = {
  EMAIL_EXISTS: 'That email is already registered. Try logging in instead.',
  EMAIL_NOT_FOUND: 'No account was found for that email.',
  INVALID_PASSWORD: 'That password is incorrect.',
  INVALID_LOGIN_CREDENTIALS: 'The email or password is incorrect.',
  INVALID_EMAIL: 'Enter a valid email address.',
  WEAK_PASSWORD: 'Use a password with at least 6 characters.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Wait a moment and try again.',
  USER_DISABLED: 'This account has been disabled.',
  CONFIGURATION_NOT_FOUND: 'Zonic accounts are not enabled yet. The app owner must enable Email/Password in Firebase Authentication.',
  OPERATION_NOT_ALLOWED: 'Email and password accounts are not enabled in Firebase yet.',
};
function authError(code) { return new Error(messages[String(code || '').split(' : ')[0]] || 'Authentication failed. Please try again.'); }
async function endpoint(action) {
  if (!config) {
    const response = await fetch(new URL('../firebase-config.json', import.meta.url));
    if (!response.ok) throw new Error('Account settings could not load. Please try again.');
    const loaded = await response.json();
    if (!loaded.apiKey) throw new Error('Account settings are incomplete.');
    config = loaded;
  }
  return `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(config.apiKey)}`;
}

function randomPairingCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(10000 + values[0] % 90000);
}

function firestoreValue(value) { return { stringValue: String(value) }; }
function firestoreString(document, name) { return document?.fields?.[name]?.stringValue || ''; }
function privateDocumentUrl(projectId, userId, name) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(userId)}/private/${encodeURIComponent(name)}`;
}

export class FirebaseAuth {
  constructor() { try { this.session = JSON.parse(localStorage.getItem(key) || 'null'); } catch { this.session = null; } if (this.session?.refreshToken && this.session.expiresAt <= Date.now() + 60000) this.refresh().catch(() => {}); }
  get signedIn() { return !!this.session?.idToken && (!this.session.expiresAt || this.session.expiresAt > Date.now()); }
  get email() { return this.session?.email || ''; }
  get pairingCode() { return pairingCodePattern.test(this.session?.pairingCode || '') ? this.session.pairingCode : ''; }
  get idToken() { return this.session?.idToken || ''; }
  get uid() { return this.session?.localId || ''; }
  save(session) { this.session = session; if (session) localStorage.setItem(key, JSON.stringify(session)); else localStorage.removeItem(key); }
  async profile(session, create = false, consent = null) {
    if (!config) await endpoint('signInWithPassword');
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/users/${encodeURIComponent(session.localId)}`;
    const headers = { Authorization: `Bearer ${session.idToken}`, 'Content-Type': 'application/json' };
    if (!create) {
      const response = await fetch(url, { headers });
      if (response.ok) {
        const document = await response.json();
        const pairingCode = firestoreString(document, 'tvPairingCode');
        if (pairingCodePattern.test(pairingCode)) return pairingCode;
      } else if (response.status !== 404) throw new Error('Your account profile could not load. Please try again.');
    }
    const pairingCode = randomPairingCode();
    const fields = { email: firestoreValue(session.email), tvPairingCode: firestoreValue(pairingCode) };
    if (create && consent) {
      fields.termsVersion = firestoreValue(consent.termsVersion);
      fields.privacyVersion = firestoreValue(consent.privacyVersion);
      fields.consentAt = { timestampValue: new Date().toISOString() };
    }
    const response = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
    if (!response.ok) throw new Error('Your TV pairing code could not be saved. Please try again.');
    return pairingCode;
  }
  async request(action, email, password, consent = null) {
    const response = await fetch(await endpoint(action), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
    const data = await response.json();
    if (!response.ok) throw authError(data?.error?.message);
    const session = { idToken: data.idToken, refreshToken: data.refreshToken, localId: data.localId, email: data.email, expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000 };
    session.pairingCode = await this.profile(session, action === 'signUp', consent);
    this.save(session); return this.session;
  }
  async refresh() {
    if (!this.session?.refreshToken) return null;
    if (!config) await endpoint('signInWithPassword');
    const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.session.refreshToken }) });
    const data = await response.json();
    if (!response.ok) { this.save(null); throw authError(data?.error?.message); }
    this.save({ ...this.session, idToken: data.id_token, refreshToken: data.refresh_token || this.session.refreshToken, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 });
    return this.session;
  }
  async token() {
    if (!this.session?.refreshToken) throw new Error('Sign in to your Zonic account first.');
    if (!this.session.idToken || this.session.expiresAt <= Date.now() + 60000) await this.refresh();
    return this.session.idToken;
  }
  async readPrivate(name) {
    if (!config) await endpoint('signInWithPassword');
    const response = await fetch(privateDocumentUrl(config.projectId, this.uid, name), { headers: { Authorization: `Bearer ${await this.token()}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Your encrypted account data could not be loaded.');
    const document = await response.json();
    return firestoreString(document, 'payload') || null;
  }
  async writePrivate(name, payload) {
    if (!config) await endpoint('signInWithPassword');
    const response = await fetch(privateDocumentUrl(config.projectId, this.uid, name), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { payload: firestoreValue(payload), updatedAt: { timestampValue: new Date().toISOString() } } }),
    });
    if (!response.ok) throw new Error('Your encrypted account data could not be saved.');
  }
  async deletePrivate(name) {
    if (!config) await endpoint('signInWithPassword');
    const response = await fetch(privateDocumentUrl(config.projectId, this.uid, name), { method: 'DELETE', headers: { Authorization: `Bearer ${await this.token()}` } });
    if (!response.ok && response.status !== 404) throw new Error('Your encrypted account data could not be removed.');
  }
  signUp(email, password, consent) { return this.request('signUp', email, password, consent); }
  signIn(email, password) { return this.request('signInWithPassword', email, password); }
  signOut() { this.save(null); }
}
