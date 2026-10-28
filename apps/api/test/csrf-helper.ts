import type request from 'supertest';
export const TRUSTED_ORIGIN = 'http://localhost:3000';
export async function enableCsrf(agent: ReturnType<typeof request.agent>): Promise<string> {
  const response = await agent.get('/session/csrf').expect(200);
  const { csrfToken } = response.body as { csrfToken: string };
  agent.set('Origin', TRUSTED_ORIGIN).set('x-csrf-token', csrfToken);
  return csrfToken;
}
