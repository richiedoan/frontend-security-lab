'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSecondIdentity } from './browser';
import { CALLBACK_URI, type SecondIdentity } from './session';

export default function SecondAppPanel({ callback = false }: { callback?: boolean }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<SecondIdentity>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [, render] = useState(0);

  useEffect(() => {
    let active = true;
    let client: SecondIdentity | undefined;
    getSecondIdentity().then(value => {
      if (!active) return;
      client = value;
      value.onTokenExpired = () => {
        value.clearToken();
        setError('This app’s local session expired. Sign in again.');
        render(n => n + 1);
      };
      setIdentity(value);
      setBusy(false);
      if (callback) router.replace('/second-app');
    }).catch(() => {
      if (!active) return;
      setError('Second-app sign-in could not be verified. Use localhost:3001 and start a new login.');
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
    catch { setError('Unable to start second-app login. Check Keycloak and retry.'); setBusy(false); }
  }

  const profile = identity?.idTokenParsed;
  const name = profile?.preferred_username ?? profile?.name;
  return <main>
    <h1>Second app: Keycloak SSO observation</h1>
    <p>Client: security-second-app. Origin: http://localhost:3001.</p>
    <p>This app starts its own Authorization Code + PKCE flow. An existing Keycloak session may let you return without entering a password.</p>
    {busy && <p role="status">{callback ? 'Completing second-app sign-in…' : 'Preparing second-app sign-in…'}</p>}
    {error && <p role="alert">{error}</p>}
    {identity?.authenticated ? <section>
      <h2>Signed in to the second app</h2>
      <p>{typeof name === 'string' ? name : 'Authenticated lab user'}</p>
      <button onClick={() => { identity.clearToken(); setError(''); render(n => n + 1); }}>Log out of this app locally</button>
    </section> : <button disabled={busy || !identity} onClick={login}>Sign in to second app with Keycloak</button>}
    <p>Tokens stay in this document’s memory and are never displayed or sent to the resource API. Reloading or local logout clears this app’s session; it does not end Keycloak SSO or the first app’s session.</p>
    {error && <p><a href="/second-app">Restart second-app login</a></p>}
    <p><a href="http://localhost:3000/labs/oidc" target="_blank" rel="noreferrer noopener">Open first app in another tab</a></p>
    <p><a href="/attacker">Open separate attacker lab (leaves this app)</a></p>
  </main>;
}
