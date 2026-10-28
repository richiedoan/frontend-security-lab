import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { generateKeyPair, SignJWT, type JWTPayload } from 'jose';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { INSECURE_AUTHZ_MODE } from '../src/authz-mode';
import { TOKEN_KEY } from '../src/token/token-key';
import { TOKEN_AUDIENCE, TOKEN_ISSUER, type TokenPair } from '../src/token/token.service';

interface NegativeCase {
  name: string;
  claims?: Record<string, unknown>;
  omit?: string;
  variant?: 'payload' | 'signature' | 'wrong-key' | 'HS256';
  document?: string;
  status: number;
}

const negativeCases: NegativeCase[] = [
  { name: 'tampered payload', variant: 'payload', status: 401 },
  { name: 'tampered signature', variant: 'signature', status: 401 },
  { name: 'different signing key', variant: 'wrong-key', status: 401 },
  { name: 'expired token', claims: { iat: 1, exp: 2 }, status: 401 },
  { name: 'wrong issuer', claims: { iss: 'https://untrusted.example' }, status: 401 },
  { name: 'wrong audience', claims: { aud: 'another-api' }, status: 401 },
  { name: 'disallowed HS256 algorithm', variant: 'HS256', status: 401 },
  { name: 'not yet valid', claims: { nbf: 4_000_000_000 }, status: 401 },
  { name: 'invalid not-before type', claims: { nbf: 'tomorrow' }, status: 401 },
  { name: 'future issued-at', claims: { iat: 4_000_000_000, exp: 4_000_000_300 }, status: 401 },
  ...['iss', 'aud', 'sub', 'exp', 'iat', 'scope', 'role', 'jti'].map(omit => ({
    name: `missing ${omit}`, omit, status: 401,
  })),
  { name: 'invalid scope type', claims: { scope: ['documents:read'] }, status: 401 },
  { name: 'invalid role type', claims: { role: ['user'] }, status: 401 },
  { name: 'empty subject', claims: { sub: '' }, status: 401 },
  { name: 'empty token ID', claims: { jti: '' }, status: 401 },
  { name: 'empty scope', claims: { scope: '' }, status: 403 },
  { name: 'insufficient scope', claims: { scope: 'documents:write' }, status: 403 },
  { name: 'scope substring is insufficient', claims: { scope: 'other:documents:read' }, status: 403 },
  { name: 'insufficient role', claims: { role: 'guest' }, status: 403 },
  { name: 'non-owner document', document: 'bob-notes', status: 403 },
  { name: 'admin cannot bypass ownership', claims: { sub: 'admin', role: 'admin' }, status: 403 },
  { name: 'editor cannot bypass ownership', claims: { sub: 'bob' }, document: 'alice-plan', status: 403 },
  { name: 'viewer cannot bypass ownership', claims: { sub: 'bob' }, document: 'alice-notes', status: 403 },
];

