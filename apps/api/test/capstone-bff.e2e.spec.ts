import { type INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { generateKeyPair } from 'jose';
import type { Server } from 'node:http';
import request from 'supertest';
import { createBff } from '../../web/server/bff';
import { AppModule } from '../src/app.module';
import { configureCors } from '../src/cors';
import { INSECURE_AUTHZ_MODE } from '../src/authz-mode';
import { INSECURE_CSRF } from '../src/csrf-mode';
import { TOKEN_KEY } from '../src/token/token-key';

const ORIGIN = 'http://localhost:3000';

// Real BFF handler -> Nest HTTP routes -> real JOSE verification. No provider,
// fixed port, persistent key, browser, or mocked successful API response.
describe('capstone local BFF/API security integration', () => {
  let app: INestApplication;
  let server: Server;
  let handle: ReturnType<typeof createBff>;
  let secrets: string[];
  let calls: number;
  let previousEnv: string | undefined;

  beforeEach(async () => {
    previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    secrets = [];
    calls = 0;
    // Never emit request data or credentials in test artifacts.
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const keys = await generateKeyPair('ES256', { extractable: true });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TOKEN_KEY).useValue(() => Promise.resolve(keys.privateKey))
      .overrideProvider(INSECURE_AUTHZ_MODE).useValue(true)
      .overrideProvider(INSECURE_CSRF).useValue(true).compile();
    app = module.createNestApplication();
    configureCors(app, {});
    await app.init();
    server = app.getHttpServer() as Server;
    const fetcher: typeof fetch = async (input, init = {}) => {
      const url = new URL(input instanceof Request ? input.url : input);
      expect(url.origin).toBe('http://localhost:4000');
      expect(init.redirect).toBe('error');
      expect(init.credentials).toBe('omit');
      const headers = new Headers(init.headers);
      expect(headers.has('cookie')).toBe(false);
      expect(headers.has('x-forwarded-host')).toBe(false);
      calls++;
      const client = request(server);
      const call = init.method === 'POST' ? client.post(url.pathname)
        : init.method === 'PATCH' ? client.patch(url.pathname) : client.get(url.pathname);
      headers.forEach((value, name) => { call.set(name, value); });
      if (typeof init.body === 'string') call.send(init.body);
      const result = await call;
      if (url.pathname === '/token/login' && result.status === 200) {
        const pair = result.body as { access_token: string; refresh_token: string };
        secrets.push(pair.access_token, pair.refresh_token);
      }
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(result.headers as Record<string, string | string[]>)) {
        for (const item of Array.isArray(value) ? value : [value]) responseHeaders.append(name, item);
      }
      return new Response(result.status === 204 ? null : result.text,
        { status: result.status, headers: responseHeaders });
    };
    handle = createBff({ fetcher });
  });

  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  });

  async function browser(path: string, method = 'GET', cookie = '', csrf = '', body?: object, origin = ORIGIN) {
    const response = await handle(new Request(`${ORIGIN}${path}`, { method,
      headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': csrf,
        'Content-Type': 'application/json', Authorization: 'Bearer synthetic-browser-injection',
        'X-Forwarded-Host': 'untrusted.invalid' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    const wire = JSON.stringify([...response.headers]) + await response.clone().text();
    // Assert booleans so assertion failures cannot print credential values.
    expect(secrets.some(secret => wire.includes(secret))).toBe(false);
    expect(/access_token|refresh_token/.test(wire)).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
    return response;
  }

  async function bootstrap() {
    const response = await browser('/bff/session');
    expect(response.status).toBe(200);
    const data = await response.json() as { csrfToken: string };
    return { cookie: response.headers.get('set-cookie')!.split(';')[0], csrf: data.csrfToken };
  }

  async function login() {
    const anonymous = await bootstrap();
    const response = await browser('/bff/login', 'POST', anonymous.cookie, anonymous.csrf, { username: 'alice' });
    expect(response.status).toBe(200);
    const header = response.headers.get('set-cookie')!;
    expect(/; Path=\/bff; HttpOnly; SameSite=Strict; Max-Age=3600$/.test(header)).toBe(true);
    const cookie = header.split(';')[0];
    const data = await response.json() as { csrfToken: string };
    expect(cookie === anonymous.cookie).toBe(false);
    expect(data.csrfToken === anonymous.csrf).toBe(false);
    expect((await browser('/bff/documents/alice-private', 'GET', anonymous.cookie)).status).toBe(401);
    return { cookie, csrf: data.csrfToken };
  }

  it('keeps real signed tokens server-side and enforces owner reads/writes despite insecure lab flags', async () => {
    const { cookie, csrf } = await login();
    const own = await browser('/bff/documents/alice-private', 'GET', cookie);
    expect(own.status).toBe(200);
    expect(Object.keys(await own.json() as object).sort()).toEqual(['id', 'ownerId', 'title']);
    expect((await browser('/bff/documents/bob-notes', 'GET', cookie)).status).toBe(403);
    expect((await browser('/bff/documents/bob-notes', 'PATCH', cookie, csrf, { title: 'blocked' })).status).toBe(403);
    expect((await browser('/bff/documents/alice-private', 'PATCH', cookie, csrf, { title: 'allowed' })).status).toBe(200);
    const updated = await browser('/bff/documents/alice-private', 'GET', cookie);
    expect((await updated.json() as { title: string }).title).toBe('allowed');
  });

  it('rejects missing/cross-session CSRF and foreign Origin before reaching the API', async () => {
    const { cookie, csrf } = await login();
    const other = await bootstrap();
    const before = calls;
    for (const token of ['', other.csrf]) {
      expect((await browser('/bff/documents/alice-private', 'PATCH', cookie, token, { title: 'blocked' })).status).toBe(403);
    }
    expect((await browser('/bff/documents/alice-private', 'PATCH', cookie, csrf, { title: 'blocked' }, 'http://localhost:3001')).status).toBe(403);
    expect(calls).toBe(before);
  });

  it('logout invalidates the BFF session and revokes its real refresh family', async () => {
    const { cookie, csrf } = await login();
    expect((await browser('/bff/logout', 'POST', cookie, csrf)).status).toBe(200);
    const before = calls;
    expect((await browser('/bff/documents/alice-private', 'GET', cookie)).status).toBe(401);
    expect(calls).toBe(before);
    const revoked = await request(server).post('/token/refresh').send({ refresh_token: secrets[1] });
    expect(revoked.status).toBe(401);
    // Explicit limitation: logout does not revoke the already-signed access token.
    const access = await request(server).get('/token/documents/alice-private').auth(secrets[0], { type: 'bearer' });
    expect(access.status).toBe(200);
  });

  it('rejects browser-selected destinations without any upstream call', async () => {
    const { cookie } = await login();
    const before = calls;
    for (const path of ['/bff/proxy', '/bff/documents/alice-private?url=http://untrusted.invalid', '/bff/documents/a%2Fb']) {
      expect((await browser(path, 'GET', cookie)).status).toBe(404);
    }
    expect(calls).toBe(before);
  });

  it('characterizes the bearer CORS gap without claiming browser access works', async () => {
    const response = await request(server).options('/oidc/me').set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'GET').set('Access-Control-Request-Headers', 'authorization');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
    const headers = String(response.headers['access-control-allow-headers']).toLowerCase().split(',');
    expect(headers.includes('authorization')).toBe(false);
  });
});
