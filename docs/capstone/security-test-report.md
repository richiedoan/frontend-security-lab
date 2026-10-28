# Capstone security regression report

Run date: 2026-09-26. Base revision: `e058b45`, plus the working-tree BFF
capacity fix and regression-suite changes. Environment actually used: Node
`v24.19.0`, Yarn `1.22.22`. The repository requests Node 22; execution on Node 22
was not verified during this run.

## Scope and verdict

The case list is the preceding capstone review: token exposure, cookies/session
fixation, state/nonce/PKCE, CSRF, CORS, CSP/XSS, redirects/open proxy,
authorization, logging, error leakage, lab isolation, and session exhaustion.

**Final automated run: 259 tests passed, 0 failed, plus static realm validation.**
This means the tested contracts passed, not that every capstone security objective
is satisfied. Known missing controls and unexecuted checks are listed below.

There is no `apps/bff`. The implemented BFF is
[apps/web/server/bff.ts](../../apps/web/server/bff.ts), serving `/bff/*` and calling
local `/token/*` routes. Keycloak browser login and the `/oidc/*` resource server
are separate. No test in this report proves a web → Keycloak BFF → API flow.

## Reproduce

From the repository root with dependencies installed:

```sh
yarn test:security
```

The [runner](../../scripts/security-regression.mjs) invokes:

```sh
yarn workspace @frontend-security-lab/web test
yarn workspace @frontend-security-lab/attacker test
yarn workspace @frontend-security-lab/api test --runInBand --json
node infra/keycloak/validate-realm.mjs
```

It fixes `NODE_ENV=test`, sets `LAB_INSECURE_AUTHZ`, `LAB_INSECURE_CSRF`, and
`LAB_INSECURE_CORS` to `false`, and removes inherited `CSP_MODE`. Individual tests
explicitly enable their comparison modes. It returns nonzero if any step fails;
there are no automatic retries. Use the runner for shareable output: direct test
commands can print assertion diagnostics containing synthetic credentials.

Targeted commands used while implementing the tests:

```sh
yarn workspace @frontend-security-lab/api test --runInBand test/capstone-bff.e2e.spec.ts
./node_modules/.bin/tsc --noEmit --incremental false -p apps/api/tsconfig.json
(cd apps/api && ../../node_modules/.bin/eslint test/capstone-bff.e2e.spec.ts test/token.e2e.spec.ts test/session.e2e.spec.ts)
(cd apps/web && ../../node_modules/.bin/eslint test/bff.test.tsx)
node --check scripts/security-regression.mjs
git diff --check
```

## Recorded automated evidence

Sanitized output from the final `yarn test:security` run (exit 0):

```text
PASS web (exit 0)
  tests 46
  pass 46
  fail 0
  cancelled 0
  skipped 0
  todo 0
PASS second-app (exit 0)
  tests 7
  pass 7
  fail 0
  cancelled 0
  skipped 0
  todo 0
PASS api (exit 0)
  Test Suites: 16 passed, 16 total
  Tests:       206 passed, 206 total
PASS realm-static (exit 0)
Live Keycloak and browser enforcement checks: NOT RUN (see security-test-report.md).
```

The new Nest integration file passed all five tests independently. API typecheck,
targeted lint, runner syntax, and diff whitespace checks passed.

**Validation caveat:** the first aggregate run reported 1 failed API test and
205 passing API tests (15 passing suites, 1 failing suite). Its raw diagnostics
were withheld by the initial redaction runner and the failing case was not
retained. A diagnostic API rerun passed, the final aggregate run passed, and
three additional serial API runs each passed 206/206. The initial failure's cause
remains unidentified; these later passes do not establish that it was fixed.
The runner now emits safe failing-file/assertion-index information from Jest JSON
when available. No raw credential-bearing JSON report is written to disk.

## Coverage and limits by case

“PASS” below describes the specific automated assertion. “Characterization” means
the test accurately records a limitation and must not count as a satisfied
security requirement.

