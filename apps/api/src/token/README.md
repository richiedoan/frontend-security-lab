# Local educational tokens

This is **not a production identity provider**. It deliberately uses passwordless
selection of the existing `alice`, `bob`, and `admin` lab users. There is no
Keycloak integration and these tokens do not authenticate existing session routes.

The [local BFF](../../../../docs/labs/bff.md) uses this service server-side.
`PATCH /token/documents/:id` permits title updates only for the verified owner
with read/write scopes and an allowed role. It authenticates exclusively by
bearer token, independently of browser cookie sessions; the BFF applies CSRF
and Origin checks at its cookie boundary.

Run the API normally (`yarn workspace @frontend-security-lab/api start:dev`).
The server binds to `127.0.0.1:4000`. Token endpoints also check the socket peer for
loopback and reject `NODE_ENV=production`; do not expose them through a proxy.
Browser requests must use Origin `http://localhost:3000`; local CLI requests can
omit Origin. Token endpoints do not require or set a session cookie.

- `POST /token/login` with JSON `{"username":"alice"}` returns `access_token`,
  `token_type: "Bearer"`, `expires_in: 300`, and `refresh_token`.
- `POST /token/refresh` with JSON `{"refresh_token":"<current opaque token>"}`
  returns a new pair and consumes the submitted refresh token.
- `POST /token/logout` with JSON `{"refresh_token":"<current or consumed token>"}`
  revokes that token’s family and returns 204. Validly shaped unknown, expired, or
  already-revoked tokens also return 204; malformed bodies return 400.
- Reusing any consumed refresh token returns 401 and revokes its entire family,
  including the current descendant. A separate login creates a separate family.

ES256 access tokens contain `iss` (`http://localhost:4000/token`), `aud`
(`frontend-security-lab`), `sub`, `exp`, `iat`, `scope`, `role`, and a unique `jti`.
Roles and scopes come from the server's lab users, never the request body.
Access tokens expire after five minutes. Family revocation prevents refresh;
previously issued access tokens remain valid until expiry.

The first issuance generates `apps/api/.local/token-signing-key.pem` (PKCS#8,
mode 0600, directory mode 0700). Later runs load that same key. The directory is
gitignored. Stop the API and remove this file to reset the local signing key.
The public key can be derived from this private key for offline verification;
there is deliberately no discovery or JWKS endpoint yet.

Refresh tokens contain 32 random bytes; only SHA-256 hashes and family metadata
are retained in memory. Used hashes remain available for reuse detection until
the family's fixed one-hour expiry. Expired records are pruned on login/refresh/logout.
Restarting the process invalidates all refresh tokens. Storage and synchronous
consumption work in one process only, with no persistence or shared locking.

Responses use `Cache-Control: no-store`. Token requests bypass the request
metadata logger entirely. Never add request/response token logging, place tokens
in URLs, or commit private keys or captured token responses.

