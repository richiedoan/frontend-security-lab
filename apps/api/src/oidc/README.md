# Day 5 OIDC resource server

The `/oidc/*` routes use the existing maintained `jose` dependency for
`jwtVerify` and `createRemoteJWKSet`. They accept only an Authorization Bearer
access token. They never authenticate using session cookies, query parameters,
or the Day 4 signing key. No Keycloak admin API is called.

The local trust configuration is explicit in `oidc-verifier.ts`:

| Check | Required value |
| --- | --- |
| Issuer | `http://localhost:8080/realms/lab` |
| Audience | `security-api` (a member of `aud` if it is an array) |
| Signature | RS256, key from the trusted realm's discovered JWKS |
| Authorized party | `azp=security-web` |
| Access token type | Signed payload `typ=Bearer`; ID tokens have `typ=ID` and are rejected |
| Time claims | Required `exp` and `iat`, valid expiry, no future `iat`; `nbf` checked when present |
| Subject | Nonempty `sub` |

Discovery is lazy and cached per API process, so starting earlier labs does not
require Keycloak. Metadata must report the exact configured issuer and its
expected Keycloak JWKS URI; tokens cannot choose key URLs. JOSE caches the JWKS
for ten minutes, with a 30-second fetch cooldown and a five-second network
timeout, and can reload keys on an unknown `kid`. Discovery failures can retry.
Verification/network failures produce a generic 401, never a fallback to another
authentication method. The HTTP localhost endpoints are for this development
lab, not a production deployment configuration.

Only the `documents:read` scope and `user`/`admin` roles from `realm_access.roles`
are mapped into the request principal. Client roles, username, arbitrary claims
and frontend-decoded data grant no permissions.

| Route | Authorization after token verification |
| --- | --- |
| `GET /oidc/me` | Returns only subject and mapped scopes/roles |
| `GET /oidc/documents/:id` | Exact `documents:read` scope, `user` realm role, and matching owner subject |
| `GET /oidc/admin/audit` | `admin` realm role |

The read-only fixtures `alice-notes` and `bob-notes` are independent of the Day 2
and Day 4 documents. Their owners match the explicit UUID user IDs in the realm
seed. Even `admin` cannot bypass document ownership. Missing credentials or
invalid tokens return 401; scope/role/owner failures return 403. Authenticated
reads of unknown document IDs return 404 after scope/role checks.

No global auth guard or CSRF exemption is added. These routes are GET-only;
earlier session/CSRF rules and `/token/*` guards remain in place. OIDC requests
are excluded from the request metadata logger to avoid logging sensitive query
values accidentally sent by a caller. Successful responses use `no-store`.

## Realm setup and verification

The seed now adds an access-token-only `security-api` audience mapper and default
`documents:read` client scope to `security-web`. It also sets stable user IDs.
Existing realms are skipped on startup: follow the explicit replacement and
password setup in [the realm instructions](../../../../infra/keycloak/README.md).
Replacing the realm removes its existing local users/passwords. Then log in
again to obtain tokens with the new audience and scope.

Start Keycloak/Postgres and the web login using the [browser guide](../../../../docs/labs/keycloak-oidc.md).
Start the API from the repository root with:

```sh
yarn workspace @frontend-security-lab/api start:dev
```

For local browser verification, inspect a fresh login's token response in
DevTools and use only its **access token** for a local request to
`http://localhost:4000/oidc/me`. Alice should get 200 for her own document and 403
for Bob's. An ID token must get 401. The web login UI does not automatically call
these endpoints yet. Keep tokens out of source files, screenshots, shell history
and committed evidence. No admin credentials are needed by the API.

```sh
yarn workspace @frontend-security-lab/api test --runInBand
yarn workspace @frontend-security-lab/api typecheck
yarn workspace @frontend-security-lab/api lint
yarn workspace @frontend-security-lab/api build
node infra/keycloak/validate-realm.mjs
```

Tests use locally generated RSA keys and JOSE's local JWKS resolver, exercising
real signature/claim verification over HTTP through the full app module.
Discovery metadata is mocked separately. Cases cover wrong issuer/audience,
expiry, future validity, forged/unsigned tokens, ID-token confusion, role/scope
checks, owner mismatch, and isolation from session/local-token authentication.
They require no Keycloak, application server process or admin API. Live Keycloak
discovery, rotation and browser-issued tokens still need manual verification.

Reference: [JOSE remote JWKS verification](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md).
