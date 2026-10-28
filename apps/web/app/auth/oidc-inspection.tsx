import type { BrowserIdentity, DisplayClaims } from './oidc-session';

const absent = 'Not provided';
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : absent;

function Claims({ claims, profile = false }: { claims?: DisplayClaims; profile?: boolean }) {
  const audience = claims?.aud;
  const expiry = claims?.exp;
  const date = typeof expiry === 'number' && Number.isSafeInteger(expiry)
    ? new Date(expiry * 1000) : undefined;
  return <dl>
    <dt>Subject (sub)</dt><dd>{text(claims?.sub)}</dd>
    <dt>Issuer (iss)</dt><dd>{text(claims?.iss)}</dd>
    <dt>Audience (aud)</dt><dd>{Array.isArray(audience)
      ? audience.length && audience.every(item => typeof item === 'string') ? audience.join(', ') : absent
      : text(audience)}</dd>
    <dt>Expiry (exp, UTC)</dt><dd>{date && Number.isFinite(date.getTime()) ? date.toISOString() : absent}</dd>
    {profile && <>
      <dt>Username</dt><dd>{text(claims?.preferred_username)}</dd>
      <dt>Display name</dt><dd>{text(claims?.name)}</dd>
      <dt>Given name</dt><dd>{text(claims?.given_name)}</dd>
      <dt>Family name</dt><dd>{text(claims?.family_name)}</dd>
    </>}
  </dl>;
}

// Read only adapter-handled parsed claims. Never decode, serialize or request tokens here.
export default function OidcInspection({ identity }: { identity?: BrowserIdentity }) {
  return <section id="inspection" aria-labelledby="inspection-title">
    <h2 id="inspection-title">Day 6: OIDC inspection</h2>
    <p>Selected claims handled by the OIDC client, for display only. This view does not verify signatures or grant API permissions.</p>
    <h3>ID token — sign-in identity</h3>
    <p>Consumer: this web client (security-web). Describes the sign-in and display profile. Never send an ID token to the resource API.</p>
    {identity?.authenticated && <Claims claims={identity.idTokenParsed} profile />}
    <h3>Access token — resource API access</h3>
    <p>Consumer: the resource API (security-api). The API must validate the access token and enforce authorization on every request.</p>
    {identity?.authenticated && <Claims claims={identity.tokenParsed} />}
    {!identity?.authenticated && <p>Sign in above to inspect selected claims.</p>}
    <p>Full tokens are never displayed. This inspection view makes no resource API requests.</p>
  </section>;
}
