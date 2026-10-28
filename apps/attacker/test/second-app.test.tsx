import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLIENT_CONFIG, CALLBACK_URI, initializeSecondIdentity, type SecondIdentity } from '../app/second-app/session';

function adapter(init: SecondIdentity['init']): SecondIdentity {
  return { init, login: async () => {}, authenticated: false,
    clearToken() { this.authenticated = false; } };
}

test('second-app callback uses its own client, exact redirect and code flow protections', async () => {
  assert.equal(CLIENT_CONFIG.clientId, 'security-second-app');
  assert.equal(CALLBACK_URI, 'http://localhost:3001/second-app/callback');
  const events: string[] = [];
  const client = adapter(async options => {
    assert.deepEqual(options, {
      flow: 'standard', pkceMethod: 'S256', useNonce: true, responseMode: 'query',
      redirectUri: CALLBACK_URI, checkLoginIframe: false,
    });
    events.push('handled');
    return true;
  });
  await initializeSecondIdentity(client, true, () => events.push('cleaned'));
  assert.deepEqual(events, ['handled', 'cleaned']);
});

for (const reason of ['missing state', 'wrong client state', 'replayed state', 'nonce mismatch', 'exchange failure']) {
  test(`second-app callback fails closed: ${reason}`, async () => {
    const client = adapter(async () => {
      if (reason.includes('state')) return false;
      throw new Error('sensitive-provider-response');
    });
    client.authenticated = true;
    let cleaned = false;
    await assert.rejects(initializeSecondIdentity(client, true, () => { cleaned = true; }), {
      message: 'Second-app sign-in could not be verified. Start a new login.',
    });
    assert.equal(client.authenticated, false);
    assert.equal(cleaned, true);
  });
}

test('ordinary visit stays signed out without callback failure or URL cleanup', async () => {
  const second = adapter(async () => false);
  await initializeSecondIdentity(second, false, () => assert.fail('Unexpected URL cleanup'));
  assert.equal(second.authenticated, false);
});
