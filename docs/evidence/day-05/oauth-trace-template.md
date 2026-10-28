# Day 5 OAuth trace — sanitized evidence template

Status: **not yet observed**. This template is not a successful execution record.
Fill only the safe fields below; replace every placeholder rather than pasting a
request/response. Use disposable lab users and the local realm only.

## Run metadata

- Date/time: `<date>`
- Commit: `<commit>`
- Browser/version: `<browser>`
- Keycloak image: `<pinned version>`
- Realm/client: `lab` / `security-web`
- API audience: `security-api`
- Setup/reimport and local password setup completed: `<yes/no>`
- Result: `<pass/fail/not run>`

Setup: [browser login](../../labs/keycloak-oidc.md),
[realm import/passwords](../../../infra/keycloak/README.md), and
[API verification](../../../apps/api/src/oidc/README.md).

## Redaction guide — apply before saving evidence

Never record actual authorization codes, access/ID/refresh tokens, passwords,
cookies, Authorization/Set-Cookie headers, PKCE verifiers, state, nonce, session
IDs, or full callback/authorization URLs. Do not include prefixes, suffixes,
hashes, encoded forms, or screenshots containing them. Use `[REDACTED]` or a
boolean such as `present=yes`. Also redact token claims containing real user
identifiers, emails or names. Do not save decoded JWTs.

Inspect transiently in DevTools only. Do not export HAR, copy as cURL/fetch,
paste real values into a terminal/chat/editor, enable verbose HTTP tracing, or
commit raw logs. Prefer the tables in this file over screenshots. If a screenshot
is necessary, crop sensitive fields completely before saving; review the final
artifact, including URL bars and open request panels. Clearing DevTools afterward
does not sanitize a file already saved. Discard accidental raw captures.

Safe evidence: route paths without query strings, HTTP methods/statuses, parameter
names, fixed local client/issuer/audience, scope/role names, booleans, generic
OAuth error identifiers (not descriptions), and filenames from the fake-marker
scan. The fixed fake marker below is deliberately public and may be recorded.

## 1. Authorize request

| Observation | Expected | Observed |
| --- | --- | --- |
| Endpoint | `GET /realms/lab/protocol/openid-connect/auth` | `<path only>` |
| Client | `security-web` | `<client>` |
| Response type | `code` | `<type>` |
| Redirect URI | `http://localhost:3000/auth/callback` exactly | `<match yes/no>` |
| Scope | Includes `openid`; default realm client scopes supply `documents:read` | `<scope names only>` |
| PKCE method | `S256` | `<method>` |
| Challenge | Present; value omitted | `<yes/no>` |
| State / nonce | Both present; values omitted | `<yes/no>` |
| Client secret | Absent | `<absent yes/no>` |

## 2. Callback

| Observation | Expected | Observed |
| --- | --- | --- |
| Route | `/auth/callback` | `<path only>` |
| Code/state parameters | Present on successful return; values omitted | `<yes/no>` |
| State correlation | Library accepts only its outstanding transaction | `<pass/fail>` |
| Nonce validation | Library-managed, enabled in configuration | `<config checked/live rejection tested/not tested>` |
| Final browser URL | `http://localhost:3000/labs/oidc`, no query or fragment | `<clean yes/no>` |
| Failure URL | `/auth/callback`, no query or fragment | `<clean yes/no/not tested>` |
| Failure UI | Generic error, no authenticated user or provider details | `<pass/fail/not tested>` |

## 3. Token exchange

| Observation | Expected | Observed |
| --- | --- | --- |
| Endpoint | `POST /realms/lab/protocol/openid-connect/token` | `<path only>` |
| Grant | `authorization_code` | `<grant>` |
| Code / verifier | Present; neither value recorded | `<yes/no>` |
| Client / redirect | `security-web` / exact registered callback | `<match yes/no>` |
| Client secret | Absent | `<yes/no>` |
| Response | Successful exchange: HTTP 200 | `<status>` |
| Token fields | Access token present; values omitted | `<field names only>` |
| Persistent token storage | No access/ID/refresh tokens in web storage/cookies | `<pass/fail>` |

The adapter may temporarily persist transaction state/nonce/verifier under
`kc-callback-*`; inspect only whether the entry exists/was consumed. Do not copy
its JSON. Transaction storage is not token storage.

## 4. API request

| Observation | Expected | Observed |
| --- | --- | --- |
| Endpoint | `GET /oidc/me` or `/oidc/documents/alice-notes` | `<path>` |
| Authorization | Bearer **access** token, value omitted | `<present yes/no>` |
| Verification | Signature, issuer, `security-api` audience, expiry and access-token type | `<automated/live result>` |
| Authorization policy | Explicit `documents:read`, `user` role, matching subject owner | `<pass/fail>` |
| Response | Own document 200; wrong owner/role 403; invalid token 401 | `<status only>` |

The browser UI does not yet call the API automatically. Use the API tests below
for reproducible evidence without copying a real token; label that evidence as
automated, not a live browser request.

## Automated checks

Run from the repository root (no app servers are started by these tests):

