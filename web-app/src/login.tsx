import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { FirebaseAuth } from './firebase-auth.js';

const POLICY_VERSION = '2026-10-17';
const accepted = (name: string) => localStorage.getItem(`zonic-${name}-accepted`) === POLICY_VERSION;

function LoginPage() {
  const [auth] = useState(() => new FirebaseAuth());
  const [signedIn, setSignedIn] = useState(auth.signedIn);
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(() => accepted('terms'));
  const [privacyAccepted, setPrivacyAccepted] = useState(() => accepted('privacy'));
  useEffect(() => { document.title = signedIn ? 'Account · Zonic' : signup ? 'Create account · Zonic' : 'Log in · Zonic'; }, [signedIn, signup]);
  useEffect(() => {
    const refreshConsent = () => { setTermsAccepted(accepted('terms')); setPrivacyAccepted(accepted('privacy')); };
    window.addEventListener('focus', refreshConsent); window.addEventListener('storage', refreshConsent); window.addEventListener('message', refreshConsent);
    return () => { window.removeEventListener('focus', refreshConsent); window.removeEventListener('storage', refreshConsent); window.removeEventListener('message', refreshConsent); };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setStatus(signup ? 'Creating your account…' : 'Logging in…');
    if (signup && (!termsAccepted || !privacyAccepted)) { setStatus('Open and accept both the Terms of Use and Privacy Policy first.'); setBusy(false); return; }
    try {
      if (signup) await auth.signUp(email.trim(), password, { termsVersion: POLICY_VERSION, privacyVersion: POLICY_VERSION });
      else await auth.signIn(email.trim(), password);
      setPassword(''); window.location.assign('./');
    }
    catch (error) { setStatus(error instanceof TypeError ? 'Could not connect. Check your connection and try again.' : error instanceof Error ? error.message : 'Could not sign in. Please try again.'); }
    finally { setBusy(false); }
  }
  return <main><a className="back" href="./">← Back to music</a><section className="account-card" aria-labelledby="account-title">
    <a href="./" aria-label="Zonic home"><picture><source media="(prefers-color-scheme: light)" srcSet="./brand/zonic-wordmark-on-light.png" /><img className="logo" src="./brand/zonic-wordmark-on-dark.png" alt="Zonic" /></picture></a>
    <h1 id="account-title">{signedIn ? 'Your account' : signup ? 'Create your account' : 'Welcome back'}</h1>
    <p id="account-description">{signedIn ? 'You’re signed in to Zonic.' : signup ? 'Your music starts here.' : 'Log in to your Zonic account.'}</p>
    {signedIn ? <div id="signed-in"><p id="signed-in-email">{auth.email}</p><section className="pairing-code" aria-labelledby="pairing-code-title"><span id="pairing-code-title">TV pairing code</span><strong>{auth.pairingCode || 'Unavailable'}</strong><p>Use this code to connect Zonic TV controls while both devices are on the same Wi-Fi.</p></section><a className="primary" href="./">Continue to music</a><button className="switch" id="signout" onClick={() => { auth.signOut(); setSignedIn(false); setPassword(''); setStatus('Signed out.'); }}>Sign out</button></div> :
      <form id="login-form" onSubmit={submit} aria-busy={busy}>
        <label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={6} placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
        {signup && <section className="policy-consent" aria-label="Required agreements">
          <p>You must open and accept both documents before creating an account.</p>
          <a className={termsAccepted ? 'accepted' : ''} href="./terms.html" target="_blank" rel="noopener">{termsAccepted ? '✓ Terms of Use accepted' : 'Open Terms of Use'}</a>
          <a className={privacyAccepted ? 'accepted' : ''} href="./privacy.html" target="_blank" rel="noopener">{privacyAccepted ? '✓ Privacy Policy accepted' : 'Open Privacy Policy'}</a>
        </section>}
        <button className="primary" id="submit" type="submit" disabled={busy || (signup && (!termsAccepted || !privacyAccepted))}>{signup ? 'Create account' : 'Log in'}</button>
        <button className="switch" id="switch" type="button" disabled={busy} onClick={() => { setSignup(!signup); setStatus(''); }}>{signup ? 'Already have an account? Log in' : 'New to Zonic? Create an account'}</button>
      </form>}
    <p id="status" role="status" aria-live="polite">{status}</p>
  </section></main>;
}
createRoot(document.getElementById('root')!).render(<LoginPage />);
