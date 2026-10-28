# Day 5: browser OIDC with Keycloak

The web app uses pinned `keycloak-js` 26.2.4, the maintained Keycloak OpenID
Connect browser adapter. It owns Authorization Code flow, S256 PKCE generation,
state correlation, nonce generation/validation, and the token exchange. See the
[official adapter guide](https://www.keycloak.org/securing-apps/javascript-adapter).
No OAuth endpoint calls, token parsing, or protocol validation are implemented by
the app. Public configuration is fixed to the local lab: server
`http://localhost:8080`, realm `lab`, client `security-web`, and exact callback
`http://localhost:3000/auth/callback`. There is no client secret or public secret
environment variable.

## Run

Follow [infrastructure setup](../../infra/README.md) and the separate
[one-time password setup](../../infra/keycloak/README.md#one-time-manual-admin-action-local-passwords).
If the `lab` realm predates the seed, follow its explicit reimport instructions.
Start only the required infrastructure from `infra/`:

```sh
docker compose up -d --wait --wait-timeout 180 postgres keycloak
```

From the repository root, start only the web app:

```sh
yarn workspace @frontend-security-lab/web dev
```

Open <http://localhost:3000/labs/oidc> (use `localhost`, not `127.0.0.1`). Click
**Sign in with Keycloak**. After login and any required password change, the
callback is processed once, its query/fragment is removed, and client navigation
replaces it with `/labs/oidc`. The page displays the username and lab roles.
The existing API and attacker application are not required for this flow.

The same page includes [Day 6 OIDC inspection](oidc-inspection.md), showing only
selected ID-token and access-token claims with their separate purposes and
consumers. That guide explains the client and API validation boundaries.
Use the [second-app SSO walkthrough](keycloak-sso.md) to observe another public
client on port 3001 obtaining its own authorization response through the same
Keycloak session.

## Token lifetime and logout

Access, refresh and ID tokens remain in the adapter instance's memory. They are
never copied into cookies, localStorage, sessionStorage, logs, URLs, or rendered
markup. A page reload loses the local session. Client-side Next.js navigation
preserves the instance. This lab clears tokens on expiry rather than silently
refreshing. **Log out locally** calls the adapter's `clearToken()`; it does not
end the Keycloak SSO session or revoke already issued tokens. Signing in again
may therefore complete without a password prompt.

The adapter temporarily stores login transaction data (state, nonce, PKCE
verifier and redirect URI) under `kc-callback-*` in localStorage, with its own
cookie fallback when storage is unavailable. This is not a token store. The
adapter consumes matching state during callback processing and expires stale
transactions. Do not confuse these entries with persistent access tokens.

The callback treats an unauthenticated adapter result as failure, including
missing, unknown or consumed state. Errors clear tokens and remove callback
parameters; provider error descriptions are not displayed. Restarting login
after failure performs a fresh document load. Initialization is shared across
React Strict Mode effect runs to avoid consuming the same callback twice.

The CSP permits connections to the exact local Keycloak origin for the token
exchange. Silent SSO and the session iframe are disabled. The displayed role is
UI information, not API authorization; these tokens are not sent to the earlier
labs' API. Memory storage does not protect tokens from JavaScript executing in
the same page through XSS.

## Browser-only verification

Use the [Day 5 sanitized trace template](../evidence/day-05/oauth-trace-template.md)
for observations, redaction rules, negative demonstrations, and the automated
production-bundle fake-marker check.

Use disposable lab accounts. Inspect requests locally, but do not commit raw
HAR files, tokens, callback URLs, passwords, or transaction state as evidence.

1. Enable Preserve log in DevTools Network and log in. The authorization request
   must contain `response_type=code`, client `security-web`, the exact callback,
   `code_challenge_method=S256`, a challenge, state, and nonce. The token request
   must use `authorization_code` and a verifier, with no client secret.
2. Confirm the final URL is `/labs/oidc` with no code, state, query, or fragment.
   Confirm username/roles appear and no token is rendered. Check browser storage:
   no access, refresh or ID token should be persisted; the consumed callback
   transaction should be removed.
3. Reload: the page must be signed out locally. Log in again, then use local
   logout: the user display disappears. A new login may reuse Keycloak SSO.
4. In a signed-out tab, visit `/auth/callback?code=fake&state=unknown`, then
   `/auth/callback?code=fake`, and then `/auth/callback?error=access_denied&state=unknown`.
   Each must show a generic failure, no authenticated user, no successful token
   exchange, and a cleaned `/auth/callback` URL. Use **Restart Day 5 login**.
5. To test state tampering on an actual transaction, pause the return navigation
   in browser tooling and alter only state before letting it reach the app.
   It must fail. Reopening an already consumed callback must also fail. Keep any
   copied callback URL local and discard it afterward.
6. Block the token endpoint in DevTools during login: the callback must fail
   with a clean URL and no authenticated user. Unblock it and restart login.
7. Repeat successful login with `CSP_MODE=enforce` when starting the web app;
   there should be no CSP block of the Keycloak token request.

Automated checks:

```sh
yarn workspace @frontend-security-lab/web test
yarn workspace @frontend-security-lab/web typecheck
yarn workspace @frontend-security-lab/web lint
```

The focused callback tests exercise app behavior with adapter results for
success, unknown/replayed state, provider errors, nonce rejection and exchange
failure. They do not independently prove the library's cryptographic validation
or replace the live browser checks above.
