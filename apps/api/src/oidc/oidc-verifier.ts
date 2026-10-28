import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export const OIDC_ISSUER = 'http://localhost:8080/realms/lab';
export const OIDC_AUDIENCE = 'security-api';
export const OIDC_KEYS = Symbol('OIDC_KEYS');
export type OidcKeys = () => Promise<JWTVerifyGetKey>;

// Lazy discovery leaves the earlier labs usable while Keycloak is stopped.
// Neither issuer nor key URLs ever come from an unverified token.
export function discoverKeys(fetcher: typeof fetch = fetch): OidcKeys {
  let pending: Promise<JWTVerifyGetKey> | undefined;
  return () => pending ??= (async () => {
    try {
      const response = await fetcher(`${OIDC_ISSUER}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      if (!response.ok) throw new Error('Discovery unavailable');
      const metadata = await response.json() as { issuer?: unknown; jwks_uri?: unknown };
      if (metadata.issuer !== OIDC_ISSUER ||
        metadata.jwks_uri !== `${OIDC_ISSUER}/protocol/openid-connect/certs`) {
        throw new Error('Untrusted discovery metadata');
      }
      return createRemoteJWKSet(new URL(metadata.jwks_uri), {
        timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 600000,
      });
    } catch (error) {
      pending = undefined;
      throw error;
    }
  })();
}

export interface OidcPrincipal {
  subject: string;
  scopes: string[];
  roles: string[];
}

export async function verifyOidcToken(token: string, key: JWTVerifyGetKey): Promise<OidcPrincipal> {
  const { payload } = await jwtVerify(token, key, {
    algorithms: ['RS256'], issuer: OIDC_ISSUER, audience: OIDC_AUDIENCE,
    requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat', 'typ', 'azp', 'scope'],
    clockTolerance: 0,
  });
  // Keycloak's signed payload typ is Bearer for access tokens, ID for ID tokens.
  // JWT header typ alone cannot distinguish them.
  if (payload.typ !== 'Bearer' || payload.azp !== 'security-web' ||
    typeof payload.sub !== 'string' || !payload.sub.trim() ||
    typeof payload.scope !== 'string' || !Number.isSafeInteger(payload.exp) ||
    !Number.isSafeInteger(payload.iat) || payload.iat! > Date.now() / 1000 ||
    payload.exp! <= payload.iat!) throw new Error('Invalid access claims');
  const access = payload.realm_access;
  let roles: unknown = [];
  if (access !== undefined) {
    if (!access || typeof access !== 'object' || Array.isArray(access)) throw new Error('Invalid roles');
    roles = (access as { roles?: unknown }).roles;
    if (!Array.isArray(roles) || !roles.every(role => typeof role === 'string')) throw new Error('Invalid roles');
  }
  return {
    subject: payload.sub,
    scopes: payload.scope.split(/\s+/).filter(scope => scope === 'documents:read'),
    roles: (roles as string[]).filter(role => role === 'user' || role === 'admin'),
  };
}
