import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const realm = JSON.parse(readFileSync(new URL('./realms/lab-realm.json', import.meta.url), 'utf8'));

// This validates the lab contract, not the entire Keycloak import schema.
function checkSanitized(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert(!/secret|credential|privatekey|passwordhash/i.test(key), `Sensitive field: ${key}`);
    assert.notEqual(key.toLowerCase(), 'password', 'Do not store passwords');
    checkSanitized(child);
  }
}
checkSanitized(realm);
assert.equal(realm.realm, 'lab');
assert.equal(realm.enabled, true);
assert.equal(realm.sslRequired, 'external');
assert.equal(realm.registrationAllowed, false);
assert.equal(realm.resetPasswordAllowed, false);
assert.deepEqual(realm.roles.realm.map(({ name }) => name).sort(), ['admin', 'user']);
assert.equal(realm.clients.length, 2);
const [client] = realm.clients;
assert.equal(client.clientId, 'security-web');
for (const client of realm.clients) {
  assert.equal(client.protocol, 'openid-connect');
  for (const field of ['enabled', 'publicClient', 'standardFlowEnabled']) {
    assert.equal(client[field], true, field);
  }
  for (const field of ['bearerOnly', 'implicitFlowEnabled', 'directAccessGrantsEnabled',
    'serviceAccountsEnabled', 'authorizationServicesEnabled', 'fullScopeAllowed']) {
    assert.equal(client[field], false, field);
  }
  assert.equal(client.attributes['pkce.code.challenge.method'], 'S256');
  assert.equal(client.attributes['oauth2.device.authorization.grant.enabled'], 'false');
  assert.equal(client.attributes['oidc.ciba.grant.enabled'], 'false');
}
assert.deepEqual(client.redirectUris, ['http://localhost:3000/auth/callback']);
assert.deepEqual(client.webOrigins, ['http://localhost:3000']);
assert.deepEqual(client.defaultClientScopes, ['profile', 'email', 'roles', 'documents:read']);
assert.deepEqual(client.optionalClientScopes, []);
assert.deepEqual(realm.scopeMappings, [{ client: 'security-web', roles: ['user', 'admin'] }]);
assert.deepEqual(realm.users.map(({ username }) => username).sort(), ['admin', 'alice', 'bob']);
for (const user of realm.users) {
  assert.equal(user.enabled, true);
  assert.equal(user.email, `${user.username}@example.invalid`);
  assert.deepEqual(user.realmRoles, user.username === 'admin' ? ['user', 'admin'] : ['user']);
  assert.deepEqual(user.requiredActions, ['UPDATE_PASSWORD']);
  assert.equal(user.clientRoles, undefined, 'No Keycloak management role assignments');
}

assert.deepEqual(realm.clientScopes, [{ name: 'documents:read', protocol: 'openid-connect',
  attributes: { 'include.in.token.scope': 'true', 'display.on.consent.screen': 'false' } }]);
assert.deepEqual(client.protocolMappers, [{ name: 'security-api-audience', protocol: 'openid-connect',
  protocolMapper: 'oidc-audience-mapper', consentRequired: false,
  config: { 'included.custom.audience': 'security-api', 'access.token.claim': 'true', 'id.token.claim': 'false' } }]);
for (const [index, user] of realm.users.entries()) {
  assert.equal(user.id, `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
}

console.log('Day 5 realm JSON, client security settings, role assignments, and credential omission: OK');

const second = realm.clients[1];
assert.equal(second.clientId, 'security-second-app');
assert.deepEqual(second.redirectUris, ['http://localhost:3001/second-app/callback']);
assert.deepEqual(second.webOrigins, ['http://localhost:3001']);
assert.deepEqual(second.defaultClientScopes, ['profile']);
assert.deepEqual(second.optionalClientScopes, []);
assert.deepEqual(second.protocolMappers, []);
console.log('Second public client, exact callback and origin, no API audience/scope: OK');
