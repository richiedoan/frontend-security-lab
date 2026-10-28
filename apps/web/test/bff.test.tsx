import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBff } from '../server/bff';

const ORIGIN = 'http://localhost:3000';
const ACCESS = 'server-access-secret';
const REFRESH = 'server-refresh-secret';
const pair = (suffix = '') => ({ access_token: ACCESS + suffix, refresh_token: REFRESH + suffix, token_type: 'Bearer', expires_in: 300 });
type Call = { url: string; init: RequestInit };

function fixture(responder?: (call: Call) => Promise<Response>) {
  let time = 1_000_000;
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    if (call.url.endsWith('/token/login')) return Response.json(pair());
    if (responder) return responder(call);
    if (call.url.endsWith('/token/refresh')) return Response.json(pair('-rotated'));
    return Response.json({ id: 'alice-private', title: 'Private draft', ownerId: 'alice',
      access_token: ACCESS, refresh_token: REFRESH, nested: pair() }, {
      headers: { 'Set-Cookie': `upstream=${REFRESH}`, 'Authorization': `Bearer ${ACCESS}` },
    });
  };
  const handle = createBff({ fetcher, now: () => time, enabled: () => true });
  let cookie = '';
  let csrf = '';
  async function call(path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) {
    return handle(new Request(`${ORIGIN}${path}`, { method, headers: {
      Cookie: cookie, Origin: ORIGIN, 'X-CSRF-Token': csrf,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...extra,
    }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  }
  async function login() {
    const bootstrap = await call('/bff/session');
    cookie = bootstrap.headers.get('set-cookie')!.split(';')[0];
    csrf = (await bootstrap.json()).csrfToken;
    const oldCookie = cookie;
    const oldCsrf = csrf;
    const response = await call('/bff/login', 'POST', { username: 'alice' });
    cookie = response.headers.get('set-cookie')!.split(';')[0];
    const body = await response.clone().json();
    csrf = body.csrfToken;
    assert.notEqual(cookie, oldCookie);
    assert.notEqual(csrf, oldCsrf);
    assert.equal(response.status, 200);
    return response;
  }
  return { call, login, calls, handle, advance: () => { time += 275_000; } };
}

async function noTokens(response: Response) {
  const all = JSON.stringify([...response.headers]) + await response.clone().text();
  assert.ok(!all.includes(ACCESS));
  assert.ok(!all.includes(REFRESH));
  assert.ok(!all.includes('access_token'));
  assert.ok(!all.includes('refresh_token'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
}

test('browser gets opaque HttpOnly session and CSRF only; API gets server bearer and projected responses', async () => {
  const f = fixture();
  const login = await f.login();
  await noTokens(login);
  assert.match(login.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/);
  await noTokens(await f.call('/bff/session'));
  const read = await f.call('/bff/documents/alice-private', 'GET', undefined, { Authorization: 'Bearer browser-controlled', 'X-Forwarded-Host': 'evil.example' });
  assert.deepEqual(await read.clone().json(), { id: 'alice-private', title: 'Private draft', ownerId: 'alice' });
  await noTokens(read);
  const write = await f.call('/bff/documents/alice-private', 'PATCH', { title: 'Updated' });
  assert.equal(write.status, 200);
  await noTokens(write);
  const last = f.calls.at(-1)!;
  assert.equal(last.url, 'http://localhost:4000/token/documents/alice-private');
  assert.deepEqual(last.init.headers, { Authorization: `Bearer ${ACCESS}`, 'Content-Type': 'application/json' });
  assert.equal(last.init.body, JSON.stringify({ title: 'Updated' }));
  assert.equal(last.init.redirect, 'error');
  assert.equal(last.init.credentials, 'omit');
});

test('mutations require session-bound CSRF and the exact Origin before upstream calls', async () => {
  const f = fixture();
  await f.login();
  const other = await f.handle(new Request(`${ORIGIN}/bff/session`));
  const otherCsrf = (await other.json()).csrfToken;
  const count = f.calls.length;
  const invalidHeaders: Record<string, string>[] = [
    { 'X-CSRF-Token': '' }, { 'X-CSRF-Token': otherCsrf },
    { Origin: '' }, { Origin: 'null' }, { Origin: 'http://localhost:3001' },
    { Origin: 'http://localhost:3000.evil.example' }, { Origin: `${ORIGIN}/` },
  ];
  for (const headers of invalidHeaders) {
    const response = await f.call('/bff/documents/alice-private', 'PATCH', { title: 'Blocked' }, headers);
    assert.equal(response.status, 403);
    await noTokens(response);
  }
  assert.equal(f.calls.length, count);
  assert.equal((await f.call('/bff/logout', 'POST', undefined, { 'X-CSRF-Token': '' })).status, 403);
});

test('near-expiry concurrent requests share exactly one refresh and use the rotated token', async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const f = fixture(async call => {
    if (call.url.endsWith('/refresh')) { entered(); await barrier; return Response.json(pair('-rotated')); }
    assert.equal(new Headers(call.init.headers).get('Authorization'), `Bearer ${ACCESS}-rotated`);
    return Response.json({ id: 'alice-private', title: 'Draft', ownerId: 'alice' });
  });
  await f.login();
  f.advance();
  const reads = Array.from({ length: 8 }, () => f.call('/bff/documents/alice-private'));
  await started;
  assert.equal(f.calls.filter(call => call.url.endsWith('/refresh')).length, 1);
  release();
  for (const response of await Promise.all(reads)) { assert.equal(response.status, 200); await noTokens(response); }
  await f.call('/bff/documents/alice-private');
  assert.equal(f.calls.filter(call => call.url.endsWith('/refresh')).length, 1);
  assert.equal(f.calls.filter(call => call.url.includes('/documents/')).length, 9);
});

for (const failure of ['rejected', 'network', 'malformed']) {
  test(`refresh ${failure} clears session and explicitly requires reauthentication without leaking tokens`, async () => {
    const f = fixture(async () => {
      if (failure === 'network') throw new Error(`${ACCESS} ${REFRESH}`);
      return Response.json(failure === 'malformed' ? { access_token: ACCESS } : pair(), { status: failure === 'rejected' ? 401 : 200 });
    });
    await f.login(); f.advance();
    const response = await f.call('/bff/documents/alice-private');
    assert.equal(response.status, 401);
    assert.deepEqual(await response.clone().json(), { error: 'reauthentication_required' });
    assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
    await noTokens(response);
    assert.equal((await f.call('/bff/documents/alice-private')).status, 401);
    assert.equal(f.calls.length, 2); // Login + one refresh; no resource call or retry.
  });
}

test('logout while refreshing cannot resurrect the session or forward a late token', async () => {
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const f = fixture(async call => {
    if (call.url.endsWith('/refresh')) { entered(); await barrier; return Response.json(pair('-late')); }
    assert.ok(call.url.endsWith('/logout'));
    return new Response(null, { status: 204 });
  });
  await f.login(); f.advance();
  const pending = f.call('/bff/documents/alice-private');
  await started;
  assert.equal((await f.call('/bff/logout', 'POST')).status, 200);
  release();
  assert.equal((await pending).status, 401);
  assert.equal((await f.call('/bff/documents/alice-private')).status, 401);
  assert.equal(f.calls.filter(call => call.url.includes('/documents/')).length, 0);
});

test('fixed routes reject proxy destinations, query strings, encoded separators and unsupported mutations', async () => {
  const f = fixture(); await f.login();
  const count = f.calls.length;
  for (const path of ['/bff/proxy', '/bff/http://evil.example', '/bff/documents/alice-private?url=http://evil.example',
    '/bff/documents/alice-private?access_token=browser', '/bff/documents/a%2Fb', '/bff/documents/%252e%252e',
    '/bff/documents/a/extra', '/bff/admin/audit', '/bff/token/refresh']) {
    assert.equal((await f.call(path)).status, 404, path);
  }
  for (const method of ['DELETE', 'PUT', 'POST', 'OPTIONS']) {
    assert.equal((await f.call('/bff/documents/alice-private', method)).status, 405);
  }
  assert.equal((await f.call('/bff/documents/alice-private', 'PATCH', { title: 'ok', url: 'http://evil.example' })).status, 400);
  assert.equal(f.calls.length, count);
});

test('API denial remains final, upstream errors and token-bearing documents are never relayed', async () => {
  for (const status of [401, 403, 404, 500, 302, 200]) {
    const f = fixture(async () => Response.json({ id: 'alice-private', title: ACCESS, ownerId: 'alice', ...pair() }, {
      status, headers: { Location: 'http://evil.example', 'Set-Cookie': `leak=${REFRESH}` },
    }));
    await f.login();
    const response = await f.call('/bff/documents/alice-private');
    assert.equal(response.status, [401, 403, 404].includes(status) ? status : 502);
    await noTokens(response);
    assert.equal(response.headers.get('location'), null);
    assert.equal(f.calls.length, 2);
  }
});

test('BFF is unavailable in production', async () => {
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: 'production' });
  try {
    const handle = createBff({ fetcher: async () => assert.fail('No network') });
    assert.equal((await handle(new Request(`${ORIGIN}/bff/session`))).status, 404);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: previous });
  }
});

