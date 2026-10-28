import { enableCsrf } from './csrf-helper';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import type { Comment } from '../src/comment.service';
import { configureSession } from '../src/session';

describe('authenticated plain-text comments (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureSession(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => { await app.close(); });

  it('requires a session for both routes, including with a spoofed lab header', async () => {
    await request(server).get('/comments').set('x-lab-user', 'alice').expect(401);
    await request(server).post('/comments').send({ text: 'hello' }).expect(401);
  });

  it('returns HTML-like input unchanged as JSON data and derives the author from the session', async () => {
    const alice = request.agent(server);
    await alice.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
    await enableCsrf(alice);
    await alice.get('/comments').expect(200).expect({ comments: [] });
    const text = '  <script>alert("x")</script>\n<img src=x onerror=alert(1)> & <b>hello</b>  ';
    const created = await alice.post('/comments')
      .send({ text, authorId: 'admin', id: 'forged' })
      .expect(201).expect('Content-Type', /application\/json/);
    const comment = created.body as Comment;
    expect(typeof comment.id).toBe('string');
    expect(comment).toEqual({ id: comment.id, authorId: 'alice', text });
    expect(comment.id).not.toBe('forged');

    const bob = request.agent(server);
    await bob.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'bob' }).expect(200);
    await enableCsrf(bob);
    await bob.get('/comments').expect(200).expect('Content-Type', /application\/json/)
      .expect({ comments: [created.body] });
    await alice.post('/session/logout').expect(204);
    await alice.get('/comments').expect(401);
    await alice.post('/comments').send({ text: 'after logout' }).expect(401);
  });

  it.each([{}, { text: null }, { text: 1 }, { text: ['hello'] }, { text: {} },
    { text: '' }, { text: ' \n\t ' }, { text: 'x'.repeat(1001) }])(
    'rejects invalid input without storing it: %j', async (body) => {
      const agent = request.agent(server);
      await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
      await enableCsrf(agent);
      await agent.post('/comments').send(body).expect(400);
      await agent.get('/comments').expect(200).expect({ comments: [] });
    },
  );

  it('accepts the length boundary and assigns distinct IDs', async () => {
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
    await enableCsrf(agent);
    const text = 'x'.repeat(1000);
    const first = await agent.post('/comments').send({ text }).expect(201);
    const second = await agent.post('/comments').send({ text }).expect(201);
    expect((first.body as Comment).text).toBe(text);
    expect((first.body as Comment).id).not.toBe((second.body as Comment).id);
  });
});
