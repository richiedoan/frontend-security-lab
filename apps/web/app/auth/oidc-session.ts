export const CALLBACK_URI = 'http://localhost:3000/auth/callback';
export const INIT_OPTIONS = {
  flow: 'standard' as const,
  pkceMethod: 'S256' as const,
  useNonce: true,
  responseMode: 'query' as const,
  redirectUri: CALLBACK_URI,
  checkLoginIframe: false,
};

export interface DisplayClaims {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

export interface BrowserIdentity {
  authenticated?: boolean;
  tokenParsed?: DisplayClaims;
  idTokenParsed?: DisplayClaims;
  realmAccess?: { roles: string[] };
  init(options: typeof INIT_OPTIONS): Promise<boolean>;
  login(options: { redirectUri: string }): Promise<void>;
  clearToken(): void;
  onTokenExpired?: () => void;
}

// The adapter owns callback parsing, state/nonce validation and token exchange.
// An unrecognized callback can resolve false; it must never look like success.
export async function initializeIdentity(
  identity: BrowserIdentity,
  callback: boolean,
  cleanUrl: () => void,
): Promise<void> {
  try {
    const authenticated = await identity.init(INIT_OPTIONS);
    if (callback && !authenticated) throw new Error('Callback rejected');
  } catch {
    identity.clearToken();
    throw new Error('Sign-in could not be verified. Start a new login from the Day 5 page.');
  } finally {
    if (callback) cleanUrl();
  }
}
