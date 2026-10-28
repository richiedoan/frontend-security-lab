import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from '../app.module';
import { configureSession } from '../session';
import { OIDC_AUDIENCE, OIDC_ISSUER, OIDC_KEYS, discoverKeys } from './oidc-verifier';

describe('isolated OIDC resource server (real JOSE, local JWKS)', () => {
  let app: INestApplication;
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  let otherKeys: Awaited<ReturnType<typeof generateKeyPair>>;
  const alice = '00000000-0000-4000-8000-000000000001';
  const bob = '00000000-0000-4000-8000-000000000002';

  beforeAll(async () => {
    keys = await generateKeyPair('RS256');
    otherKeys = await generateKeyPair('RS256');
    const jwk = await exportJWK(keys.publicKey);
    const resolver = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OIDC_KEYS).useValue(() => Promise.resolve(resolver)).compile();
    app = module.createNestApplication();
    configureSession(app);
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  async function token(overrides: JWTPayload = {}, signingKey = keys.privateKey) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: OIDC_ISSUER, aud: OIDC_AUDIENCE, sub: alice,
      iat: now, exp: now + 300, typ: 'Bearer', azp: 'security-web',
      scope: 'openid documents:read', realm_access: { roles: ['user'] }, ...overrides })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: 'test-key' }).sign(signingKey);
  }
  const get = (path: string, jwt: string) => request(app.getHttpServer() as Server).get(path).auth(jwt, { type: 'bearer' });

  it('accepts a signed access token and maps only approved scopes and realm roles', async () => {
    const jwt = await token({ scope: 'openid documents:read other', realm_access: { roles: ['user', 'ignored'] },
      resource_access: { 'realm-management': { roles: ['admin'] } } });
    const response = await get('/oidc/me', jwt).expect(200);
    expect(response.body).toEqual({ subject: alice, scopes: ['documents:read'], roles: ['user'] });
    expect(response.headers['cache-control']).toBe('no-store');
    await get('/oidc/documents/alice-notes', jwt).expect(200);
    await get('/oidc/admin/audit', jwt).expect(403);
  });

  it.each([
    ['wrong issuer', { iss: 'http://untrusted.invalid/realms/lab' }],
    ['wrong audience', { aud: 'security-web' }],
    ['expired', { exp: 1 }],
    ['missing expiry', { exp: undefined }],
    ['future not-before', { nbf: 9999999999 }],
    ['ID token even with API audience', { typ: 'ID' }],
    ['missing access-token type', { typ: undefined }],
    ['wrong authorized party', { azp: 'other-client' }],
    ['malformed realm roles', { realm_access: { roles: 'admin' } }],
  ] as [string, JWTPayload][] )('rejects %s', async (_name, claims) => {
    const response = await get('/oidc/me', await token(claims)).expect(401);
    expect((response.body as { message: string }).message).toBe('Invalid access token');
  });

  it('rejects forged signatures and unsigned tokens', async () => {
    await get('/oidc/me', await token({}, otherKeys.privateKey)).expect(401);
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{}').toString('base64url')}.`;
    await get('/oidc/me', unsigned).expect(401);
  });

  it('requires exact scope and user role for documents', async () => {
    await get('/oidc/documents/alice-notes', await token({ scope: 'documents:read-all' })).expect(403);
    await get('/oidc/documents/alice-notes', await token({ realm_access: { roles: ['admin'] } })).expect(403);
    await get('/oidc/admin/audit', await token({ realm_access: { roles: ['admin'] } })).expect(200);
  });

  it('compares ownership to verified sub; username, query owner and admin role cannot override it', async () => {
    await get('/oidc/documents/alice-notes?ownerSubject=' + bob, await token({ sub: bob,
      preferred_username: 'alice', realm_access: { roles: ['user', 'admin'] } })).expect(403);
    await get('/oidc/documents/bob-notes', await token({ sub: bob })).expect(200);
  });

  it('does not accept session cookies or query tokens as OIDC credentials', async () => {
    const agent = request.agent(app.getHttpServer() as Server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
    await agent.get('/oidc/me').expect(401);
    await request(app.getHttpServer() as Server).get('/oidc/me').query({ access_token: await token() }).expect(401);
  });

  it('does not mix OIDC, Day 4 local tokens and Day 2 session authentication', async () => {
    const local = await request(app.getHttpServer() as Server).post('/token/login').send({ username: 'alice' }).expect(200);
    await get('/oidc/me', (local.body as { access_token: string }).access_token).expect(401);
    const jwt = await token();
    await get('/token/documents/alice-notes', jwt).expect(401);
    await get('/documents/alice-notes', jwt).expect(401);
  });
});

describe('trusted discovery boundary', () => {
  it('discovers once, caches the resolver, and does not fetch admin endpoints', async () => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue(new Response(JSON.stringify({
      issuer: OIDC_ISSUER, jwks_uri: `${OIDC_ISSUER}/protocol/openid-connect/certs`,
    })));
    const keys = discoverKeys(fetcher);
    expect(await keys()).toBe(await keys());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`${OIDC_ISSUER}/.well-known/openid-configuration`);
  });
  it.each([
    { issuer: 'https://wrong.invalid', jwks_uri: `${OIDC_ISSUER}/protocol/openid-connect/certs` },
    { issuer: OIDC_ISSUER, jwks_uri: 'http://untrusted.invalid/keys' },
  ])('rejects untrusted metadata and permits retry after a failed discovery', async metadata => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(metadata))));
    const keys = discoverKeys(fetcher);
    await expect(keys()).rejects.toThrow('Untrusted discovery');
    await expect(keys()).rejects.toThrow('Untrusted discovery');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
