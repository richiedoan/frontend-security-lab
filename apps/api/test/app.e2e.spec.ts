import { enableCsrf } from './csrf-helper';
import { configureSession } from '../src/session';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureCors } from '../src/cors';

describe('Day 1 observable API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureSession(app);
    configureCors(app, {});
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 from /private without x-lab-user', async () => {
    const server = app.getHttpServer() as Server;
    await request(server).get('/private').expect(401);
  });

  it('accepts a transformed integer amount and strips unknown fields', async () => {
    const server = app.getHttpServer() as Server;
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
    await enableCsrf(agent);
    await agent
      .post('/transfer')
      .send({ amount: '4', ignored: 'removed by whitelist' })
      .expect(201)
      .expect({ amount: 4, labCounter: 4 });
  });

  it('rejects a non-integer amount', async () => {
    const server = app.getHttpServer() as Server;
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
    await enableCsrf(agent);
    await agent.post('/transfer').send({ amount: 1.5 }).expect(400);
  });

  it('allows JavaScript reads from the development web origin', async () => {
    const server = app.getHttpServer() as Server;
    const response = await request(server).get('/public').set('Origin', 'http://localhost:3000').expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers.vary).toContain('Origin');
  });

  it('denies JavaScript reads from the attacker origin', async () => {
    const server = app.getHttpServer() as Server;
    const response = await request(server).get('/public').set('Origin', 'http://localhost:3001').expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('answers an allowed preflight with only required methods and headers', async () => {
    const server = app.getHttpServer() as Server;
    const response = await request(server)
      .options('/transfer')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-lab-user')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-methods']).toBe('GET,POST,PATCH,DELETE');
    expect(response.headers['access-control-allow-headers']).toBe('Content-Type,x-lab-user,x-csrf-token');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers.vary).toContain('Origin');
  });

  it('serves non-browser requests without an Origin header', async () => {
    const server = app.getHttpServer() as Server;
    const response = await request(server).get('/public').expect(200);

    expect(response.body as unknown).toEqual({
      message: 'This is a public, local-only lab endpoint.',
      requestOrigin: null,
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

describe('Day 1 insecure CORS mode (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureSession(app);
    configureCors(app, { LAB_INSECURE_CORS: 'true' });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('emits wildcard CORS without enabling credentials', async () => {
    const server = app.getHttpServer() as Server;
    const response = await request(server).get('/public').set('Origin', 'http://localhost:3001').expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
