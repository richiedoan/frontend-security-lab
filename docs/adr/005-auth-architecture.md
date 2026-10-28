# ADR 005: BFF for capstone browser authentication

- Status: Accepted for the capstone architecture; production prerequisites remain open
- Date: 2026-09-26
- Related: [ADR 001: Session cookies](001-session-cookie.md), [ADR 003: Token storage](003-token-storage.md)

## Context and decision

Select a **SPA with a Backend for Frontend (BFF)** for the capstone: a first-party
document application with authenticated reads and mutations, a separate resource
API, and a team able to operate a server alongside the frontend. These are the
scenario assumptions for this decision. The priority is to keep reusable upstream
access and refresh tokens out of browser JavaScript while preserving API-owned
authorization.

The browser will use an opaque HttpOnly application session cookie with a
same-origin BFF. The BFF will hold upstream credentials, coordinate refresh and
forward explicitly permitted operations. The resource API will independently
authenticate and authorize every call. Accept the additional server state,
network hop and operational work for this credential boundary.

This selects an architecture, not production readiness. The implemented BFF is
a single-process, development-only demonstration using the local passwordless
token service. A Keycloak BFF login and production session infrastructure are
not implemented. Earlier labs remain independent. This decision advances ADR
003's deferred BFF choice; its statements that no BFF or Keycloak integration
exists describe its earlier snapshot. ADR 001's statement that CSRF checks are
absent is also historical: the current cookie API has those checks.

## Options and trust boundaries

| Option | Browser-to-server credential | Identity and upstream access |
| --- | --- | --- |
| Pure SPA with bearer token | JavaScript attaches an access token in `Authorization: Bearer …` directly to the resource API. | Browser is an OAuth public client when using OIDC. No client secret can be kept in the bundle. API validates tokens and permissions. |
| SPA with application HttpOnly cookie | Browser attaches an opaque application session ID to the application API. | API resolves its server-side session and authorizes the operation itself. This option does not inherently need OAuth access/refresh tokens. |
| SPA with BFF | Browser attaches an opaque session cookie to its BFF; BFF attaches a server-held access token to the resource API. | BFF resolves session and manages upstream tokens; API still validates bearer credentials and permissions. |

A BFF also uses an application cookie. Its distinguishing feature here is the
server's custody of upstream tokens and restricted forwarding to a separate API.
Putting a JWT in a cookie does not by itself implement a BFF. Token format,
storage, transport and authorization are separate decisions.

## Verified project behavior

The evidence below comes from the current source and the existing tests, not
from assuming that all three alternatives are complete production deployments.