Run tests with `yarn workspace @frontend-security-lab/api test --runInBand`.
Jest transforms jose's ESM dependency for the existing CommonJS test environment;
the runtime requires [Node 22.12+](https://github.com/panva/jose#footnotes) (or another Node version supporting require(esm)).

## Bearer-protected documents

`GET /token/documents/:id` requires `Authorization: Bearer <access_token>`.
It reads the fixed lab document fixtures independently of session document edits.
The local-only restrictions also apply to this resource.

Authentication uses the local public key and `jose.jwtVerify`: only ES256 is
allowed, issuer and audience must match this lab, expiration is mandatory, and
`nbf` is checked when present. All eight issued claims are required, their types
are checked, and the five-minute lifetime is enforced. Missing or invalid tokens
return 401. No frontend-decoded claims, query tokens, or session cookies authorize
this endpoint. See [jose verification options](https://github.com/panva/jose/blob/main/docs/jwt/verify/interfaces/JWTVerifyOptions.md).

A separate authorization policy requires the exact `documents:read` scope, role
`user` or `admin`, and `sub` equal to the document's owner ID. Failed permission or
ownership checks return 403; admins, editors, viewers, and `INSECURE_AUTHZ_MODE`
have no ownership bypass. A valid token requesting an unknown document gets 404.
The token family revocation limitation above still applies to access tokens.

The table-driven negative suite is `test/token-documents.e2e.spec.ts`, including
payload/signature tampering, an incorrect key or algorithm, expiry/not-before,
issuer/audience, missing or malformed claims, scope/role, and ownership failures.


## Refresh races, logout, and lifetime

This lab chooses **strict family revocation on reuse**, with no retry grace period
or cached refresh response. A is consumed synchronously before any asynchronous
key lookup/signing. The family is checked again after signing, before B is stored
or returned. Both operations share one in-memory family object in one process.

| Scenario | Result |
| --- | --- |
| Normal A → B | A is consumed; B can rotate again. |
| Retry A after B was returned | Retry gets 401 and revokes the family; B can no longer refresh. |
| Two attempts with A, second arriving while first issuance is pending | Second detects reuse and revokes the family; first detects revocation before returning. Both get 401; no B is published. |
| Second attempt arrives after first completed | First already returned B; second gets 401 and revokes B's family. |
| Logout while issuance is pending | Family is revoked; pending issuance gets 401 and returns no descendant. |
| Access token expires while refresh family is valid | Refresh can issue a new access token without requiring the expired access token. |

“Concurrent” HTTP requests can reach either ordering. Network completion order
is not a guarantee. The tests force the pending-issuance ordering with a promise
barrier; they do not rely on sleeps or accept an ambiguous number of successes.
A lost successful response is indistinguishable from reuse: retrying A revokes
the family and requires a new login. If signing fails after consumption, A stays
consumed; this lab does not implement retry recovery. Clients should serialize
refresh attempts, but this example does not implement client coordination.

**Client logout** removes local copies only. The Day 4 Reset Lab Data button is
client cleanup, not server revocation; it deliberately retains no refresh token
and cannot call family logout. Other retained copies can still refresh.

**Refresh-token revocation** (`POST /token/logout`) uses possession of a refresh
token, including a consumed ancestor, to revoke only that family. A separate
login for the same user remains usable. Clients that hold a refresh token should
request family logout before discarding it. If the request fails, local cleanup
alone does not prove the family was revoked. This endpoint does not clear browser
storage or the independent session-cookie lab.

**Already-issued access tokens** do not consult the refresh-family map. Revoking
a family prevents future refresh; its signed access tokens still authorize until
their own five-minute expiry, subject to the normal signature/claim/resource
checks. There is no access-token denylist or immediate access revocation. Refresh
rotation never extends the family's fixed one-hour lifetime.

### Deterministic checks

Run `yarn workspace @frontend-security-lab/api test --runInBand refresh-lifecycle`
for the focused lifecycle suite, or run all API tests. The suite fixes `Date.now`
and supplies the same explicit time to JWT verification, checking expiry at the
exact boundary. Real jose signatures are used. A controllable key-lookup promise
pauses issuance after consumption to test reuse and logout races deterministically.
`test/token.e2e.spec.ts` also checks HTTP logout, idempotence, Origin/body validation,
and continued resource access with an already-issued access token.

### Single-process and distributed limitations

- Each process has a separate map. Workers or replicas do not share token families,
  consumption state, or revocation, even if they use the same signing key.
- The synchronous consume step is atomic only within this process's event loop.
  There are no shared transactions, compare-and-swap operations, or distributed locks.
- Restarts lose refresh state and invalidate every refresh token; persisted signing
  keys mean previously issued access tokens can still verify until expiry.
- Revocation is neither durable nor broadcast. There is no cross-process ordering,
  failover recovery, or coordination between clients/tabs doing refresh.
- Clock agreement across hosts is not handled. Used hashes remain until family
  expiry, with opportunistic pruning and no global storage bounds or rate limits.

These limitations are intentionally documented, not solved. This remains an
in-memory, single-process educational lab, not a production identity provider.
