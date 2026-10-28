import { enableCsrf } from './csrf-helper';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureCors } from '../src/cors';
import { configureSession } from '../src/session';
import { EXECUTION_PAYLOAD, STORAGE_PAYLOAD, LEGACY_COMBINED_PAYLOAD } from '../src/xss-lab';

describe('local XSS demo reset (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let originalMode: string | undefined;

  beforeEach(async () => {
    originalMode = process.env.NODE_ENV;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureSession(app);
    configureCors(app, {});
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
    await app.close();
  });

  it('requires a session even with a spoofed user header', async () => {
    await request(server).delete('/comments/xss-demo').set('x-lab-user', 'alice').expect(401);
    await request(server).delete('/comments/xss-demo/execution').expect(401);
    await request(server).delete('/comments/xss-demo/storage').expect(401);
  });

  it.each(['execution', 'storage'] as const)('resets %s without deleting the other demo or normal comments', async (kind) => {
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
    await enableCsrf(agent);
    const normal = await agent.post('/comments').send({ text: 'Keep me' }).expect(201);
    const other = await agent.post('/comments').send({ text: kind === 'execution' ? STORAGE_PAYLOAD : EXECUTION_PAYLOAD }).expect(201);
    const legacy = await agent.post('/comments').send({ text: LEGACY_COMBINED_PAYLOAD }).expect(201);
    await agent.post('/comments').send({ text: kind === 'execution' ? EXECUTION_PAYLOAD : STORAGE_PAYLOAD }).expect(201);
    await agent.delete(`/comments/xss-demo/${kind}`).expect(200).expect({ deleted: 1 });
    await agent.get('/comments').expect(200).expect({ comments: [normal.body, other.body, legacy.body] });
    await agent.delete(`/comments/xss-demo/${kind}`).expect(200).expect({ deleted: 0 });
    await agent.delete('/comments/xss-demo/unknown').expect(404);
    await agent.delete('/comments/xss-demo').expect(200).expect({ deleted: 2 });
    await agent.get('/comments').expect(200).expect({ comments: [normal.body] });
  });

  it('removes only exact demo payloads across users and supports repeated resets', async () => {
    const alice = request.agent(server);
    const bob = request.agent(server);
    await alice.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
    await enableCsrf(alice);
    await bob.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'bob' }).expect(200);
    await enableCsrf(bob);
    const normal = await alice.post('/comments').send({ text: 'Keep this comment' }).expect(201);
    const similar = await bob.post('/comments').send({ text: `${STORAGE_PAYLOAD} extra` }).expect(201);
    await alice.post('/comments').send({ text: STORAGE_PAYLOAD }).expect(201);
    await bob.post('/comments').send({ text: STORAGE_PAYLOAD }).expect(201);
    await bob.post('/comments').send({ text: EXECUTION_PAYLOAD }).expect(201);
    await alice.delete('/comments/xss-demo').expect(200).expect({ deleted: 3 });
    await bob.get('/comments').expect(200).expect({ comments: [normal.body, similar.body] });
    await bob.delete('/comments/xss-demo').expect(200).expect({ deleted: 0 });
    await bob.post('/session/logout').expect(204);
    await bob.delete('/comments/xss-demo').expect(401);
  });

  it.each(['development', 'production', 'test', undefined])('allows authenticated reset in mode %s', async (mode) => {
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
    await enableCsrf(agent);
    await agent.post('/comments').send({ text: STORAGE_PAYLOAD }).expect(201);
    if (mode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = mode;
    await request(server).delete('/comments/xss-demo').expect(401);
    await agent.delete('/comments/xss-demo').expect(200).expect({ deleted: 1 });
    await agent.get('/comments').expect(200).expect({ comments: [] });
  });

  it('allows credentialed DELETE preflight from the local web origin', async () => {
    const response = await request(server).options('/comments/xss-demo')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'DELETE')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'http://localhost:3000')
      .expect('Access-Control-Allow-Credentials', 'true');
    expect(String(response.headers['access-control-allow-methods']).split(',')).toContain('DELETE');
  });
});