| Area | Current implementation and evidence |
| --- | --- |
| Browser token handling | [Day 4 adapters](../../apps/web/app/labs/token-storage/adapters.ts) default to memory and offer explicit sessionStorage/localStorage experiments. They retain access tokens only, but the login response still exposes the refresh token to the browser before it is discarded. The separate [refresh experiment](../../apps/web/app/labs/token-refresh/experiment.ts) temporarily retains refresh tokens for replay demonstrations. |
| Browser OIDC | [Keycloak initialization](../../apps/web/app/auth/oidc-browser.ts) and [callback handling](../../apps/web/app/auth/oidc-session.ts) use code flow, S256 PKCE, state/nonce handling by the adapter and fixed callbacks. Tokens remain in the adapter's memory; expiry clears them instead of refreshing. The inspection UI makes no resource API calls. Parsed claims are not independent signature verification; see [validation boundaries](../labs/oidc-inspection.md). |
| Application cookie | [Session configuration](../../apps/api/src/session.ts) uses Express MemoryStore, an opaque signed `session` cookie, HttpOnly, SameSite=Lax, Path=/ and Secure=false for local HTTP. [Login/logout](../../apps/api/src/session.controller.ts) regenerate/save the session and destroy it on logout. Identity and a random CSRF token live server-side. This is username-only lab login, not production authentication. |
| Cookie CSRF and CORS | [CSRF guard](../../apps/api/src/csrf.guard.ts) requires exact Origin and a session-bound token for protected cookie mutations; session login requires Origin before a session exists. The intentional theme bypass is limited to the insecure lab. [Browser fetch](../../apps/web/app/lab-fetch.ts) includes credentials and obtains the CSRF token. [CORS](../../apps/api/src/cors.ts) allows credentialed reads only from localhost:3000 in normal mode. |
| BFF | [Server implementation](../../apps/web/server/bff.ts), exposed by the [Node route](../../apps/web/app/bff/[...path]/route.ts), stores opaque sessions and both tokens in a process-local map. Its cookie is HttpOnly, SameSite=Strict, Path=/bff, with a one-hour lifetime and no Secure flag on local HTTP. It rejects production use and caps stored sessions at 1,000. |
| BFF request restrictions | Only session bootstrap, login, logout, document GET and title PATCH are allowed. Fixed API origin, restricted IDs, no query strings, no arbitrary headers/destinations and no upstream redirects. Mutations require exact Origin plus session-bound CSRF, including BFF login. GET accepts absent Origin but rejects an explicitly foreign Origin. |
| Refresh and response boundary | BFF refreshes within 30 seconds of access expiry and shares one refresh promise per session. Failure or API 401 removes the local session, expires its cookie and returns `reauthentication_required`. Login rotates session ID and CSRF. Responses project approved fields; errors and upstream headers are not relayed. Late refresh cannot recreate a logged-out session. |
| Resource authorization | [Bearer verification](../../apps/api/src/token/bearer-token.guard.ts) and [document controller](../../apps/api/src/token/token-document.controller.ts) enforce token validity, read scope, role and ownership; title PATCH additionally needs write scope. Even admin cannot bypass ownership. The BFF cannot override a 403. The separate [OIDC resource server](../../apps/api/src/oidc/README.md) independently validates Keycloak access tokens. |

The current API CORS header allowlist does **not** include `Authorization`.
Consequently, direct browser bearer calls from port 3000 to 4000 are not a
completed cross-origin integration: their preflight needs an explicit allowlist
change. Successful HTTP verifier tests do not establish browser CORS success.
BFF-to-API server requests do not depend on browser CORS.

## Security comparison

| Dimension | Pure SPA with bearer token | SPA with application HttpOnly cookie | SPA with BFF |
| --- | --- | --- | --- |
| XSS credential exfiltration | Browser code handles reusable tokens. Web Storage is directly readable; memory reduces persistence but malicious script can intercept responses or token use. A stolen bearer can be replayed outside the browser until invalid. | HttpOnly blocks direct JavaScript reads of the session cookie. The current opaque-session design exposes no OAuth pair. Cookie theft through other compromise remains possible. | HttpOnly blocks direct cookie reads, and upstream tokens are not returned to the browser. Browser XSS cannot simply read server-held tokens; server compromise or a leaking endpoint can expose them. |
| XSS act-as-user and data theft | Malicious script can call APIs and read accessible data while it can use credentials. | Malicious script can issue credentialed requests and read permitted responses even without reading the cookie. | Malicious script can obtain CSRF values and invoke allowed BFF operations, read documents or change titles as the user. The restricted route surface limits operations, not XSS itself. |
| CSRF | An explicit bearer header is not ambient authentication: an ordinary hostile form cannot attach the token. OAuth login still needs transaction protections; adding cookie fallback changes this analysis. | Browser cookie attachment creates CSRF exposure. Current implementation uses Origin plus session CSRF for writes; HttpOnly alone provides no CSRF defense. | Same cookie exposure and required defenses at the BFF boundary. Server-held tokens do not eliminate CSRF. BFF rejects missing/wrong CSRF and foreign Origin before forwarding mutations. |
| Token handling | Client owns acquisition, expiry, storage and any refresh coordination. Reload loses memory tokens. PKCE does not make tokens safe from executing malicious script. | Browser holds session ID; API holds identity. No OAuth refresh lifecycle is needed for the current cookie lab. Reload can retain the session while cookie and server record survive. | Browser holds session ID plus a script-readable CSRF value. BFF stores and refreshes the upstream pair. Reload need not require login while its cookie/session remain valid. |
| CORS | Cross-origin token/API endpoints must explicitly support intended origins and headers. CORS does not prevent a thief using a stolen token outside a browser. | Current browser/API split needs explicit origin, credentialed CORS and `credentials: include`. A same-origin deployment could avoid this CORS requirement. | Same-origin browser/BFF calls need no cross-origin API exposure. Upstream requests are server-to-server. Earlier lab CORS settings still exist; adding a BFF does not remove them automatically. |