```sh
yarn workspace @frontend-security-lab/web test
yarn workspace @frontend-security-lab/api test --runInBand src/oidc/oidc.spec.ts
node infra/keycloak/validate-realm.mjs
```

The real adapter test uses synthetic input and forbids network access: wrong or
missing state must leave it unauthenticated with no token exchange. Separate
callback wrapper tests check generic errors and URL cleanup. API tests use real
JOSE signatures and local keys. Realm validation checks exact redirect/origin and
S256 configuration. None of these proves live authorization-code single use.

Optional live check, after starting/importing local Keycloak:

```sh
node infra/keycloak/check-unregistered-redirect.mjs
```

This sends only synthetic parameters, no credentials or cookies, does not follow
redirects, and prints only a safe verdict/status. It requires the specific
redirect-URI error; an unavailable realm or generic 400 is not a pass.

## Negative demonstrations

Use a fresh login transaction for each case. Keep all real values transient in
browser tooling. Record only status, generic error identifier and verdict.

| Case | Boundary exercised | Expected | Observed |
| --- | --- | --- | --- |
| Wrong state | Browser adapter | Unauthenticated; no exchange; clean error URL | `<not run/pass/fail>` |
| Wrong verifier | Keycloak token endpoint | HTTP 400, `invalid_grant`, no tokens | `<not run/pass/fail>` |
| Code reuse | Keycloak token endpoint | First exchange 200; replay 400 `invalid_grant` | `<not run/pass/fail>` |
| Unregistered redirect | Keycloak authorization endpoint | 400 redirect-URI error; no redirect to supplied URI | `<not run/pass/fail>` |
| Fake frontend secret | Production browser bundle | Fixed fake marker found in `.next/static/**/*.js` | `<not run/pass/fail>` |

### Wrong state

Visit `http://localhost:3000/auth/callback?code=synthetic-code&state=wrong-state`.
Confirm rejection, no token request, and clean callback URL. For a live outstanding
transaction, pause return navigation in browser tooling and replace only state
with `wrong-state` before the app processes it. Do not save the original URL.
The synthetic case alone does not prove code or PKCE validity.

### Wrong verifier

Begin login but stop before submitting the Keycloak login form. In another tab
at the web origin, use DevTools Application/Storage to locate the newly created
`kc-callback-*` transaction. Edit only `pkceCodeVerifier` to a fixed synthetic
43-character string (for example 43 `A` characters), preserving the other fields
without copying or saving them. Complete login promptly. Keycloak must reject
the exchange with HTTP 400 / `invalid_grant`; the app must show a generic error
and clean the URL. Never weaken the realm's PKCE setting to make this test run.
If the transaction is missing/expired, restart; an unknown code/state failure
does not demonstrate verifier enforcement.

### Code reuse

Use a fresh successful login. In browser Network tooling, replay/resend the
successful token POST **unchanged**, using the browser's built-in request replay
(for example Replay XHR where available, or Firefox Edit and Resend without
editing). Do not copy the request into code, cURL, a file or the console.
Confirm first response 200 and replay 400 / `invalid_grant`. Record only these
statuses and the error identifier. An app callback replay can fail on consumed
state before contacting Keycloak, so it is not evidence of server-side code
reuse protection. If tooling cannot replay, mark this case **not run**.

### Unregistered redirect URI

Run the optional live script above. It supplies
`http://localhost:3000/unregistered-day05-callback`, which is not registered.
Do not add it to the realm to complete the test. No attacker server is needed.

### Fake marker in a production browser bundle

Stop any active web build/dev process using the same `.next` directory first:

```sh
yarn workspace @frontend-security-lab/web check:public-bundle
```

The script sets `NEXT_PUBLIC_LAB_BUNDLE_MARKER` to the fixed noncredential
`DAY05_FAKE_PUBLIC_MARKER_NOT_A_CREDENTIAL_7f392a`, runs a production build, and
searches **only browser JavaScript** in `.next/static`. It reports matching
filenames, never snippets. The value is referenced by a client component so the
check demonstrates build-time inlining, not merely finding text in server code
or source maps. Never substitute a real secret. No `.env` edit is needed.

Record: build exit `<status>`, marker found `<yes/no>`, browser chunk filename
`<relative filename>`. This proves that browser-delivered values are public;
minification and environment-variable naming do not make them secret. See
[Next.js public environment variables](https://nextjs.org/docs/pages/guides/environment-variables).

The script leaves a normal production build containing the fake marker. Rebuild
without the marker (`yarn workspace @frontend-security-lab/web build`) to remove
it. The script restores generated `next-env.d.ts`; build artifacts are ignored.

## Conclusion and cleanup

- Automated results: `<counts/verdicts only>`
- Live cases not run: `<list>`
- Unexpected observations: `<sanitized description>`
- DevTools network history/temporary transactions cleared: `<yes/no>`
- Local logout completed and test browser session closed: `<yes/no>`
- No raw captures, codes, tokens, cookie values or passwords saved: `<confirmed>`

Do not mark an expected result as observed until its corresponding check runs.
