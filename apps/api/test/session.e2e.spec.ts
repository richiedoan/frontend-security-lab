import { enableCsrf } from './csrf-helper';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request, { type Response } from 'supertest';
import { AppModule } from '../src/app.module';
import { configureSession } from '../src/session';

function getCookie(response: Response): string {
  const setCookie = response.headers['set-cookie'] as unknown;
  if (!Array.isArray(setCookie) || typeof setCookie[0] !== 'string') {
    throw new Error('Expected a session cookie');
  }

  const cookie = setCookie[0].split(';')[0];
  if (!cookie) throw new Error('Expected a session cookie value');
  return cookie;
}

describe('local session authentication (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureSession(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unauthenticated request', async () => {
    await request(server).get('/session/me').expect(401);
  });

  it('logs in with a lab username and emits the local cookie attributes', async () => {
    const response = await request(server)
      .post('/session/login').set('Origin', 'http://localhost:3000')
      .send({ username: 'alice' })
      .expect(200)
      .expect({ user: { id: 'alice', displayName: 'Alice', role: 'user' } });

    const setCookie = response.headers['set-cookie'] as unknown;
    expect(Array.isArray(setCookie)).toBe(true);
    expect(setCookie).toEqual([
      expect.stringMatching(/^session=.+; Path=\/; HttpOnly; SameSite=Lax$/),
    ]);
  });

  it('returns the authenticated user from the saved session', async () => {
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'bob' }).expect(200);
    await enableCsrf(agent);
    await agent
      .get('/session/me')
      .expect(200)
      .expect({ user: { id: 'bob', displayName: 'Bob', role: 'user' } });
  });

  it('destroys the session and clears the cookie on logout', async () => {
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
    await enableCsrf(agent);
    const response = await agent.post('/session/logout').expect(204);

    const setCookie = response.headers['set-cookie'] as unknown;
    expect(setCookie).toEqual([
      expect.stringMatching(/^session=; Path=\/; Expires=.+; HttpOnly; SameSite=Lax$/),
    ]);
    await agent.get('/session/me').expect(401);
  });

  it('rejects the old session cookie after logout', async () => {
    const loginResponse = await request(server)
      .post('/session/login').set('Origin', 'http://localhost:3000')
      .send({ username: 'admin' })
      .expect(200);
    const oldCookie = getCookie(loginResponse);

    const csrf = await request(server).get('/session/csrf').set('Cookie', oldCookie).expect(200);
    await request(server).post('/session/logout').set('Cookie', oldCookie)
      .set('Origin', 'http://localhost:3000')
      .set('x-csrf-token', (csrf.body as { csrfToken: string }).csrfToken).expect(204);
    await request(server).get('/session/me').set('Cookie', oldCookie).expect(401);
  });

  it('invalidates the old session identifier when login changes identity', async () => {
    const first = await request(server).post('/session/login').set('Origin', 'http://localhost:3000')
      .send({ username: 'alice' }).expect(200);
    const oldCookie = getCookie(first);
    const second = await request(server).post('/session/login').set('Origin', 'http://localhost:3000')
      .set('Cookie', oldCookie).send({ username: 'bob' }).expect(200);
    const newCookie = getCookie(second);
    expect(newCookie === oldCookie).toBe(false);
    await request(server).get('/session/me').set('Cookie', oldCookie).expect(401);
    await request(server).get('/session/me').set('Cookie', newCookie).expect(200)
      .expect({ user: { id: 'bob', displayName: 'Bob', role: 'user' } });
  });
});
