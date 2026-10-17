import { dbRead, dbWrite } from './library.js';
import { isNative, nativeRequest } from './native.js';

const APP_KEY = 'bpdb3vsvzzdgzk7';
const AUTH_KEY = 'dropbox-auth';
const FILE_PATH = '/zonic-playlists.json';
const REDIRECT_URI = location.hostname === 'localhost' ? `${location.origin}/dropbox-callback` : 'https://zonic-music.web.app/dropbox-callback';
const base64Url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomValue = (length = 48) => base64Url(crypto.getRandomValues(new Uint8Array(length)));
async function challenge(value) { return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }

export class CloudSync {
  constructor(ctx) { this.ctx = ctx; this.status = { state: 'unlinked', revision: '', updatedAt: 0 }; this.auth = null; this.accountProvider = () => null; }
  get configured() { return !!APP_KEY; }
  setTokenProvider() {}
  setAccountProvider(provider) { this.accountProvider = provider; }
  get account() { return this.accountProvider?.() || null; }
  async loadAuth() { if (!this.auth) this.auth = await dbRead(this.ctx.db, 'state', AUTH_KEY) || {}; return this.auth; }
  async saveAuth(value) { this.auth = value; await dbWrite(this.ctx.db, 'state', AUTH_KEY, value); }
  async saveAccountAuth(value) {
    const account = this.account;
    if (!account?.signedIn || !account.uid) throw new Error('Sign in to your Zonic account first.');
    await account.writePrivate('dropbox', JSON.stringify({ version: 2, refreshToken: value.refreshToken }));
    await this.saveAuth({ ...value, accountUid: account.uid });
  }
  async connect() {
    if (!this.account?.signedIn) throw new Error('Sign in to your Zonic account before connecting Dropbox.');
    const verifier = randomValue(64), state = `${isNative ? 'n' : 'w'}.${randomValue(32)}`;
    await this.saveAuth({ verifier, state });
    const url = new URL('https://www.dropbox.com/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: APP_KEY, response_type: 'code', redirect_uri: REDIRECT_URI, code_challenge: await challenge(verifier), code_challenge_method: 'S256', token_access_type: 'offline', state }).toString();
    if (isNative) await nativeRequest('open-url', { url: url.href }); else location.assign(url.href);
  }
  async completeCallback(value = location.href) {
    const url = new URL(value), code = url.searchParams.get('code'), state = url.searchParams.get('state');
    if (!code || !state) return false;
    const saved = await this.loadAuth();
    if (!saved.verifier || saved.state !== state) throw new Error('Dropbox sign-in could not be verified. Please try again.');
    const body = new URLSearchParams({ code, grant_type: 'authorization_code', client_id: APP_KEY, redirect_uri: REDIRECT_URI, code_verifier: saved.verifier });
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok || !result.refresh_token) throw new Error(result.error_description || 'Dropbox sign-in failed.');
    await this.saveAccountAuth({ refreshToken: result.refresh_token, accessToken: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 });
    await this.refreshStatus(); return true;
  }
  async accessToken() {
    const saved = await this.loadAuth();
    if (saved.accessToken && saved.expiresAt > Date.now() + 60000) return saved.accessToken;
    if (!saved.refreshToken) throw new Error('Connect Dropbox first.');
    const body = new URLSearchParams({ refresh_token: saved.refreshToken, grant_type: 'refresh_token', client_id: APP_KEY });
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error_description || 'Dropbox session expired.');
    await this.saveAuth({ ...saved, accessToken: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 }); return result.access_token;
  }
  async refreshStatus() {
    const saved = await this.loadAuth();
    const account = this.account;
    if (!account?.signedIn) return this.status = { state: 'signed-out', revision: '', updatedAt: 0 };
    if (!saved.refreshToken || (saved.accountUid && saved.accountUid !== account.uid)) {
      try {
        const payload = await account.readPrivate('dropbox');
        if (!payload) return this.status = { state: 'unlinked', revision: '', updatedAt: 0 };
        const remote = JSON.parse(payload);
        if (remote.version !== 2 || !remote.refreshToken) return this.status = { state: 'reconnect', revision: '', updatedAt: 0 };
        await this.saveAuth({ refreshToken: remote.refreshToken, accountUid: account.uid });
      } catch (error) { return this.status = { state: 'error', error: error.message, revision: '', updatedAt: 0 }; }
    } else if (!saved.accountUid || saved.recoveryKey) {
      await this.saveAccountAuth({ ...saved, recoveryKey: undefined });
    }
    try {
      const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', { method: 'POST', headers: { Authorization: `Bearer ${await this.accessToken()}` }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Dropbox connection needs attention.');
      return this.status = { state: 'linked', revision: saved.revision || '', updatedAt: saved.updatedAt || 0 };
    } catch (error) { return this.status = { state: 'error', error: error.message, revision: '', updatedAt: 0 }; }
  }
  async unlink() { if (this.account?.signedIn) await this.account.deletePrivate('dropbox'); await this.saveAuth({}); this.status = { state: 'unlinked', revision: '', updatedAt: 0 }; }
  async lock() { await this.saveAuth({}); this.status = { state: 'signed-out', revision: '', updatedAt: 0 }; }
  async pull() {
    const response = await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Dropbox-API-Arg': JSON.stringify({ path: FILE_PATH }) }, signal: AbortSignal.timeout(20000) });
    if (response.status === 409) return { schemaVersion: 2, playlists: [], revision: '' };
    if (!response.ok) throw new Error('Could not download playlists from Dropbox.');
    const data = await response.json(); if (!Array.isArray(data.playlists)) throw new Error('Dropbox playlist data is invalid.'); return data;
  }
  async push(playlists, expectedRevision = '') {
    const revision = `${Date.now().toString(36)}-${randomValue(6)}`;
    const payload = JSON.stringify({ schemaVersion: 2, revision, expectedRevision, updatedAt: Date.now(), playlists });
    const response = await fetch('https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: FILE_PATH, mode: 'overwrite', autorename: false, mute: true }) }, body: payload, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Could not upload playlists to Dropbox.');
    const saved = await this.loadAuth(); await this.saveAuth({ ...saved, revision, updatedAt: Date.now() });
    this.status = { state: 'linked', revision, updatedAt: Date.now() }; return { revision };
  }
}
