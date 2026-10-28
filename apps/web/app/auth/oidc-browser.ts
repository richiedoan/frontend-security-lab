import { initializeIdentity, type BrowserIdentity } from './oidc-session';

let initialization: Promise<BrowserIdentity> | undefined;

// One instance/promise per document also prevents Strict Mode from consuming
// the same one-time callback twice. A full reload intentionally loses tokens.
export function getIdentity(): Promise<BrowserIdentity> {
  if (typeof window === 'undefined') throw new Error('Browser only');
  if (!initialization) {
    initialization = (async () => {
      const callback = window.location.pathname === '/auth/callback';
      const cleanUrl = () => window.history.replaceState(window.history.state, '', '/auth/callback');
      try {
        if (window.location.origin !== 'http://localhost:3000') {
          throw new Error('Use http://localhost:3000 for this lab.');
        }
        const { default: Keycloak } = await import('keycloak-js');
        const identity = new Keycloak({ url: 'http://localhost:8080', realm: 'lab', clientId: 'security-web' });
        await initializeIdentity(identity, callback, cleanUrl);
        identity.onTokenExpired = () => identity.clearToken();
        return identity;
      } catch {
        if (callback) cleanUrl();
        throw new Error('Sign-in could not be verified. Open http://localhost:3000/labs/oidc and start a new login.');
      }
    })();
  }
  return initialization;
}
