import { enableCsrf } from './csrf-helper';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { INSECURE_AUTHZ_MODE } from '../src/authz-mode';
import type { LabUserId } from '../src/lab-data';
import { configureSession } from '../src/session';

describe('authorization matrix (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(INSECURE_AUTHZ_MODE)
      .useValue(false)
      .compile();
    app = moduleRef.createNestApplication();
    configureSession(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['GET', '/documents/alice-plan'],
    ['PATCH', '/documents/alice-plan'],
    ['GET', '/admin/audit'],
  ])('returns 401 for unauthenticated %s %s', async (method, path) => {
    if (method === 'PATCH') {
      await request(server).patch(path).send({ title: 'Unauthenticated update' }).expect(401);
    } else {
      await request(server).get(path).expect(401);
    }
  });

  it.each<{
    caseName: string;
    username: LabUserId;
    documentId: string;
    expected: number;
  }>([
    { caseName: 'owner', username: 'alice', documentId: 'alice-plan', expected: 200 },
    { caseName: 'non-owner', username: 'alice', documentId: 'bob-notes', expected: 403 },
    { caseName: 'editor', username: 'bob', documentId: 'alice-plan', expected: 200 },
    { caseName: 'viewer', username: 'bob', documentId: 'alice-notes', expected: 200 },
    { caseName: 'admin', username: 'admin', documentId: 'bob-notes', expected: 200 },
  ])('GET document: $caseName returns $expected', async ({ username, documentId, expected }) => {
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username }).expect(200);
    await enableCsrf(agent);
    await agent.get(`/documents/${documentId}`).expect(expected);
  });

  it.each<{
    caseName: string;
    username: LabUserId;
    documentId: string;
    expected: number;
  }>([
    { caseName: 'owner', username: 'alice', documentId: 'alice-plan', expected: 200 },
    { caseName: 'non-owner', username: 'alice', documentId: 'bob-notes', expected: 403 },
    { caseName: 'editor', username: 'bob', documentId: 'alice-plan', expected: 200 },
    { caseName: 'viewer', username: 'bob', documentId: 'alice-notes', expected: 403 },
    { caseName: 'admin', username: 'admin', documentId: 'bob-notes', expected: 200 },
  ])('PATCH document: $caseName returns $expected', async ({ username, documentId, expected }) => {
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username }).expect(200);
    await enableCsrf(agent);
    await agent.patch(`/documents/${documentId}`).send({ title: `Updated by ${username}` }).expect(expected);
  });

  it.each([
    { username: 'alice' as const, expected: 403 },
    { username: 'bob' as const, expected: 403 },
    { username: 'admin' as const, expected: 200 },
  ])('GET audit: $username returns $expected', async ({ username, expected }) => {
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username }).expect(200);
    await enableCsrf(agent);
    await agent.get('/admin/audit').expect(expected);
  });
});

describe('LOCAL LAB ONLY insecure authorization comparison (e2e)', () => {
  async function createApp(insecureAuthzMode: boolean): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(INSECURE_AUTHZ_MODE)
      .useValue(insecureAuthzMode)
      .compile();
    const app = moduleRef.createNestApplication();
    configureSession(app);
    await app.init();
    return app;
  }

  it('proves Bob can read Alice private document only in insecure mode', async () => {
    const secureApp = await createApp(false);
    const insecureApp = await createApp(true);

    try {
      const secureAgent = request.agent(secureApp.getHttpServer() as Server);
      await secureAgent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'bob' }).expect(200);
      await enableCsrf(secureAgent);
      await secureAgent.get('/documents/alice-private').expect(403);

      const insecureAgent = request.agent(insecureApp.getHttpServer() as Server);
      await insecureAgent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'bob' }).expect(200);
      await enableCsrf(insecureAgent);
      await insecureAgent
        .get('/documents/alice-private')
        .expect(200)
        .expect({
          id: 'alice-private',
          title: 'Alice private draft',
          ownerId: 'alice',
          editorIds: [],
          viewerIds: [],
        });

      await insecureAgent
        .patch('/documents/alice-private')
        .send({ title: 'Bob must not edit this' })
        .expect(403);
      await insecureAgent.get('/admin/audit').expect(403);
    } finally {
      await secureApp.close();
      await insecureApp.close();
    }
  });
});
