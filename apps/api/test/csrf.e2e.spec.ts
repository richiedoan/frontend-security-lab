import { enableCsrf } from './csrf-helper';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureCors } from '../src/cors';
import { configureSession } from '../src/session';
import { INSECURE_CSRF, readInsecureCsrf } from '../src/csrf-mode';

it('enables the insecure bypass only for the exact explicit flag', () => {
  for (const flag of [undefined, '', 'false', 'TRUE', '1']) {
    expect(readInsecureCsrf({ LAB_INSECURE_CSRF: flag })).toBe(false);
  }
  expect(readInsecureCsrf({ LAB_INSECURE_CSRF: 'true' })).toBe(true);
});

describe.each([false, true])('theme CSRF (insecure=%s)', (insecure) => {
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

  it('requires authentication in both modes', async () => {
    await request(server).get('/profile/theme').expect(401);
    await request(server).post('/profile/theme').type('form').send({ theme: 'dark' }).expect(401);
  });

  it('requires the custom token header even from the trusted Origin unless the theme bypass is explicit', async () => {
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
    await enableCsrf(agent);
    await agent.post('/profile/theme').unset('x-csrf-token').send({ theme: 'dark' }).expect(insecure ? 200 : 403);
    await agent.get('/profile/theme').expect(200).expect({ theme: insecure ? 'dark' : 'light' });
  });

  it('accepts trusted changes and isolates each user preference', async () => {
    const alice = request.agent(server);
    const bob = request.agent(server);
    await alice.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
    await enableCsrf(alice);
    await bob.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'bob' }).expect(200);
    await enableCsrf(bob);
    await alice.get('/profile/theme').expect(200).expect({ theme: 'light' });
    await alice.post('/profile/theme').set('Origin', 'http://localhost:3000')
      .send({ theme: 'dark', userId: 'bob' }).expect(200).expect({ theme: 'dark' });
    await alice.get('/profile/theme').expect(200).expect({ theme: 'dark' });
    await bob.get('/profile/theme').expect(200).expect({ theme: 'light' });
    await alice.post('/profile/theme').set('Origin', 'http://localhost:3000')
      .type('form').send({ theme: 'light' }).expect(200);
    await alice.get('/profile/theme').expect(200).expect({ theme: 'light' });
  });

  it.each(['http://localhost:3001', 'null', 'http://localhost:3000.evil.invalid', undefined])(
    'validates untrusted or missing Origin %s before changing the theme', async (origin) => {
      const agent = request.agent(server);
      await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
      await enableCsrf(agent);
      const post = agent.post('/profile/theme').type('form').send({ theme: 'dark' });
      post.unset('x-csrf-token').unset('Origin');
      if (origin !== undefined) post.set('Origin', origin);
      const response = await post.expect(insecure ? 200 : 403);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      await agent.get('/profile/theme').expect(200).expect({ theme: insecure ? 'dark' : 'light' });
    },
  );

  it.each([{}, { theme: 'invalid' }, { theme: 1 }, { theme: ['dark'] }])('rejects invalid data %j', async (body) => {
    const agent = request.agent(server);
    await agent.post('/session/login').set('Origin', 'http://localhost:3000').send({ username: 'alice' }).expect(200);
    await enableCsrf(agent);
    await agent.post('/profile/theme').set('Origin', 'http://localhost:3000').send(body).expect(400);
    await agent.get('/profile/theme').expect(200).expect({ theme: 'light' });
  });
});
