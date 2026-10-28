import { CLIENT_CONFIG, initializeSecondIdentity, type SecondIdentity } from './session';

// Owned only by this application document; no imports from the port 3000 app.
let initialization: Promise<SecondIdentity> | undefined;

export function getSecondIdentity(): Promise<SecondIdentity> {
  if (typeof window === 'undefined') throw new Error('Browser only');
  return initialization ??= (async () => {
    const callback = window.location.pathname === '/second-app/callback';
    const cleanUrl = () => window.history.replaceState(window.history.state, '', '/second-app/callback');
    try {
      if (window.location.origin !== 'http://localhost:3001') throw new Error('Wrong origin');
      const { default: Keycloak } = await import('keycloak-js');
      const identity = new Keycloak(CLIENT_CONFIG);
      await initializeSecondIdentity(identity, callback, cleanUrl);
      identity.onTokenExpired = () => identity.clearToken();
      return identity;
    } catch {
      if (callback) cleanUrl();
      throw new Error('Second-app sign-in could not be verified. Use localhost:3001 and start a new login.');
    }
  })();
}