| Case | Automated evidence | Result and scope |
| --- | --- | --- |
| BFF token exposure | [BFF tests](../../apps/web/test/bff.test.tsx), [new Nest integration](../../apps/api/test/capstone-bff.e2e.spec.ts) | PASS: access/refresh values absent from checked browser responses and headers; only document projection returned. Integration uses actual signed tokens and real Nest resource routes. Browser-supplied Authorization/Cookie/forwarded-host values do not become upstream credentials. This does not claim browser OIDC tokens are server-held. |
| Cookies and session fixation | [session e2e](../../apps/api/test/session.e2e.spec.ts), BFF tests and Nest integration | PASS: local cookie attributes, identifier/CSRF rotation, old-cookie rejection, logout invalidation. Added explicit cookie-API re-login invalidation and actual BFF production-environment check. Secure is absent in the local configuration; HTTPS cookie requirements are not passed. |
| State / nonce / PKCE | [real adapter negative test](../../apps/web/test/oidc-adapter-negative.test.mjs), [callback wrapper tests](../../apps/web/test/oidc-callback.test.tsx), [second-app tests](../../apps/attacker/test/second-app.test.tsx), [realm validator](../../infra/keycloak/validate-realm.mjs) | PASS: real adapter rejects missing/wrong transaction state with no token exchange; wrappers request code/S256/nonce and clean success/failure URLs; static realm requires S256. Nonce-mismatch wrapper test simulates an adapter failure. It does not prove real provider/adapter nonce rejection, wrong-verifier rejection, or code single-use. |
| CSRF | [CSRF e2e](../../apps/api/test/csrf.e2e.spec.ts), [secure-path e2e](../../apps/api/test/secure-path.e2e.spec.ts), BFF tests and Nest integration | PASS: missing/wrong/cross-session token and missing/null/foreign/lookalike Origin cases; failed requests do not mutate or reach upstream as asserted. Login/logout are included. Insecure theme behavior is an explicit lab comparison. |
| CORS | [API CORS tests](../../apps/api/test/app.e2e.spec.ts), secure-path e2e, new Nest integration | PASS: exact allowed origin, credentialed response headers, denied origins, Vary and preflight contracts. CHARACTERIZATION: bearer preflight lacks allowed `Authorization`; new test confirms the gap. Browser bearer usability is not a pass. |
| CSP / XSS | [CSP tests](../../apps/web/test/csp.test.tsx), [comment rendering](../../apps/web/test/comment-list.test.tsx), [XSS fixture tests](../../apps/web/test/xss-storage.test.tsx), [development gate](../../apps/web/test/insecure-lab.test.tsx) | PASS: header selection, nonce freshness, production policy text, escaped markup, fixture restrictions, and insecure-route gate. No browser execution/blocking result is claimed. CSP unset/report-only remains non-enforcing. |
| Redirects / open proxy | BFF tests and Nest integration, [OIDC discovery tests](../../apps/api/src/oidc/oidc.spec.ts), realm validator | PASS: fixed destinations, rejected query/path/method variants, upstream `redirect: error`, configured callback allowlists, rejected issuer/JWKS metadata. BFF error projection tests include a simulated upstream 302; no live redirect destination is followed in this suite. |
| Authentication / BOLA | [local bearer e2e](../../apps/api/test/token-documents.e2e.spec.ts), [OIDC tests](../../apps/api/src/oidc/oidc.spec.ts), [cookie authorization matrix](../../apps/api/test/authorization.e2e.spec.ts), Nest integration | PASS: signatures/claims, wrong issuer/audience/type, owner/scope/role denials, credential-family separation, and real BFF owner read/write checks. Nest integration explicitly enables insecure cookie-lab flags and still observes bearer ownership enforcement. Passwordless local identity selection remains a separate unresolved issue. |
| Logging | [token e2e](../../apps/api/test/token.e2e.spec.ts) | PASS: expanded logger tests exclude login/refresh/logout and OIDC paths even with synthetic secret-bearing URL/header inputs. No claim of repository-wide query redaction: other API paths still log `originalUrl`. |
| Error leakage | BFF tests, callback wrapper tests, OIDC tests | PASS: checked BFF failures omit synthetic token markers, redirect locations and upstream bodies; callback failures are generic and URL cleanup occurs; invalid OIDC tokens receive generic errors. Does not cover external ingress/framework access logs. |
| Insecure lab-mode isolation | BFF production test, [token e2e](../../apps/api/test/token.e2e.spec.ts), insecure-XSS gate, secure-path and authorization comparisons | PASS only for tested gates and narrow bypass scope. Cookie login and insecure environment switches still lack a production gate. This is not a complete isolation pass. |
| Session exhaustion | BFF tests retained from the capacity fix | PASS: >1,000 abandoned bootstraps no longer prevent a fresh login; existing authenticated sessions survive; evicted credentials fail; all-authenticated capacity still returns 503. Sustained flooding can still interrupt pending logins. |
| Expiry / refresh / logout races | BFF tests, [refresh lifecycle tests](../../apps/api/src/token/refresh-lifecycle.spec.ts), token e2e, Nest integration | PASS: injected-clock absolute BFF expiry, one refresh for concurrent calls, failed refresh invalidation, logout during refresh, refresh-family rotation/reuse/revocation. CHARACTERIZATION: previously issued access tokens remain valid after logout until expiry. |
| Audit events | [cookie service](../../apps/api/src/document.service.ts), [token controller](../../apps/api/src/token/token-document.controller.ts) | OPEN: no automated evidence of audit creation for BFF writes; token mutations do not emit an application audit event. Cookie audit-read authorization coverage does not close this gap. |

