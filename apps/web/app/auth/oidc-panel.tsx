'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getIdentity } from './oidc-browser';
import { CALLBACK_URI, type BrowserIdentity } from './oidc-session';
import OidcInspection from './oidc-inspection';

export default function OidcPanel({ callback = false }: { callback?: boolean }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<BrowserIdentity>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [, render] = useState(0);

  useEffect(() => {
    let active = true;
    let client: BrowserIdentity | undefined;
    getIdentity().then(value => {
      if (!active) return;
      client = value;
      value.onTokenExpired = () => {
        value.clearToken();
        setError('Your local session expired. Sign in again.');
        render(n => n + 1);
      };
      setIdentity(value);
      setBusy(false);
      if (callback) router.replace('/labs/oidc');
    }).catch(() => {
      if (!active) return;
      setError('Sign-in could not be verified. Use localhost:3000 and start a new login.');
      setBusy(false);
    });
    return () => {
      active = false;
      if (client) {
        const current = client;
        current.onTokenExpired = () => current.clearToken();
      }
    };
  }, [callback, router]);

  async function login() {
    if (!identity) return;
    setBusy(true);
    setError('');
    try { await identity.login({ redirectUri: CALLBACK_URI }); }
    catch { setError('Unable to start sign-in. Check Keycloak and try again.'); setBusy(false); }
  }

  return <main>
    <h1>Day 5: Keycloak login</h1>
    {process.env.NEXT_PUBLIC_LAB_BUNDLE_MARKER && <p>Public build demonstration marker: {process.env.NEXT_PUBLIC_LAB_BUNDLE_MARKER}</p>}
    <p>Authorization Code with PKCE. Tokens stay in this page’s memory; reloading clears the local session.</p>
    {busy && <p role="status">{callback ? 'Completing sign-in…' : 'Preparing sign-in…'}</p>}
    {error && <p role="alert">{error}</p>}
    {identity?.authenticated ? <section>
      <p>Signed in as <strong>{identity.tokenParsed?.preferred_username ?? identity.tokenParsed?.name ?? identity.tokenParsed?.sub}</strong></p>
      <p>Lab roles: {identity.realmAccess?.roles.filter(role => role === 'user' || role === 'admin').join(', ') || 'none'}</p>
      <button onClick={() => { identity.clearToken(); setError(''); render(n => n + 1); }}>Log out locally</button>
      <p>Local logout clears this app’s tokens. Your Keycloak SSO session remains active.</p>
    </section> : <button disabled={busy || !identity} onClick={login}>Sign in with Keycloak</button>}
    {error && <p><a href="/labs/oidc">Restart Day 5 login</a></p>}
    <OidcInspection identity={identity} />
    <p><a href="http://localhost:3001/second-app" target="_blank" rel="noreferrer noopener">Observe SSO in the separate second app</a></p>
    <p><Link href="/">Back to the lab</Link></p>
  </main>;
}
