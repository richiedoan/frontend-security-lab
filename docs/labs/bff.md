# BFF critical path (local token lab)

The Next.js Node route at `/bff/*` keeps access and refresh tokens on the server.
The browser receives an opaque HttpOnly cookie and a session-bound CSRF token.
This checkout had no BFF login; this implementation uses the existing passwordless,
development-only `/token/login` service in `apps/api`. It is independent of the
Keycloak browser clients and does not accept their tokens or implement a Keycloak
BFF authorization-code callback. Start web and API with `yarn dev`.

## Explicit routes

| Browser request | Behavior |
| --- | --- |
| `GET /bff/session` | Creates an anonymous session if needed; returns only `authenticated` and `csrfToken`. |
| `POST /bff/login` | Accepts only `{"username":"alice"}` (or bob/admin); calls `/token/login` server-side and rotates session ID and CSRF token. |
| `POST /bff/logout` | Deletes local session before attempting refresh-family revocation; expires cookie. |
| `GET /bff/documents/:id` | Calls `GET /token/documents/:id` with the server-held bearer token; returns only `id`, `title`, `ownerId`. |
| `PATCH /bff/documents/:id` | Accepts only `{"title":"..."}` with a nonblank title up to 100 characters; forwards that mutation. |

IDs match `[a-z0-9][a-z0-9-]{0,63}`. Other paths, query strings, encoded separators,
methods and mutation fields are rejected. The fixed upstream is
`http://localhost:4000`: callers cannot choose a URL, host, scheme, port or
credentials. Browser Authorization, Cookie and forwarded-host headers are never
forwarded. Upstream redirects are forbidden, requests time out after five seconds,
and mutations are never automatically retried.

Every POST/PATCH, including login/logout, requires exact
`Origin: http://localhost:3000` and `X-CSRF-Token` matching the cookie session.
Missing, null, alternate-port and lookalike Origins fail. GET accepts absent
Origin for ordinary same-origin requests but rejects an explicitly foreign Origin.
No permissive CORS response is added. Tokens are random and compared in constant
time, following [OWASP synchronizer-token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## Try it from the trusted page

Run in DevTools on `http://localhost:3000`; the browser sets Origin automatically.
This example never handles access or refresh tokens:

```js
let session = await fetch('/bff/session').then(r => r.json());
session = await fetch('/bff/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
  body: JSON.stringify({ username: 'alice' }),
}).then(r => r.json());
await fetch('/bff/documents/alice-private').then(r => r.json());
await fetch('/bff/documents/alice-private', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
  body: JSON.stringify({ title: 'Updated through the BFF' }),
}).then(r => r.json());
```

Keep the new CSRF token returned by login; the anonymous session's token becomes
invalid. Missing/incorrect CSRF returns `403 invalid_csrf`. Bob's document returns
`403 forbidden` even with Alice's valid session and CSRF.

## Refresh, logout and responses

Before a resource call, access tokens within 30 seconds of expiry are refreshed
server-side. A promise on each session makes concurrent requests await one
refresh; different sessions do not share this lock or tokens. Successful rotation
replaces both credentials before waiting calls proceed.

Rejected, malformed or failed refresh deletes the session and returns
`401 {"error":"reauthentication_required"}` with an expired cookie. API 401 does
the same, without retry. The caller should discard its CSRF state, bootstrap a
new `/bff/session`, and sign in again. API 403/404 remain denials; other failures
become generic 502 responses. No upstream body, Location, Set-Cookie or error
description is relayed. Success uses an explicit document projection and rejects
strings containing current credentials. Every response uses `no-store`.

Logout deletes local state before waiting for revocation. Late refresh cannot
recreate a deleted/expired session. Logout still clears local state if revocation
is unavailable; issued access tokens remain valid at the API until expiry.

## API authorization and deployment limits

The BFF supplies credentials but never grants document permissions. The API
validates each bearer token and requires read scope, an allowed role and exact
ownership; PATCH additionally requires write scope. Admins cannot bypass ownership.
Only title can change. The token controller uses an independent in-memory document
copy, leaving earlier cookie-auth labs unaffected.

Only the exact bearer-authenticated PATCH route bypasses the API's cookie CSRF
guard. It still runs loopback/development and bearer guards; cookies alone never
authorize it. Origin, when present, must still be trusted. The BFF enforces CSRF
at the browser's cookie boundary before forwarding.

This is a single-process lab: sessions and refresh locks are in memory, expire
after one hour, disappear on restart, and have a 1,000-session cap. Multiple
instances require a shared server-side store and distributed refresh coordination.
Both BFF and token service reject production use. The local HTTP cookie is
HttpOnly, SameSite=Strict and scoped to `/bff`; production HTTPS would require
Secure plus real authenticated login. Cookies are not isolated by port, and XSS
on the trusted origin can still issue requests despite token secrecy.

## Verification

Run web and API `test`, `typecheck`, and `lint` workspace commands (API tests use
`--runInBand`). BFF request/response tests inject an upstream and clock to cover
credential secrecy, CSRF/Origin rejection, concurrent refresh, failure logout,
logout/refresh races, API denial and open-proxy attempts. API tests independently
exercise real signed tokens and mutation authorization over HTTP. The snippet
above is the manual full-stack check.
