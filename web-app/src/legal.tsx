import { useState } from 'react';
import { createRoot } from 'react-dom/client';

const VERSION = '2026-10-17';
const isPrivacy = location.pathname.endsWith('/privacy.html');
const storageKey = `zonic-${isPrivacy ? 'privacy' : 'terms'}-accepted`;

function Terms() {
  return <>
    <h1>Terms of Use</h1><p className="effective">Effective October 17, 2026 · Version {VERSION}</p>
    <p>These terms govern your use of Zonic. By creating an account or using Zonic, you agree to these terms.</p>
    <h2>Using Zonic</h2><p>You may use Zonic to organize, play, and manage music you are authorized to access. You are responsible for following copyright law, provider terms, and the laws that apply where you live.</p>
    <h2>Your account</h2><p>Keep your login and connected-device codes private. You are responsible for activity performed through your account and devices. Tell us through the project support page if you believe your account or a release has been compromised.</p>
    <h2>Third-party services</h2><p>Zonic can interact with services such as Firebase, Dropbox, YouTube, and GitHub. Those services have their own terms and availability. Zonic is not affiliated with or endorsed by those providers.</p>
    <h2>Prohibited activity</h2><ul><li>Do not use Zonic to infringe copyright or distribute content without permission.</li><li>Do not attack, disrupt, reverse engineer credentials, or bypass provider restrictions.</li><li>Do not use another person’s account or connected storage without permission.</li></ul>
    <h2>Availability and changes</h2><p>Zonic is provided “as is” without a promise that every stream, integration, or feature will always be available. Features and these terms may change. If an updated agreement is required, the app will ask you to review it again.</p>
    <h2>Open-source software</h2><p>Zonic’s source code is provided under its repository license. The license governs copying and modification of the software; these Terms govern use of the hosted services and accounts.</p>
    <h2>Ending use</h2><p>You may stop using Zonic and disconnect Dropbox at any time. Access may be restricted when necessary to protect users, providers, or the service.</p>
    <h2>Support</h2><p>Questions and reports can be submitted through the Zonic GitHub repository.</p>
  </>;
}

function Privacy() {
  return <>
    <h1>Privacy Policy</h1><p className="effective">Effective October 17, 2026 · Version {VERSION}</p>
    <p>This policy explains what Zonic handles when you use the app and an optional Zonic account.</p>
    <h2>Information Zonic handles</h2><ul><li>Firebase Authentication processes your email address, password authentication, account identifier, and session credentials.</li><li>Firestore stores your five-digit TV pairing code, accepted policy versions and time, and the Dropbox credential when you connect Dropbox.</li><li>Your library, playback history, settings, and downloads are normally stored on your device.</li><li>Playlist data you choose to sync is stored in your Dropbox account and is not end-to-end encrypted.</li></ul>
    <h2>Dropbox account access</h2><p>The reusable Dropbox credential is stored in the private Firestore area for your Zonic account so Dropbox can connect automatically on another device after you sign in. It is protected by Firebase account access rules, but it is not end-to-end encrypted and authorized Firebase project administrators could access it.</p>
    <h2>External requests</h2><p>Searches, song identifiers, streaming requests, artwork requests, and playlist links may be sent to the relevant music or media provider. Update checks contact GitHub. Dropbox receives sync requests only after you connect it.</p>
    <h2>Why information is used</h2><p>Information is used to authenticate accounts, pair approved devices, synchronize requested content, provide playback and search, remember preferences, prevent abuse, and deliver updates.</p>
    <h2>Sharing</h2><p>Zonic does not sell personal information. Information is sent to service providers only as needed to operate features you choose, or when required for security or law.</p>
    <h2>Retention and control</h2><p>You can disconnect Dropbox and remove local app data. Deleting an app account or requesting deletion of cloud account data currently requires contacting the project through GitHub support. Data held by third-party services is also subject to their controls and retention policies.</p>
    <h2>Security limits</h2><p>No service can guarantee absolute security. Firebase can process account email and authentication data, and can read the TV pairing code and Dropbox credential required for those features. Dropbox can see ordinary playlist files and file metadata.</p>
    <h2>Children</h2><p>Zonic accounts are not intended for children under 13 or the minimum digital-consent age in their location without permission from a parent or guardian.</p>
    <h2>Questions</h2><p>Privacy questions and deletion requests can be submitted through the Zonic GitHub repository.</p>
  </>;
}

function LegalPage() {
  const [accepted, setAccepted] = useState(localStorage.getItem(storageKey) === VERSION);
  const accept = () => { localStorage.setItem(storageKey, VERSION); setAccepted(true); window.opener?.postMessage({ type: 'zonic-policy-accepted', policy: isPrivacy ? 'privacy' : 'terms', version: VERSION }, location.origin); };
  return <main className="legal-page"><a className="back" href="./login.html">← Back to account</a><article className="legal-card">{isPrivacy ? <Privacy /> : <Terms />}<div className="legal-actions">{accepted ? <span className="accepted">✓ Accepted</span> : <button className="primary" onClick={accept}>I have read and accept the {isPrivacy ? 'Privacy Policy' : 'Terms of Use'}</button>}<a href="./login.html">Return to account</a></div></article></main>;
}

createRoot(document.getElementById('root')!).render(<LegalPage />);
