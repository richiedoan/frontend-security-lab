# ADR 003: Token storage boundaries for the Day 4 lab

- Status: Accepted for the local Day 4 lab; BFF deferred
- Date: 2026-09-23
- Related: [ADR 001: Server-side session cookie](001-session-cookie.md)

## Context

Day 4 compares browser token persistence and demonstrates server-side bearer validation, refresh rotation, and reuse detection. It uses only the predefined local lab users and is not a production identity provider. No Keycloak integration or Backend for Frontend (BFF) exists.

Storage, transport, token format, and authorization are separate decisions:

- **JWT is a format**, not an authentication protocol or a storage strategy. The lab's signed JWT payload is readable, not encrypted. See [RFC 7519](https://www.rfc-editor.org/rfc/rfc7519.html).
- **Bearer possession grants authority**: someone holding a valid bearer token can exercise the authority it represents without proving possession of a separate cryptographic key. This remains bounded by token validity and server authorization; it does not grant arbitrary document access. See [RFC 6750, section 1.2](https://www.rfc-editor.org/rfc/rfc6750.html#section-1.2).
- **Decode is not verification.** Reading claims establishes neither authenticity nor validity. Frontend-decoded claims, hidden buttons, and a “Present” storage indicator cannot authorize a request.

## Decision

Use memory as the default for lab access tokens. Keep sessionStorage and localStorage as explicitly labeled educational alternatives, not production recommendations. No option is fully safe from XSS.

The [storage comparison page](../../apps/web/app/labs/token-storage/page.tsx) retains only the access token from local login. Its [adapters](../../apps/web/app/labs/token-storage/adapters.ts) discard the response's refresh token rather than saving it in state or storage. The refresh token still passes through the browser's login response: discarding it is not equivalent to preventing browser exposure.

The separate [refresh replay experiment](../../apps/web/app/labs/token-refresh/experiment.ts) is an intentional teaching exception. It retains refresh tokens A and B in page memory to replay A, discards access tokens, and clears references on reset or unmount. It never persists refresh tokens. This does not change the default storage path.

Retain the existing opaque session-cookie lab independently. Consider a BFF in a future decision if the application needs browser sessions with upstream access and refresh tokens kept server-side. Do not implement that architecture as part of Day 4.

## Comparison

The first three options assume an access token explicitly attached to an Authorization header when accessing a resource. A cookie is automatically attached according to browser cookie rules. The HttpOnly column describes cookie properties and the existing opaque session-ID implementation; it does not imply that Day 4 tokens are stored in cookies. A BFF is an architecture that also uses a browser session cookie, not a sixth browser storage API.

### XSS and CSRF

| Dimension | Memory | sessionStorage | localStorage | HttpOnly cookie | Future BFF |
| --- | --- | --- | --- | --- | --- |
| XSS read / token exfiltration | No persistent storage key to read. Closure scope can limit direct reads, but malicious script may intercept token responses or use token-handling code. Not an XSS boundary. | Same-origin script can read and exfiltrate stored tokens. Tab isolation is not isolation from XSS in that tab. | Same-origin script can read and exfiltrate stored tokens, including tokens left from earlier visits. | JavaScript cannot directly read the HttpOnly cookie. This does not protect tokens separately exposed in response bodies or other storage. | Intended design keeps upstream access/refresh tokens on the server and exposes no token-returning endpoint to browser code. Protects those tokens from direct browser reads. |
| XSS act-as-user / data exfiltration | Still possible while credentials are usable; attacker code can invoke application requests and read accessible data. | Still possible; stealing the token also enables replay elsewhere until invalidated. | Still possible; persistence can extend the opportunity to steal a usable credential. | Still possible: the browser can send the cookie on attacker-script requests, and script can read accessible responses. | Still possible through the authenticated BFF session and allowed operations, even without learning upstream tokens. |
| CSRF | Explicit bearer headers are not ambient cookies; ordinary cross-site forms cannot automatically attach the token. Any cookie-authenticated fallback changes this assessment. | Same transport property as memory; storage alone does not create a CSRF defense. | Same transport property as memory; storage alone does not create a CSRF defense. | Ambient cookie attachment creates CSRF exposure. Require appropriate Origin/token checks and SameSite policy; HttpOnly is not a CSRF control. | Cookie-authenticated BFF endpoints require CSRF defenses too. Keeping upstream tokens server-side does not remove this requirement. |

Web Storage's script readability and the danger of storing session identifiers there are described in [OWASP HTML5 Security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html). HttpOnly prevents direct cookie reads, not authenticated script actions, as explained in [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). XSS can defeat CSRF controls; neither CORS nor SameSite alone is a complete substitute for CSRF protection. See [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

### Persistence, refresh handling, and complexity

| Dimension | Memory | sessionStorage | localStorage | HttpOnly cookie | Future BFF |
| --- | --- | --- | --- | --- | --- |
| Rerender / reload | Lab adapter survives rerenders and client navigation in the same document; a full reload loses it. | Survives rerender and reload in its tab session. | Survives rerender and reload. | Survives both while cookie and server session remain valid. | Intended browser behavior follows its cookie and server session lifetimes. |
| New tab / browser restart | Fresh document starts empty; fresh browser load loses it. | Fresh noopener tab starts empty. Opener/duplicate tabs may copy initial state; session restore may preserve it across restart. | Shared by same-origin tabs in the same profile; normally survives restart until cleared. | Shared across matching cookie scope, not tab-isolated. Restart behavior depends on expiry and browser session restore. A surviving cookie can still refer to an expired server session. | Cookie and server-session policy determine continuity, independently of upstream token storage. |
| Refresh handling | Default lab keeps no refresh token. Separate replay page retains A/B only temporarily. | Lab stores access tokens only. Persisting a refresh token here would expose it to same-origin script. | Lab stores access tokens only. Persistent refresh credentials would increase the duration of script-readable exposure. | Existing opaque session has no OAuth refresh token. A future refresh-cookie design would require server-managed rotation and CSRF controls; HttpOnly does not stop XSS from invoking refresh. | Intended server stores and rotates refresh tokens and attaches access tokens to upstream requests; browser holds only the BFF session cookie. |
| Complexity | Simple storage; reload requires login, and refresh coordination is additional work. | Simple API; handle denied storage, tab lifecycle, and cleanup. | Simple API; also handle stale data, shared-tab changes, and explicit cleanup. | Requires cookie flags, transport/CSRF policy, server session expiry, and coordinated logout. | Adds a server/proxy boundary, session/token lifecycle, upstream policy, deployment, and operational work. Not implemented or validated here. |

Persistence describes browser behavior, not guaranteed credential validity. Private browsing, blocked storage, eviction, site-data clearing, and restore settings can alter results. See [MDN sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) and [MDN Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API). The future BFF comparison follows the server-held-token architecture in [OAuth 2.0 for Browser-Based Applications](https://www.ietf.org/ietf-ftp/rfc/rfc10017.html); it is not evidence of a deployed BFF in this repository.

## Verified Day 4 behavior

### Validation and authorization

The [bearer guard](../../apps/api/src/token/bearer-token.guard.ts) verifies with the configured local public key, an explicit ES256 allowlist, issuer, audience, expiry, optional not-before, and required claims `iss`, `aud`, `sub`, `exp`, `iat`, `scope`, `role`, and `jti`. It checks claim types and the five-minute lifetime. Invalid authentication returns 401.

The separate [document policy](../../apps/api/src/token/token-document.policy.ts) requires `documents:read`, role `user` or `admin`, and a subject matching document ownership. Permission failures return 403. Admin status, editor/viewer access, and the insecure session authorization flag do not bypass this ownership check.

### Rotation and logout

The [token service](../../apps/api/src/token/token.service.ts) stores opaque refresh-token hashes and family metadata only in process memory. Families have a fixed one-hour lifetime; rotation does not extend it.

| Scenario | Verified result |
| --- | --- |
| A → B | A is consumed, B is distinct and can refresh again. |
| Retry A after success | 401; the family is revoked, including B. |
| Two attempts with A, second during pending issuance | Both fail; revocation is checked before publishing a descendant. |
| Second attempt after first completed | B was already returned; reuse revokes its family. |
| Family logout | Current token or consumed ancestor identifies the family; repeated logout is idempotent. Independent login families remain usable. |
| Expired access token with valid refresh token | Refresh succeeds and issues a new access token. |

There is no retry grace period. A lost successful response can lead a legitimate retry to revoke the family. Deterministic tests pause issuance with a promise barrier and control verification time rather than depending on sleeps.

Client cleanup, family revocation, and access-token expiry are different:

- **Reset/client logout:** discards local copies only. Storage reset clears this tab's memory/sessionStorage and the shared localStorage lab key, preserving unrelated keys. Other tabs' memory/sessionStorage remain. Refresh-page reset also aborts the client request, which does not undo server work.
- **`POST /token/logout`:** revokes a refresh family, but does not clear client storage or the separate session cookie.
- **Already-issued access token:** remains usable until its own expiry, subject to normal validation and authorization. There is no family lookup or immediate access-token denylist in resource validation.

### Existing cookie boundary

The current [session configuration](../../apps/api/src/session.ts) uses an opaque session ID, `HttpOnly`, `SameSite=Lax`, and `Secure=false` for local HTTP. It is not a production cookie configuration or a JWT-cookie experiment. The current [CSRF guard](../../apps/api/src/csrf.guard.ts) checks Origin and session CSRF tokens on protected writes, with explicit local exercise exceptions. This is newer than ADR 001's historical statement that CSRF checks were absent. Token POST routes do not authenticate via session cookies; they validate supplied browser Origins and permit local CLI calls without Origin.

## Evidence and verification limits

Rechecked on 2026-09-23:

```sh
yarn workspace @frontend-security-lab/api test --runInBand
yarn workspace @frontend-security-lab/web test
```

- API: 177 passing tests, including [refresh lifecycle](../../apps/api/src/token/refresh-lifecycle.spec.ts), [token HTTP endpoints](../../apps/api/test/token.e2e.spec.ts), and [negative bearer/resource cases](../../apps/api/test/token-documents.e2e.spec.ts).
- Web: 22 passing tests, including [storage/reset and response projection](../../apps/web/test/token-storage.test.tsx) and [replay sequencing, cancellation, and no automatic retry](../../apps/web/test/token-refresh.test.tsx).
- The refresh experiment was also run against the real local API during implementation: login, rotation, retry A, check B returned `200 → 200 → 401 → 401`.

These tests verify implementation behavior. Adapter tests use storage fixtures; they do not automate a real browser restart, opener duplication, or private-mode persistence. The UI supplies manual controls and expected outcomes for those checks. The comparison does not claim tested XSS immunity, a deployed BFF, or refresh-cookie behavior.

## Consequences and deferred work

Memory default reduces persistent credential exposure at the cost of losing access tokens on reload. The educational alternatives make persistence observable without treating persistence as authentication. No tokens are intentionally logged or shown by these pages; request/response bodies remain observable in browser developer tools.

All options still require XSS prevention and server-side authorization. Cookie-based designs additionally require deliberate CSRF handling. Future production decisions must cover HTTPS, real identity verification, session lifetimes, and revocation requirements.

The refresh implementation remains single-process: replicas do not share families, consumption or revocation; there is no distributed atomicity, durable state, failover recovery, revocation propagation, or clock coordination. Restart loses refresh state while the persisted signing key can still validate unexpired access tokens. Used hashes are pruned opportunistically; global bounds and rate limiting are not implemented. This ADR records these limits without solving them or adding Keycloak/BFF integration.
