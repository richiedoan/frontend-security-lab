import assert from 'node:assert/strict';
import { test } from 'node:test';
import Keycloak from 'keycloak-js';

test('real adapter rejects wrong/missing state without exchanging a code', async () => {
  const names = ['window', 'location', 'localStorage', 'isSecureContext', 'fetch'];
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  let requests = 0;
  const storage = {};
  Object.defineProperties(storage, {
    getItem: { value: key => storage[key] ?? null },
    setItem: { value: (key, value) => { storage[key] = value; } },
    removeItem: { value: key => { delete storage[key]; } },
  });
  try {
    Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    globalThis.fetch = () => { requests++; throw new Error('Network forbidden in offline test'); };
    for (const query of ['code=synthetic-code&state=wrong-state', 'code=synthetic-code', 'error=access_denied&state=wrong-state']) {
      const location = new URL(`http://localhost:3000/auth/callback?${query}`);
      globalThis.location = location;
      globalThis.window = { location, history: { state: null, replaceState: (_state, _title, url) => { location.href = url; } } };
      const identity = new Keycloak({ url: 'http://localhost:8080', realm: 'lab', clientId: 'security-web' });
      const authenticated = await identity.init({ flow: 'standard', responseMode: 'query',
        pkceMethod: 'S256', useNonce: true, checkLoginIframe: false });
      assert.equal(authenticated, false);
      assert.equal(identity.token, undefined);
    }
    assert.equal(requests, 0);
  } finally {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
