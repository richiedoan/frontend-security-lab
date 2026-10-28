import { randomBytes, timingSafeEqual } from 'node:crypto';

const ORIGIN = 'http://localhost:3000';
const API = 'http://localhost:4000';
const COOKIE = 'lab_bff_session';
const TTL = 60 * 60 * 1000;
const random = () => randomBytes(32).toString('hex');
interface Pair { access_token: string; refresh_token: string; expires_in: number; token_type: string }
interface Session {
  csrf: string;
  expiresAt: number;
  pair?: Pair;
  accessExpiresAt: number;
  refresh?: Promise<boolean>;
}

function tokenPair(value: unknown): Pair {
  const pair = value as Partial<Pair> | null;
  if (!pair || typeof pair.access_token !== 'string' || !pair.access_token ||
    typeof pair.refresh_token !== 'string' || !pair.refresh_token || pair.token_type !== 'Bearer' ||
    typeof pair.expires_in !== 'number' || !Number.isFinite(pair.expires_in) || pair.expires_in <= 30) {
    throw new Error('Invalid token response');
  }
  return { access_token: pair.access_token, refresh_token: pair.refresh_token,
    token_type: 'Bearer', expires_in: pair.expires_in };
}

// Single-process local lab. This module is imported only by Node route handlers.
export function createBff({ fetcher = fetch, now = Date.now, enabled = () => process.env.NODE_ENV !== 'production' } = {}) {
  const sessions = new Map<string, Session>();
  const cookie = (id: string, age = 3600) => `${COOKIE}=${id}; Path=/bff; HttpOnly; SameSite=Strict; Max-Age=${age}`;
  const json = (body: unknown, status = 200, setCookie?: string) => Response.json(body, {
    status, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache',
      ...(setCookie ? { 'Set-Cookie': setCookie } : {}) },
  });
  const reauthenticate = (id: string) => {
    sessions.delete(id);
    return json({ error: 'reauthentication_required' }, 401, cookie('', 0));
  };
  const upstream = (path: string, init: RequestInit) => fetcher(`${API}${path}`, {
    ...init, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(5000),
  });
  const valid = (id: string, session: Session) => sessions.get(id) === session && session.expiresAt > now();

  async function access(id: string, session: Session): Promise<boolean> {
    if (!session.pair || !valid(id, session)) return false;
    if (session.accessExpiresAt > now() + 30_000) return true;
    // Install the promise before yielding; all requests for this session join it.
    if (!session.refresh) session.refresh = (async () => {
      try {
        const started = now();
        const response = await upstream('/token/refresh', { method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: session.pair!.refresh_token }) });
        if (!response.ok) throw new Error('Refresh rejected');
        const pair = tokenPair(await response.json());
        if (!valid(id, session)) return false; // Logout/expiry must not resurrect a session.
        session.pair = pair;
        session.accessExpiresAt = started + pair.expires_in * 1000;
        return true;
      } catch {
        sessions.delete(id);
        return false;
      } finally { session.refresh = undefined; }
    })();
    return session.refresh;
  }

  return async function handle(request: Request): Promise<Response> {
    if (!enabled()) return json({ error: 'local_lab_only' }, 404);
    const url = new URL(request.url);
    const path = url.pathname;
    const document = /^\/bff\/documents\/([a-z0-9][a-z0-9-]{0,63})$/.exec(path);
    const methods = document ? ['GET', 'PATCH'] : path === '/bff/session' ? ['GET']
      : ['/bff/login', '/bff/logout'].includes(path) ? ['POST'] : [];
    if (!methods.length || url.search) return json({ error: 'not_found' }, 404);
    if (!methods.includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
    const origin = request.headers.get('origin');
    if ((request.method !== 'GET' || origin !== null) && origin !== ORIGIN) {
      return json({ error: 'untrusted_origin' }, 403);
    }
    // No forwarded host, destination URL, browser bearer token or cookie is forwarded.
    const cookies = (request.headers.get('cookie') ?? '').split(';').map(item => item.trim())
      .filter(item => item.startsWith(`${COOKIE}=`));
    let id = cookies.length === 1 ? cookies[0].slice(COOKIE.length + 1) : '';
    if (!/^[a-f0-9]{64}$/.test(id)) id = '';
    for (const [key, session] of sessions) if (session.expiresAt <= now()) sessions.delete(key);
    let session = sessions.get(id);
    if (path === '/bff/session') {
      if (!session) {
        if (sessions.size >= 1000) {
          // Reclaim the oldest abandoned bootstrap, never an authenticated session.
          const anonymous = [...sessions].find(([, candidate]) => !candidate.pair);
          if (!anonymous) return json({ error: 'session_capacity' }, 503);
          sessions.delete(anonymous[0]);
        }
        id = random();
        session = { csrf: random(), expiresAt: now() + TTL, accessExpiresAt: 0 };
        sessions.set(id, session);
      }
      return json({ authenticated: !!session.pair, csrfToken: session.csrf }, 200, cookie(id, Math.floor((session.expiresAt - now()) / 1000)));
    }
    if (!session) return reauthenticate(id);
    if (request.method !== 'GET') {
      const csrf = request.headers.get('x-csrf-token') ?? '';
      if (!/^[a-f0-9]{64}$/.test(csrf) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf))) {
        return json({ error: 'invalid_csrf' }, 403);
      }
    }
    if (path === '/bff/logout') {
      sessions.delete(id); // Invalidate before awaiting revocation or any in-flight refresh.
      if (session.pair) {
        try { await upstream('/token/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: session.pair.refresh_token }) }); } catch { /* Local logout still succeeds. */ }
      }
      return json({ authenticated: false }, 200, cookie('', 0));
    }
    let body: Record<string, unknown> = {};
    if (request.method === 'POST' || request.method === 'PATCH') {
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'json_required' }, 415);
      try {
        const raw = await request.text();
        if (raw.length > 1024) return json({ error: 'body_too_large' }, 413);
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body');
        body = parsed as Record<string, unknown>;
      } catch { return json({ error: 'invalid_body' }, 400); }
    }
    if (path === '/bff/login') {
      if (Object.keys(body).length !== 1 || !['alice', 'bob', 'admin'].includes(String(body.username))) return json({ error: 'invalid_user' }, 400);
      try {
        const started = now();
        const response = await upstream('/token/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) return reauthenticate(id);
        const pair = tokenPair(await response.json());
        if (!valid(id, session)) return reauthenticate(id);
        sessions.delete(id);
        id = random();
        session = { csrf: random(), pair, expiresAt: now() + TTL, accessExpiresAt: started + pair.expires_in * 1000 };
        sessions.set(id, session);
        return json({ authenticated: true, csrfToken: session.csrf }, 200, cookie(id));
      } catch { return reauthenticate(id); }
    }
    if (request.method === 'PATCH' && (Object.keys(body).length !== 1 || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 100)) {
      return json({ error: 'invalid_title' }, 400);
    }
    if (!await access(id, session)) return reauthenticate(id);
    const pair = session.pair!;
    try {
      const response = await upstream(`/token/documents/${document![1]}`, {
        method: request.method, headers: { Authorization: `Bearer ${pair.access_token}`,
          ...(request.method === 'PATCH' ? { 'Content-Type': 'application/json' } : {}) },
        ...(request.method === 'PATCH' ? { body: JSON.stringify({ title: body.title }) } : {}),
      });
      if (!valid(id, session) || response.status === 401) return reauthenticate(id);
      if ([403, 404].includes(response.status)) return json({ error: response.status === 403 ? 'forbidden' : 'not_found' }, response.status);
      if (!response.ok) return json({ error: 'upstream_unavailable' }, 502);
      const data = await response.json() as Record<string, unknown>;
      if (data.id !== document![1] || typeof data.title !== 'string' || typeof data.ownerId !== 'string') throw new Error('Invalid document');
      const safe = { id: data.id, title: data.title, ownerId: data.ownerId };
      if ([pair.access_token, pair.refresh_token].some(token => JSON.stringify(safe).includes(token))) throw new Error('Credential in document');
      return json(safe);
    } catch { return json({ error: 'upstream_unavailable' }, 502); }
  };
}
