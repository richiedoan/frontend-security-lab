# Senior architecture defense

**Delivery:** approximately 9–10 minutes for sections 1–10, at a measured pace.
Source links are reference notes, not spoken text. The challenge questions are
for discussion afterward and are outside the presentation time.

**Scope:** verified working-tree implementation and recorded tests as of
2026-09-26. The accepted architecture and the completed implementation are
distinguished throughout. This walkthrough does not claim production readiness.

## 1. Scenario and assets

This capstone is a first-party document application with a separate resource
API. The security lab implements document reads and title changes for seeded
Alice, Bob, and admin identities. Our assets are user identity, application
sessions, OAuth tokens, documents, and audit events. Shared comments also provide
an untrusted-input surface.

The central design decision is a browser-facing BFF that holds upstream
credentials while the API owns resource authorization. There is an important
implementation boundary: the BFF currently authenticates through a passwordless
local token service. Keycloak login is a separate browser exercise. Real Keycloak
authentication at the BFF remains unimplemented.

Evidence: [architecture decision](../adr/005-auth-architecture.md),
[seeded assets](../../apps/api/src/lab-data.ts), [threat model](threat-model.md).

## 2. Trust boundaries and flow

The browser runs the trusted web app on localhost port 3000. The second app and
attacker demonstrations share port 3001. The API runs on 4000 and optional
Keycloak on 8080. These are different origins, but ports do not isolate cookies.

There is no `apps/bff` directory. Next.js exposes the BFF from `apps/web`. The
browser bootstraps an opaque session and CSRF value, submits a lab username, then
requests documents through `/bff/documents/:id`. The BFF attaches its own bearer
token to the fixed local API destination. It returns only document ID, title,
and owner ID.

Separately, the browser OIDC adapter redirects to Keycloak and exchanges a code.
The API has independent OIDC verification routes; the inspection UI does not
automatically call them. These paths are not one completed provider-backed chain.

```text
Implemented local path:
browser → Next.js /bff → API /token/*

Separate OIDC path:
browser adapter ↔ Keycloak
API /oidc/* → trusted provider discovery/JWKS

Accepted target, not implemented:
browser → BFF with Keycloak login → resource API
```

Evidence: [BFF handler](../../apps/web/server/bff.ts),
[browser OIDC](../../apps/web/app/auth/oidc-browser.ts),
[OIDC inspection UI](../../apps/web/app/auth/oidc-panel.tsx).

## 3. Why Authorization Code/OIDC and where PKCE/state/nonce apply

The repository separates sign-in from resource access. The OIDC ID token belongs
to the sign-in consumer; the API expects an access token. Its verifier explicitly
rejects an ID token, even if presented with an API audience.

Both browser clients use Authorization Code with S256 PKCE. Their realm entries
are public clients with exact callbacks; implicit flow and direct password grants
are disabled. The adapter owns transaction parsing, state correlation, nonce
handling, and token exchange. State correlates the callback to the pending login;
PKCE binds code redemption to the verifier; nonce associates the identity response
with its login transaction. They address different parts of the exchange.

The real-adapter test proves wrong or missing state causes no exchange. Nonce
failure is mocked in wrapper tests. Live PKCE rejection and code single-use have
not been established by the recorded suite.

Evidence: [adapter options](../../apps/web/app/auth/oidc-session.ts),
[realm](../../infra/keycloak/realms/lab-realm.json),
[OIDC validation explanation](../labs/oidc-inspection.md),
[real-adapter test](../../apps/web/test/oidc-adapter-negative.test.mjs).

## 4. Why OAuth tokens stay in BFF

Server custody is the accepted architecture's answer to browser-held reusable
credentials. In the implemented BFF, access and refresh tokens remain in its
session map; browser responses contain an opaque cookie, CSRF value, and approved
application data. The separate Keycloak browser exercise still holds its tokens
in adapter memory. We must not extend the BFF's protection claim to that exercise.

