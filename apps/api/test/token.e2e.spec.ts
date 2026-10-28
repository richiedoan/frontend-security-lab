import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { generateKeyPair } from 'jose';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TOKEN_KEY } from '../src/token/token-key';
import type { TokenPair } from '../src/token/token.service';
import { RequestMetadataLoggerMiddleware } from '../src/request-metadata-logger.middleware';
import type { Request, Response } from 'express';

describe('local token endpoints', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const keys = await generateKeyPair('ES256', { extractable: true });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TOKEN_KEY).useValue(() => Promise.resolve(keys.privateKey)).compile();
    app = module.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });
  afterAll(async () => { await app.close(); });

  it('issues and rotates without a cookie, then rejects a replayed family', async () => {
    const login = await request(server).post('/token/login').send({ username: 'alice', role: 'admin' })
      .expect(200).expect('Cache-Control', 'no-store');
    expect(login.headers['set-cookie']).toBeUndefined();
    const first = login.body as TokenPair;
    const refreshed = await request(server).post('/token/refresh').send({ refresh_token: first.refresh_token })
      .expect(200).expect('Cache-Control', 'no-store');
    await request(server).post('/token/refresh').send({ refresh_token: first.refresh_token }).expect(401);
    await request(server).post('/token/refresh')
      .send({ refresh_token: (refreshed.body as TokenPair).refresh_token }).expect(401);
  });

  it('logout revokes the refresh family while issued access tokens still authorize', async () => {
    const login = await request(server).post('/token/login').send({ username: 'alice' }).expect(200);
    const first = login.body as TokenPair;
    const rotated = await request(server).post('/token/refresh')
      .send({ refresh_token: first.refresh_token }).expect(200);
    const second = rotated.body as TokenPair;
    for (let attempt = 0; attempt < 2; attempt++) {
      await request(server).post('/token/logout').send({ refresh_token: first.refresh_token })
        .expect(204).expect('Cache-Control', 'no-store').expect('');
    }
    await request(server).post('/token/refresh').send({ refresh_token: second.refresh_token }).expect(401);
    await request(server).get('/token/documents/alice-private')
      .set('Authorization', `Bearer ${second.access_token}`).expect(200);
    await request(server).post('/token/logout').send({ refresh_token: 'x'.repeat(43) }).expect(204);
  });

  it('validates logout bodies and rejects untrusted logout origins', async () => {
    await request(server).post('/token/logout').send({}).expect(400);
    const login = await request(server).post('/token/login').send({ username: 'alice' }).expect(200);
    const pair = login.body as TokenPair;
    await request(server).post('/token/logout').set('Origin', 'http://localhost:3001')
      .send({ refresh_token: pair.refresh_token }).expect(403);
    await request(server).post('/token/refresh').send({ refresh_token: pair.refresh_token }).expect(200);
  });

  it('validates usernames and refresh bodies', async () => {
    await request(server).post('/token/login').send({ username: 'mallory' }).expect(400);
    await request(server).post('/token/refresh').send({}).expect(400);
    await request(server).post('/token/refresh').send({ refresh_token: 42 }).expect(400);
    await request(server).post('/token/refresh').send({ refresh_token: 'x'.repeat(43) }).expect(401);
  });

  it('rejects untrusted browser origins and accepts the lab origin', async () => {
    await request(server).post('/token/login').set('Origin', 'http://localhost:3001')
      .send({ username: 'alice' }).expect(403);
    await request(server).post('/token/refresh').set('Origin', 'http://localhost:3001')
      .send({ refresh_token: 'x'.repeat(43) }).expect(403);
    await request(server).post('/token/login').set('Origin', 'http://localhost:3000')
      .send({ username: 'bob' }).expect(200);
  });

  it('disables token endpoints in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await request(server).post('/token/login').send({ username: 'alice' }).expect(403);
      await request(server).post('/token/logout').send({ refresh_token: 'x'.repeat(43) }).expect(403);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it.each(['/token/refresh', '/token/login', '/token/logout', '/oidc/me', '/oidc/documents/alice-notes'])(
    'does not log credential-bearing requests on %s', path => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      const next = jest.fn();
      new RequestMetadataLoggerMiddleware().use({
        path, originalUrl: `${path}?credential=synthetic-secret`,
        headers: { authorization: 'Bearer synthetic-secret', cookie: 'session=synthetic-secret' },
      } as Request, {} as Response, next);
      expect(log).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    } finally { log.mockRestore(); }
  });
});
