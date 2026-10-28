export const CLIENT_CONFIG = {
  url: 'http://localhost:8080', realm: 'lab', clientId: 'security-second-app',
};
export const CALLBACK_URI = 'http://localhost:3001/second-app/callback';
export const INIT_OPTIONS = {
  flow: 'standard' as const, pkceMethod: 'S256' as const, useNonce: true,
  responseMode: 'query' as const, redirectUri: CALLBACK_URI, checkLoginIframe: false,
};

export interface SecondIdentity {
  authenticated?: boolean;
  idTokenParsed?: { sub?: string; preferred_username?: string; name?: string };
  init(options: typeof INIT_OPTIONS): Promise<boolean>;
  login(options: { redirectUri: string }): Promise<void>;
  clearToken(): void;
  onTokenExpired?: () => void;
}

export async function initializeSecondIdentity(
  identity: SecondIdentity, callback: boolean, cleanUrl: () => void,
) {
  try {
    const authenticated = await identity.init(INIT_OPTIONS);
    if (callback && !authenticated) throw new Error('Callback rejected');
  } catch {
    identity.clearToken();
    throw new Error('Second-app sign-in could not be verified. Start a new login.');
  } finally {
    if (callback) cleanUrl();
  }
}