The browser cannot choose an upstream URL or supply the forwarded credential.
The handler rejects unsupported paths and queries and forbids upstream redirects.
This narrows what browser code can ask the server to do.

It does not make XSS harmless. Malicious code on the trusted origin can obtain
CSRF values and invoke allowed operations. Server token custody limits direct
credential exposure; it does not remove the user's authority from the page.

Evidence: [BFF forwarding and response projection](../../apps/web/server/bff.ts),
[credential tradeoffs](../adr/005-auth-architecture.md).

## 5. Cookie/session/refresh/logout strategy

The BFF cookie is HttpOnly, SameSite=Strict, scoped to `/bff`, and has a one-hour
lifetime. The server enforces absolute expiry. Login rotates both session ID and
CSRF value. Secure is absent because this implementation uses local HTTP.

Local access tokens last five minutes. Refresh families last one hour, retain
hashed refresh values, rotate on use, and revoke the family on ancestor reuse.
The BFF refreshes within thirty seconds of access expiry and shares one refresh
promise across concurrent requests for that session.

Logout removes BFF state before awaiting refresh-family revocation. Late refresh
cannot restore the session. Revocation failure does not prevent local logout,
and already-issued access tokens remain usable until expiry. Browser OIDC local
logout only clears adapter tokens; it does not end Keycloak SSO.

Evidence: [BFF lifecycle](../../apps/web/server/bff.ts),
[local token service](../../apps/api/src/token/token.service.ts),
[OIDC local logout](../../apps/web/app/auth/oidc-panel.tsx).

## 6. CSRF/XSS/CORS/CSP controls

Every BFF mutation, including login and logout, requires the exact trusted Origin
and session-bound CSRF header. Cookies create the ambient credential boundary;
keeping bearer tokens server-side does not remove that obligation.

Normal comments render as escaped React text. The intentionally unsafe XSS page
is development-only and renders exact teaching fixtures. This restriction is not
a general HTML sanitizer.

API CORS allows credentialed reads from the exact trusted web origin. Its header
allowlist omits Authorization, so direct browser bearer calls are incomplete.
Server-to-server BFF calls do not rely on browser CORS. CORS also does not prevent
ordinary cross-origin form submission.

CSP is opt-in. Report-only does not block; development permits inline scripts
and eval. The non-development policy uses nonces. Header tests verify those
settings, not live browser enforcement.

Evidence: [CSRF guard](../../apps/api/src/csrf.guard.ts),
[comment rendering](../../apps/web/app/comment-list.tsx),
[CORS](../../apps/api/src/cors.ts), [CSP](../../apps/web/csp.ts),
[CSP activation](../../apps/web/proxy.ts).

## 7. API authorization and BOLA prevention

The API verifies credentials before constructing a principal. Local bearer
verification checks signature, issuer, audience, timing and required claims.
Document reads then require read scope, an allowed role, and exact ownership.
Title updates additionally require write scope. Admin is not an ownership bypass.

OIDC routes independently require the configured issuer, API audience, RS256,
access-token type, and authorized party. Document policy uses the verified
subject, not a username or a browser-supplied owner field.

The earlier cookie API has different sharing rules: editors, viewers, and admins
have explicit permissions. Its insecure read switch does not disable bearer
authorization. The BFF preserves API denials; hiding a frontend button is never
the resource permission check.

Evidence: [bearer verifier](../../apps/api/src/token/bearer-token.guard.ts),
[document policy](../../apps/api/src/token/token-document.policy.ts),
[OIDC policy](../../apps/api/src/oidc/oidc.controller.ts),
[cookie policy](../../apps/api/src/authorization-policy.ts).

## 8. Failure modes and residual risks

Failed refresh or an upstream 401 forces reauthentication. Upstream 403 and 404
remain denials; other resource failures become generic 502 responses. Upstream
requests have a five-second timeout and no automatic mutation retry.