test('absolute session expiry rejects access without refreshing or reaching the API', async () => {
  const f = fixture();
  await f.login();
  const before = f.calls.length;
  for (let i = 0; i < 14; i++) f.advance(); // Injected clock passes the one-hour TTL.
  const response = await f.call('/bff/documents/alice-private');
  assert.equal(response.status, 401);
  assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
  assert.equal(f.calls.length, before);
});

test('anonymous bootstrap flooding cannot block new login or evict authenticated sessions', async () => {
  const f = fixture();
  await f.login();
  const abandoned = await f.handle(new Request(`${ORIGIN}/bff/session`));
  const abandonedCookie = abandoned.headers.get('set-cookie')!.split(';')[0];
  const abandonedCsrf = (await abandoned.json()).csrfToken;
  for (let i = 0; i < 1100; i++) {
    assert.equal((await f.handle(new Request(`${ORIGIN}/bff/session`))).status, 200);
  }
  assert.equal((await f.call('/bff/documents/alice-private')).status, 200);

  const bootstrap = await f.handle(new Request(`${ORIGIN}/bff/session`));
  assert.equal(bootstrap.status, 200);
  const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0];
  const csrf = (await bootstrap.json()).csrfToken;
  const login = (Cookie: string, token: string, Origin = ORIGIN) => f.call('/bff/login', 'POST',
    { username: 'alice' }, { Cookie, 'X-CSRF-Token': token, Origin });
  const before = f.calls.length;
  assert.equal((await login(abandonedCookie, abandonedCsrf)).status, 401);
  assert.equal((await login(cookie, abandonedCsrf)).status, 403);
  assert.equal((await login(cookie, csrf, 'http://localhost:3001')).status, 403);
  assert.equal(f.calls.length, before);
  const signedIn = await login(cookie, csrf);
  assert.equal(signedIn.status, 200);
  const rotatedCookie = signedIn.headers.get('set-cookie')!.split(';')[0];
  assert.notEqual(rotatedCookie, cookie);
  assert.notEqual((await signedIn.json()).csrfToken, csrf);
  assert.equal((await f.call('/bff/documents/alice-private', 'GET', undefined, { Cookie: rotatedCookie })).status, 200);
  assert.equal((await login(cookie, csrf)).status, 401);
});

test('session capacity still rejects new bootstraps when every slot is authenticated', async () => {
  const f = fixture();
  for (let i = 0; i < 1000; i++) {
    const bootstrap = await f.handle(new Request(`${ORIGIN}/bff/session`));
    assert.equal(bootstrap.status, 200);
    const cookie = bootstrap.headers.get('set-cookie')!.split(';')[0];
    const csrf = (await bootstrap.json()).csrfToken;
    assert.equal((await f.call('/bff/login', 'POST', { username: 'alice' },
      { Cookie: cookie, 'X-CSRF-Token': csrf })).status, 200);
  }
  const full = await f.handle(new Request(`${ORIGIN}/bff/session`));
  assert.equal(full.status, 503);
  assert.deepEqual(await full.json(), { error: 'session_capacity' });
});
