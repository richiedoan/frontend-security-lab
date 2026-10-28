import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import OidcInspection from '../app/auth/oidc-inspection';
import type { BrowserIdentity, DisplayClaims } from '../app/auth/oidc-session';

function identity(): BrowserIdentity {
  return {
    authenticated: true,
    idTokenParsed: {
      sub: 'id-subject', iss: 'id-issuer', aud: 'security-web', exp: 1800000000,
      preferred_username: 'alice', name: '<img src=x onerror=alert(1)>',
      given_name: 'Alice', family_name: 'Example',
      nonce: 'SECRET_NONCE', email: 'PRIVATE_EMAIL', custom: 'PRIVATE_CUSTOM',
    } as DisplayClaims,
    tokenParsed: {
      sub: 'access-subject', iss: 'access-issuer', aud: ['security-api', 'account'], exp: 1800000300,
      name: 'ACCESS_PROFILE_EXCLUDED', scope: 'SCOPE_EXCLUDED',
    } as DisplayClaims,
    init: async () => true, login: async () => {}, clearToken() { this.authenticated = false; },
  };
}

test('inspection separates consumers, escapes profile text and excludes secrets and extra claims', () => {
  const client = identity();
  // Fail if inspection reads raw credentials, even without rendering them.
  for (const name of ['token', 'idToken', 'refreshToken', 'refreshTokenParsed']) {
    Object.defineProperty(client, name, { get() { assert.fail(`Read credential: ${name}`); } });
  }
  const original = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('Inspection must not send any API request');
  try {
    const html = renderToStaticMarkup(<OidcInspection identity={client} />);
    for (const expected of ['id-subject', 'id-issuer', 'security-web', 'access-subject',
      'access-issuer', 'security-api, account', '2027-01-15T08:00:00.000Z',
      '2027-01-15T08:05:00.000Z', 'alice', 'Alice', 'Example',
      'Never send an ID token to the resource API', '&lt;img']) assert.ok(html.includes(expected), expected);
    for (const excluded of ['SECRET_NONCE', 'PRIVATE_EMAIL', 'PRIVATE_CUSTOM',
      'ACCESS_PROFILE_EXCLUDED', 'SCOPE_EXCLUDED', '<img']) assert.ok(!html.includes(excluded), excluded);
    const [idSection, accessSection] = html.split('<h3>Access token');
    assert.ok(!idSection.includes('access-subject'));
    assert.ok(!accessSection.includes('id-subject'));
  } finally { globalThis.fetch = original; }
});

test('signed-out, cleared and missing sessions disclose no claims even if stale parsed data remains', () => {
  const client = identity();
  client.clearToken();
  for (const value of [client, undefined]) {
    const html = renderToStaticMarkup(<OidcInspection identity={value} />);
    assert.ok(html.includes('Sign in above'));
    assert.ok(!html.includes('id-subject'));
    assert.ok(!html.includes('access-subject'));
    assert.ok(!html.includes('<dl>'));
  }
});

test('missing and malformed display claims use a placeholder without serializing objects', () => {
  const client = identity();
  client.idTokenParsed = undefined;
  client.tokenParsed = {
    sub: { secret: 'OBJECT_SECRET' }, aud: ['security-api', { secret: 'OBJECT_SECRET' }],
    exp: 1e16,
  } as unknown as DisplayClaims;
  const html = renderToStaticMarkup(<OidcInspection identity={client} />);
  assert.ok(html.includes('Not provided'));
  assert.ok(!html.includes('OBJECT_SECRET'));
  assert.ok(!html.includes('[object Object]'));
});
