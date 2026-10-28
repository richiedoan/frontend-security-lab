import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { INSECURE_CSRF } from '../src/csrf-mode';
import { configureCors } from '../src/cors';
import { configureSession } from '../src/session';
import { enableCsrf, TRUSTED_ORIGIN } from './csrf-helper';

// Exercise the global guard through real routes, session cookies, and validation.
describe.each([false, true])('session-bound secure writes (theme bypass=%s)', (insecure) => {
  let app: INestApplication;
  let server: Server;
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(INSECURE_CSRF).useValue(insecure).compile();
    app = moduleRef.createNestApplication();
    configureSession(app);
    configureCors(app, {});
    await app.init();
    server = app.getHttpServer() as Server;
  });
  afterEach(async () => { await app.close(); });

  async function login() {
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', TRUSTED_ORIGIN).send({ username: 'alice' }).expect(200);
    const token = await enableCsrf(agent);
    return { agent, token };
  }

  it('returns a stable existing token without mutating preference, comments, or session on GET', async () => {
    await request(server).get('/session/csrf').expect(401);
    const { agent, token } = await login();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const response = await agent.get('/session/csrf').expect(200).expect('Cache-Control', 'no-store');
    expect(response.body as unknown).toEqual({ csrfToken: token });
    expect(response.headers['set-cookie']).toBeUndefined();
    await agent.get('/profile/theme?theme=dark').expect(200).expect({ theme: 'light' });
    await agent.get('/comments').expect(200).expect({ comments: [] });
  });

  it.each([undefined, '', 'invalid', 'a'.repeat(64)])('rejects missing or wrong token %s without mutation', async (token) => {
    const { agent } = await login();
    const post = agent.post('/comments').unset('x-csrf-token').send({ text: 'must not be saved' });
    if (token !== undefined) post.set('x-csrf-token', token);
    await post.expect(403);
    await agent.get('/comments').expect(200).expect({ comments: [] });
  });

  it.each([undefined, 'null', 'http://localhost:3001', 'http://localhost:3000.evil.invalid'])('requires trusted Origin even with a valid token (%s)', async (origin) => {
    const { agent } = await login();
    const post = agent.post('/comments').unset('Origin').send({ text: 'blocked' });
    if (origin !== undefined) post.set('Origin', origin);
    await post.expect(403);
    await agent.get('/comments').expect(200).expect({ comments: [] });
  });

  it('binds tokens to individual sessions even for the same user and rotates at login', async () => {
    const first = await login();
    const second = await login();
    expect(first.token).not.toBe(second.token);
    await second.agent.post('/comments').set('x-csrf-token', first.token).send({ text: 'blocked' }).expect(403);
    await second.agent.post('/session/login').send({ username: 'alice' }).expect(200);
    await second.agent.post('/comments').send({ text: 'old token' }).expect(403);
    const rotated = await enableCsrf(second.agent);
    expect(rotated).not.toBe(second.token);
    await second.agent.post('/comments').send({ text: '<script>inert</script>' }).expect(201);
    await second.agent.post('/session/logout').expect(204);
    await second.agent.get('/session/csrf').expect(401);
    await second.agent.post('/comments').send({ text: 'after logout' }).expect(401);
  });

  it('protects PATCH, DELETE, logout, and the old counter POST regardless of theme bypass', async () => {
    const { agent } = await login();
    const before = await agent.get('/documents/alice-plan').expect(200);
    await agent.patch('/documents/alice-plan').unset('x-csrf-token').send({ title: 'blocked' }).expect(403);
    await agent.get('/documents/alice-plan').expect(200).expect(before.body as object);
    await agent.delete('/comments/xss-demo').unset('x-csrf-token').expect(403);
    await agent.delete('/comments/xss-demo/execution').unset('x-csrf-token').expect(403);
    await agent.delete('/comments/xss-demo/storage').unset('x-csrf-token').expect(403);
    await agent.post('/session/logout').unset('x-csrf-token').expect(403);
    await agent.get('/session/me').expect(200);
    await agent.post('/transfer').unset('x-csrf-token').send({ amount: 1 }).expect(403);
    await agent.post('/transfer').send({ amount: 1 }).expect(201).expect({ amount: 1, labCounter: 1 });
    await agent.patch('/documents/alice-plan').send({ title: 'allowed' }).expect(200);
    await agent.delete('/comments/xss-demo').expect(200);
  });

  it('does not accept CSRF tokens supplied in body or query instead of the custom header', async () => {
    const { agent, token } = await login();
    await agent.post(`/comments?csrfToken=${token}`).unset('x-csrf-token')
      .send({ text: 'blocked', csrfToken: token }).expect(403);
  });

  it('rejects login CSRF before replacing an existing session', async () => {
    const { agent, token } = await login();
    await agent.post('/session/login').set('Origin', 'http://localhost:3001').send({ username: 'bob' }).expect(403);
    await agent.post('/session/login').unset('Origin').send({ username: 'bob' }).expect(403);
    await agent.get('/session/csrf').expect(200).expect({ csrfToken: token });
    await agent.get('/session/me').expect(200).expect({ user: { id: 'alice', displayName: 'Alice', role: 'user' } });
  });

  it('never grants untrusted origins credentialed token reads, and varies all responses by Origin', async () => {
    const { agent } = await login();
    for (const origin of ['http://localhost:3001', 'null', 'http://localhost:3000.evil.invalid']) {
      const response = await agent.get('/session/csrf').set('Origin', origin).expect(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
      expect(response.headers.vary).toContain('Origin');
      const preflight = await agent.options('/comments').set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'x-csrf-token');
      expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
      expect(preflight.headers['access-control-allow-credentials']).toBeUndefined();
    }
    const allowed = await agent.options('/comments').set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token').expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(TRUSTED_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(allowed.headers['access-control-allow-methods']).toBe('GET,POST,PATCH,DELETE');
    expect(allowed.headers['access-control-allow-headers']).toBe('Content-Type,x-lab-user,x-csrf-token');
    expect(allowed.headers.vary).toContain('Origin');
  });
});
