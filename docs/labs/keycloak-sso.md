# Two applications, one Keycloak SSO session

The first app and second app are separate public OIDC clients in the `lab`
realm. Each uses Authorization Code flow with S256 PKCE, its own state/nonce,
an exact callback, and its own in-memory adapter instance.

| | First app | Second app |
| --- | --- | --- |
| Login page | `http://localhost:3000/labs/oidc` | `http://localhost:3001/second-app` |
| Client ID | `security-web` | `security-second-app` |
| Registered redirect | `http://localhost:3000/auth/callback` | `http://localhost:3001/second-app/callback` |
| Allowed web origin | `http://localhost:3000` | `http://localhost:3001` |
| Default scopes in seed | profile, email, roles, documents:read | profile |

The second client has no API audience mapper, API scope, secret, password grant,
implicit flow or service account. It makes no resource API calls. The API still
accepts only its existing `security-web` access-token contract. No API CORS
permission is added for port 3001.

## Setup

Follow [realm setup](../../infra/keycloak/README.md), including local password
setup. If the realm already exists, restarting Keycloak will **not** add the new
client: use the documented explicit seed replacement procedure, which replaces
local users/passwords, then set the disposable passwords again. The repository
change alone does not modify a running realm.

Start Keycloak/Postgres, then run these in separate terminals from the repo root:

```sh
yarn workspace @frontend-security-lab/web dev
yarn workspace @frontend-security-lab/attacker dev
```

The second app is hosted by the existing `apps/attacker` Next.js process on port
3001. Its `/second-app` and `/second-app/callback` routes are separate from the
attacker controls at `/attacker`. The existing development-only `/labs/csrf`
route is preserved. The port 3001 root is a chooser. Links between these labs
use full document navigation so leaving the second app drops its in-memory
instance. Route separation is organizational, not a security boundary between
scripts served on the same origin; never host real hostile code alongside login.

## Observe the redirects

Use the same browser profile with localStorage enabled and two tabs. Start with
a fresh browser session or no active Keycloak session to observe the first
password prompt. Enable Network Preserve log locally without exporting raw HARs.

1. In app A, click **Sign in with Keycloak**. It navigates to
   `http://localhost:8080/realms/lab/protocol/openid-connect/auth` with
   `client_id=security-web`, its exact callback, `response_type=code`, `scope=openid …`,
   state A, nonce A and S256 challenge A. The adapter retains A's transaction
   data locally for the return trip.
2. Keycloak authenticates the user and establishes its realm session. It redirects
   to `http://localhost:3000/auth/callback?code=[redacted]&state=[redacted]…`.
   App A's adapter correlates state, exchanges code A with verifier A at the
   realm token endpoint, and checks the nonce. The callback URL is cleaned,
   navigation returns to `/labs/oidc`, and A holds its own tokens in memory.
3. Open app B at `http://localhost:3001/second-app` in another tab. It initially
   shows signed out: A's tokens were not transferred. Click **Sign in to second
   app with Keycloak**. A new authorization request uses
   `client_id=security-second-app`, B's exact callback, and new state B, nonce B,
   verifier/challenge B. No token from A is included.
4. On this top-level navigation, Keycloak recognizes its existing realm session.
   With an active session and no additional consent/required action, it can
   redirect back without another password prompt. Authentication policy or an
   expired session may still require interaction; that does not imply sharing
   application credentials.
5. Keycloak sends a **new** authorization response to
   `http://localhost:3001/second-app/callback?code=[redacted]&state=[redacted]…`.
   B correlates its own state, exchanges code B with verifier B using its client
   ID and redirect URI, checks the nonce, cleans the callback URL and returns to
   `/second-app`. B now holds its own tokens. Its ID-token audience identifies
   B, while the same realm subject can identify the same user in both apps.

SSO is reuse of the **Keycloak session during authorization**, followed by a
separate response and local session for each app. It is not copying A's cookies,
code, ID token, access token or refresh token into B. The adapter owns protocol
processing; see [token consumer and validation boundaries](oidc-inspection.md)
for what its parsed profile does and does not prove.

## Storage and session isolation

Neither OIDC app creates or consumes an application authentication cookie. No
token is persisted, rendered, passed through links, `postMessage`, or a shared
store. The existing earlier cookie-auth labs remain independent and are not used
to log either OIDC client in.

Cookies are scoped by host/path, **not port**: localhost ports do not guarantee
cookie isolation. Keycloak owns its realm session cookie; the browser sends it
to the matching Keycloak authorization endpoint. This demonstration relies on
that provider session, not a shared application cookie. LocalStorage, in contrast,
is origin-scoped, so the adapter's transient `kc-callback-*` transaction entries
at 3000 and 3001 are separate. They contain state/nonce/PKCE transaction data,
not persisted tokens. Keycloak's adapter can fall back to cookies if localStorage
is unavailable; keep localStorage enabled for this origin-isolation observation.
Matching, one-time transaction state remains necessary even with that fallback.

Local logout or reload in B removes B's local authentication only; A remains
signed in and Keycloak SSO remains active. Clicking login in B again should
produce another redirect/code exchange that may need no password. Both apps
clear their tokens on access-token expiry rather than refreshing. Session iframe
and silent SSO are disabled, so provider logout does not instantly clear another
app's already-issued in-memory tokens.

## Checks and sanitized evidence

- Record only client IDs, callback paths, `S256`, response statuses, whether a
  password prompt occurred and whether the final URL was cleaned. Redact codes,
  state, nonce, verifiers, cookies, tokens and identifying profile fields.
- Verify B starts signed out while A is signed in; B's login still contacts
  Keycloak and performs its own code exchange. Confirm no resource API call.
- Log out locally in B, verify A stays signed in, then log B in again.
- Reload B and repeat. Test unknown/missing state at
  `/second-app/callback?code=fake&state=unknown` and `?code=fake`: expect a generic
  error, a cleaned URL, no signed-in display and no successful token exchange.
- Check each client rejects the other client's redirect URI and any unregistered
  path. Do not broaden redirect allowlists to make a failing test pass.
- Confirm `/attacker` still has fetch/form controls and `/labs/csrf` still serves
  its development-only demonstration.

Offline checks: `node infra/keycloak/validate-realm.mjs` and
`yarn workspace @frontend-security-lab/attacker test` (plus `typecheck`, `lint`,
and `build`). Adapter-result unit tests cover callback failure/cleanup; only the
live two-tab procedure establishes observed SSO behavior.

Reference: [Keycloak JavaScript adapter](https://www.keycloak.org/securing-apps/javascript-adapter).