HttpOnly limits direct cookie reads but does not stop authenticated actions by
XSS; see [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
XSS can defeat CSRF protections, and SameSite is defense in depth rather than a
replacement for request validation; see [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
These are threat-model properties, not claims that this lab tested XSS immunity.

## Delivery and operations comparison

| Dimension | Pure SPA with bearer token | SPA with application HttpOnly cookie | SPA with BFF |
| --- | --- | --- | --- |
| Server state | Static frontend can avoid an application session store. IdP/refresh/revocation state still exists; signed access tokens do not make the whole system stateless. | API owns sessions, identity and CSRF. Current MemoryStore loses sessions on restart. | BFF owns sessions, upstream tokens, expiry and refresh coordination. Current map loses everything on restart; token issuer also holds refresh-family state. |
| Scaling | Static hosting is straightforward; API replicas can verify signatures with trusted keys. Issuer lifecycle and authorization data still require coordination. | API replicas need a shared session store and consistent secret/lifetime policy. Current MemoryStore is unsuitable for this. | Requires shared sessions plus atomic refresh coordination across replicas, safe rotation persistence and logout invalidation. The current promise only coordinates requests within one handler instance; sticky routing alone is not failover correctness. |
| Operations | Fewer application server components; browser storage, provider compatibility, CORS, refresh races and logout require care. Public-client configuration has no deployable secret. | Operate session store, HTTPS, cookie/CSRF settings, secret rotation and expiry. Can be simpler when one application API already owns everything. | Adds a network hop and availability dependency, server token custody, upstream timeouts, egress restrictions and route/schema maintenance. Requires redacted observability, store/key operations and capacity management. |
| Developer experience | Direct SDK/API integration and static deployment are convenient. Frontend must handle token expiry and secure transport/storage without leaking credentials in diagnostics. | Frontend uses cookie requests and CSRF helpers. Backend session ownership is simple, but cross-origin cookies and local host differences can be confusing. | Frontend uses same-origin domain endpoints with a common reauthentication response. Backend developers maintain the allowlist, response projection and concurrency behavior; local integration needs both servers. |

## Why BFF for this capstone

The capstone needs upstream bearer authorization and document mutations. BFF
keeps those upstream credentials on an operated server and centralizes refresh
while exposing a narrow browser contract. The repository already demonstrates
the request and failure path, making this a concrete extension point.

A direct application-cookie API remains a good simpler choice when the same
backend can own authentication and business operations without upstream OAuth
tokens. We accept the BFF cost here because the separate bearer resource API is
part of the scenario. Neither choice allows frontend claims or button visibility
to replace resource authorization.

The capstone target uses real provider authentication at the BFF. Its ID token
is for the relying party's sign-in validation; only an access token intended for
the resource API goes upstream. Never forward an ID token as an API credential.
Current Keycloak SSO demonstrations remain browser clients: they do not prove
that the BFF is integrated with Keycloak or that its local logout ends provider SSO.

## Residual risks and prerequisites

- **XSS still matters.** Prevent injection, render untrusted text safely, constrain
  third-party scripts and deploy a reviewed CSP. XSS can read application data,
  obtain CSRF tokens and act through allowed BFF routes. Consider reauthentication
  or transaction confirmation for high-impact actions.
- **Cookie and login security remain required.** Add HTTPS and Secure cookies,
  review SameSite against the actual OIDC redirect flow, rotate sessions and
  define idle/absolute expiry. A `__Host-` cookie requires Path=/ and no Domain;
  the current `/bff` cookie cannot just be renamed. Ports do not isolate cookies,
  and URL paths do not isolate hostile scripts on an origin.
- **Implement real BFF authentication.** Replace the development username selector
  with a maintained OIDC integration and validate the provider response and login
  transaction. Configure exact redirects, trusted issuer/audience and any server
  client credentials. Do not enable the local token service in production.
- **Protect server custody.** Restrict access to session/token storage, backups,
  traces and diagnostics; manage encryption keys/secrets and rotation. A BFF
  breach can expose multiple users' credentials. No raw token logging or generic
  token-returning endpoint belongs in the browser contract.
- **Coordinate failures across replicas.** Persist rotated credentials atomically,
  prevent refresh replay during races/crashes, and ensure logout cannot be undone
  by late work. Define recovery, rate limiting and store outage behavior. A local
  cap of 1,000 sessions and opportunistic expiry are not production capacity control.
- **Keep forwarding narrow.** Maintain fixed destinations, strict request/response
  schemas and disabled redirects as new routes are added. Apply request size/rate
  limits and upstream timeouts. This is not permission to build an arbitrary proxy.
- **Logout has limits.** BFF logout deletes its session and attempts refresh-family
  revocation. An unavailable issuer can prevent revocation; already-issued access
  tokens are accepted until expiry by the current API. Immediate access revocation
  and provider-wide logout need separate requirements and implementation.

## When pure SPA remains reasonable

Choose a pure SPA when static hosting or independent browser clients are material
requirements, the provider and APIs intentionally support public clients and
cross-origin access, and the threat assessment accepts browser-held bearer
credentials. Use maintained Authorization Code + PKCE handling, exact callbacks,
short-lived least-privilege access tokens and an explicit refresh/revocation
strategy. Prefer memory when reload/reauthentication UX permits; persistence must
be a deliberate exposure tradeoff, not a claim of protection from XSS.

This remains reasonable for appropriately scoped applications when operating a
BFF and shared token store would add disproportionate cost. It is not justified
solely by JWT signatures, PKCE or a CSP: none eliminates malicious script's ability
to use credentials in the browser. Revisit the choice as data sensitivity, scopes,
session duration or available backend operations change.

## Verification and limits

The preceding implementation checks in this working tree passed **43 web tests**
and **196 API tests**. They were not rerun solely for this documentation change.
Relevant evidence:

- [BFF request/response tests](../../apps/web/test/bff.test.tsx): credentials absent
  from tested browser responses/headers, missing and cross-session CSRF rejection,
  exact Origin, one refresh for concurrent calls, failure reauthentication,
  logout/refresh race, upstream denial and open-proxy attempts.
- [API token document tests](../../apps/api/test/token-documents.e2e.spec.ts): actual
  signed-token verification and owner/scope/role enforcement, including mutations.
- [Session tests](../../apps/api/test/session.e2e.spec.ts), [CSRF tests](../../apps/api/test/csrf.e2e.spec.ts)
  and [authorization tests](../../apps/api/test/authorization.e2e.spec.ts): cookie
  lifecycle, request controls and resource policy.
- [Storage tests](../../apps/web/test/token-storage.test.tsx) and
  [callback tests](../../apps/web/test/oidc-callback.test.tsx): local storage behavior
  and handling adapter success/failure, not proof of browser XSS resistance.

Reproduce with `yarn workspace @frontend-security-lab/web test` and
`yarn workspace @frontend-security-lab/api test --runInBand`. BFF tests inject
upstream responses and a clock; API tests exercise HTTP with local cryptographic
keys. They do not establish production TLS, distributed locking, durable sessions,
live Keycloak BFF login or end-to-end browser bearer CORS. The
[BFF walkthrough](../labs/bff.md) documents the manual local request sequence.
