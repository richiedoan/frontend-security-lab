import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeIdentity, INIT_OPTIONS, type BrowserIdentity } from '../app/auth/oidc-session';

function adapter(init: BrowserIdentity['init']) {
  let cleared = false;
  const identity: BrowserIdentity = {
    init, login: async () => {}, clearToken: () => { cleared = true; },
  };
  return { identity, cleared: () => cleared };
}

test('successful callback delegates security options and cleans URL after adapter processing', async () => {
  const events: string[] = [];
  const { identity, cleared } = adapter(async options => {
    assert.deepEqual(options, INIT_OPTIONS);
    assert.equal(options.flow, 'standard');
    assert.equal(options.pkceMethod, 'S256');
    assert.equal(options.useNonce, true);
    assert.equal(options.redirectUri, 'http://localhost:3000/auth/callback');
    events.push('validated');
    return true;
  });
  await initializeIdentity(identity, true, () => events.push('cleaned'));
  assert.deepEqual(events, ['validated', 'cleaned']);
  assert.equal(cleared(), false);
});

for (const reason of ['missing or unknown state', 'replayed state', 'access_denied', 'nonce mismatch', 'token endpoint failure']) {
  test(`callback fails closed and cleans URL: ${reason}`, async () => {
    const { identity, cleared } = adapter(async () => {
      if (reason.includes('state')) return false;
      throw new Error(`${reason}: sensitive-code-and-state`);
    });
    let cleaned = false;
    await assert.rejects(initializeIdentity(identity, true, () => { cleaned = true; }), error => {
      assert.equal((error as Error).message, 'Sign-in could not be verified. Start a new login from the Day 5 page.');
      return true;
    });
    assert.equal(cleared(), true);
    assert.equal(cleaned, true);
  });
}

test('ordinary unauthenticated visit does not become a callback error or change URL', async () => {
  const { identity, cleared } = adapter(async () => false);
  await initializeIdentity(identity, false, () => assert.fail('Unexpected cleanup'));
  assert.equal(cleared(), false);
});