Sessions and refresh coordination are process-local. Restart loses that state;
the promise is not distributed coordination. At 1,000 sessions, the BFF now
reclaims an anonymous entry without evicting authenticated sessions. Continuous
flooding can still interrupt pending logins, and an all-authenticated store
rejects new sessions.

Other gaps are concrete: passwordless identity selection, missing Secure cookies,
and legacy cookie login and insecure switches without production gates. Token
document mutations emit no audit event. Token/OIDC paths are excluded from the
API metadata logger, but other paths log query-bearing URLs. These limits prevent
a production-readiness claim.

Evidence: [current BFF behavior](../../apps/web/server/bff.ts),
[token mutations](../../apps/api/src/token/token-document.controller.ts),
[logger](../../apps/api/src/request-metadata-logger.middleware.ts),
[review coverage and gaps](security-test-report.md).

## 9. Rejected alternatives

ADR 005 considered three architectures. A pure SPA keeps upstream bearer
credentials in browser code; the accepted BFF decision instead prioritizes server
custody and centralized refresh. The ADR still considers SPA reasonable when
static hosting or independent browser clients justify that exposure tradeoff.

A direct application-cookie API is simpler when one backend owns authentication
and business operations. The capstone selects a BFF because a separate bearer
resource API is part of its scenario, accepting another hop and server state.

The decision also rejects treating JWT format or cookie placement as the whole
architecture. The implemented BFF supplies restricted forwarding, token custody,
and lifecycle management in addition to its session cookie.

Evidence: [recorded alternatives and decision](../adr/005-auth-architecture.md).

## 10. Evidence and tests

The recorded final `yarn test:security` run passed 46 web tests, seven second-app
tests, and 206 API tests, plus static realm validation. Five integration tests
connect the actual BFF handler to Nest HTTP routes with real signed tokens.
They verify secrecy, ownership, CSRF, logout revocation, and destination
restrictions; they also characterize the bearer CORS gap.

Expiry tests control time, and race tests use explicit barriers. Shareable runner
output excludes raw credentials and diagnostics. Browser enforcement and live
Keycloak checks remain unexecuted and are listed separately.

There is a validation caveat: one initial API failure did not reproduce in later
runs, and its cause remains unknown. The report preserves that fact. Passing
contract tests support the specific boundaries exercised; they do not establish
the missing provider integration or production controls.

Evidence: [test report and commands](security-test-report.md),
[BFF/Nest integration](../../apps/api/test/capstone-bff.e2e.spec.ts),
[BFF regression tests](../../apps/web/test/bff.test.tsx),
[redacted runner](../../scripts/security-regression.mjs).

## Staff-level challenge questions

1. What identity and authorization contract must replace username selection before the BFF can use Keycloak without accidentally linking unrelated local and provider identities?
2. How would you make refresh rotation and logout atomic across replicas and process crashes, including a crash after the issuer consumes a refresh token but before the new pair is persisted?
3. What consistency guarantee should users receive after logout, given that an already-issued access token remains valid, and which component would enforce a stronger guarantee?
4. How would you distinguish legitimate anonymous login bursts from session-exhaustion attempts without letting anonymous-session eviction become a targeted login-denial mechanism?
5. How would you reconcile the cookie API's sharing/admin rules with owner-only bearer rules if both interfaces began operating on the same persistent documents?
6. What deployment and cookie changes would preserve login transaction binding through a real provider redirect while isolating the attacker app from application sessions?
7. Which high-impact actions would still require additional protection after moving all provider tokens into the BFF, and how would you test that protection against trusted-origin script execution?
8. How would you make document mutation and audit recording consistent without storing credentials or leaking document contents into operational logs?
9. What evidence would justify closing the missing browser/provider checks and the unexplained initial API failure before a release decision?
10. How would you enforce removal or isolation of teaching routes and insecure flags across builds, configuration changes, and future services without relying on deployment convention?