describe('bearer document authentication and authorization', () => {
  let app: INestApplication;
  let server: Server;
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  let otherKeys: Awaited<ReturnType<typeof generateKeyPair>>;

  beforeAll(async () => {
    keys = await generateKeyPair('ES256', { extractable: true });
    otherKeys = await generateKeyPair('ES256', { extractable: true });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TOKEN_KEY).useValue(() => Promise.resolve(keys.privateKey))
      // Even the session lab's insecure mode must never disable token authorization.
      .overrideProvider(INSECURE_AUTHZ_MODE).useValue(true).compile();
    app = module.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });
  afterAll(async () => { await app.close(); });

  function claims(): JWTPayload {
    const now = Math.floor(Date.now() / 1000);
    return { iss: TOKEN_ISSUER, aud: TOKEN_AUDIENCE, sub: 'alice', iat: now,
      exp: now + 300, jti: randomUUID(), scope: 'documents:read', role: 'user' };
  }

  it.each(negativeCases)('rejects $name with $status', async testCase => {
    const payload = { ...claims(), ...testCase.claims };
    if (testCase.omit) delete payload[testCase.omit];
    const algorithm = testCase.variant === 'HS256' ? 'HS256' : 'ES256';
    // A separate random HMAC secret safely constructs a real, but disallowed, HS256 JWT.
    const key = testCase.variant === 'HS256' ? randomBytes(32)
      : testCase.variant === 'wrong-key' ? otherKeys.privateKey : keys.privateKey;
    let token = await new SignJWT(payload).setProtectedHeader({ alg: algorithm, typ: 'JWT' }).sign(key);
    if (testCase.variant === 'payload') {
      const parts = token.split('.');
      parts[1] = Buffer.from(JSON.stringify({ ...payload, role: 'admin' })).toString('base64url');
      token = parts.join('.');
    }
    if (testCase.variant === 'signature') {
      const parts = token.split('.');
      const signature = Buffer.from(parts[2], 'base64url');
      signature[0] ^= 1;
      parts[2] = signature.toString('base64url');
      token = parts.join('.');
    }
    await request(server).get(`/token/documents/${testCase.document ?? 'alice-private'}`)
      .set('Authorization', `Bearer ${token}`).expect(testCase.status);
  });

  it.each([
    ['alice', 'alice-private'], ['bob', 'bob-notes'], ['admin', 'admin-runbook'],
  ])('accepts a login-issued access token for owner %s', async (username, document) => {
    const login = await request(server).post('/token/login').send({ username }).expect(200);
    const pair = login.body as TokenPair;
    await request(server).get(`/token/documents/${document}`)
      .set('Authorization', `Bearer ${pair.access_token}`).expect(200)
      .expect('Cache-Control', 'no-store').expect(response => {
        expect(response.body as unknown).toMatchObject({ id: document, ownerId: username });
      });
    await request(server).get(`/token/documents/${document}`)
      .set('Authorization', `Bearer ${pair.refresh_token}`).expect(401);
  });

  it('accepts a past not-before and rejects tokens from query parameters or decoded headers', async () => {
    const token = await new SignJWT({ ...claims(), nbf: Math.floor(Date.now() / 1000) - 1 })
      .setProtectedHeader({ alg: 'ES256', typ: 'JWT' }).sign(keys.privateKey);
    await request(server).get('/token/documents/alice-private').set('Authorization', `Bearer ${token}`).expect(200);
    await request(server).get('/token/documents/alice-private').query({ access_token: token })
      .set('X-User-Id', 'alice').set('X-Role', 'admin').expect(401);
    await request(server).get('/token/documents/missing').set('Authorization', `Bearer ${token}`).expect(404);
  });

  it.each([undefined, 'Basic abc', 'Bearer malformed', 'Bearer a.b.c', 'Bearer a.b.c extra'])(
    'rejects a missing or malformed Authorization header: %s', async header => {
      const call = request(server).get('/token/documents/alice-private');
      if (header) call.set('Authorization', header);
      await call.expect(401);
    });

  it('permits only owner title mutations with both read and write scopes', async () => {
    const login = await request(server).post('/token/login').send({ username: 'alice' }).expect(200);
    const pair = login.body as TokenPair;
    await request(server).patch('/token/documents/alice-private')
      .set('Authorization', `Bearer ${pair.access_token}`).send({ title: 'BFF updated title', ownerId: 'bob' })
      .expect(200).expect(response => {
        expect(response.body as unknown).toMatchObject({ title: 'BFF updated title', ownerId: 'alice' });
      });
    await request(server).get('/token/documents/alice-private')
      .set('Authorization', `Bearer ${pair.access_token}`).expect(200)
      .expect(response => { expect((response.body as { title: string }).title).toBe('BFF updated title'); });
    await request(server).patch('/token/documents/bob-notes')
      .set('Authorization', `Bearer ${pair.access_token}`).send({ title: 'Forbidden' }).expect(403);
    for (const changes of [
      { scope: 'documents:read' }, { scope: 'documents:write' },
      { scope: 'documents:read documents:write', role: 'guest' },
      { scope: 'documents:read documents:write', role: 'admin', sub: 'admin' },
    ]) {
      const token = await new SignJWT({ ...claims(), ...changes })
        .setProtectedHeader({ alg: 'ES256', typ: 'JWT' }).sign(keys.privateKey);
      await request(server).patch('/token/documents/alice-private')
        .set('Authorization', `Bearer ${token}`).send({ title: 'Forbidden' }).expect(403);
    }
    await request(server).patch('/token/documents/alice-private')
      .set('Authorization', `Bearer ${pair.access_token}`).send({ title: '' }).expect(400);
    await request(server).patch('/token/documents/alice-private')
      .set('Origin', 'http://localhost:3001').set('Authorization', `Bearer ${pair.access_token}`)
      .send({ title: 'Forbidden origin' }).expect(403);
    await request(server).patch('/token/documents/alice-private')
      .set('Cookie', 'lab_bff_session=fake').send({ title: 'No bearer' }).expect(401);
  });
});