## Test design and artifact handling

- Added five tests in `capstone-bff.e2e.spec.ts`. They invoke the actual BFF
  handler through its Request/Response interface and bridge its fixed upstream
  calls into Supertest/Nest HTTP routes. Nest guards, validation, signing and
  signature verification execute normally; API success responses are not mocked.
  The bridge is not a running Next.js server or a real browser network stack.
- Every integration case has a fresh Nest app and generated in-memory signing
  key. No real provider credentials, fixed service ports, or external requests
  are required. Existing key-file tests use a temporary directory and clean it;
  some older API tests can load/create the gitignored local teaching key.
- BFF expiry uses its injected clock; refresh lifecycle tests control time.
  Concurrent BFF tests now await explicit “refresh entered” and release barriers
  instead of relying on an event-loop turn. No arbitrary sleeps were added; no
  `setTimeout`, `setImmediate`, or browser `waitForTimeout` remains in these test
  files. Ordinary signed-token HTTP tests use current timestamps with broad
  validity windows, not real-time expiry waits. Random credentials are never
  compared to predetermined bytes.
- Existing BFF unit tests retain injected upstream failures for conditions that
  do not need a browser or a live provider. Nest is used for actual API boundaries;
  the BFF is a Next handler, so wrapping it in a fake Nest controller would add
  no coverage.
- Share only runner summaries and this report. The runner buffers subprocess
  output privately and emits allowlisted counts/statuses and safe failure
  locations. It does not export HAR, screenshots, traces, cookies, token bodies,
  authorization codes, or raw Jest JSON. New token-secrecy assertions compare
  booleans so failure messages do not include generated credential values.

## Skipped / not automated

These cases were **not executed**. They are not framework skip counts or passes;
the executed tests report zero skips. No Playwright dependency or browser fixture
was introduced for checks already proved below the browser layer.

| Case | Status and reason | What would provide evidence |
| --- | --- | --- |
| Keycloak BFF login/callback and full chain | NOT IMPLEMENTED | Implement real provider authentication at the BFF, then exercise server transaction binding, callback validation and resource authorization. Current username selection cannot stand in for this. |
| Live nonce mismatch, wrong PKCE verifier, authorization-code reuse, provider redirect rejection | NOT RUN: no live disposable provider login/realm was used | Fill the [sanitized OAuth trace](../evidence/day-05/oauth-trace-template.md); the [redirect checker](../../infra/keycloak/check-unregistered-redirect.mjs) additionally requires running Keycloak. A mock must not be labeled provider enforcement. |
| Browser CSP execution/blocking, cross-origin form submission/response access, browser cookie delivery and cross-port behavior | NOT RUN: suite has no isolated Playwright browser/server fixture | Use Playwright for these browser-only semantics with assertions on requests, DOM and security events, not delays. Disable raw traces/HAR; use disposable data and sanitized outputs. Header assertions alone are insufficient. |
| Live browser storage persistence, SSO across apps, provider-wide logout | NOT RUN: existing adapter/storage unit tests do not instantiate full browser/provider sessions | Disposable browser contexts and Keycloak users; assert app state independently from provider SSO. Local token clearing is not provider logout. |
| Browser public-bundle inspection | NOT RUN: the fake-marker script builds the shared `.next` directory and is outside this offline regression run | Run [check-public-bundle.mjs](../../apps/web/scripts/check-public-bundle.mjs) in an isolated build workspace; preserve only its safe marker verdict and filenames. |
| Production TLS/Secure cookies, deployment exposure, durable/distributed sessions, production isolation of legacy routes | NOT ESTABLISHED by local tests | Deployable configuration and explicit acceptance tests are required. The [review threat model](threat-model.md) records the missing controls; do not promote local HTTP cookie tests to production passes. |
| Durable audit trail for BFF changes | OPEN / NOT IMPLEMENTED | Add audit emission to bearer mutations and verify attributed events without credential logging. |

The earlier threat model is a snapshot from before the capacity fix. For current
session-exhaustion behavior, use the regression results in this report and the
updated BFF code; its remaining rate-limiting limitation still applies.
