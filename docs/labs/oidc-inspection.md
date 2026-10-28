# Day 6: inspect selected OIDC claims

Follow the [Day 5 setup and login](keycloak-oidc.md), then open
<http://localhost:3000/labs/oidc#inspection>. Day 6 shares the existing login
page and in-memory adapter session. No API process is needed for inspection.

The view reads only `idTokenParsed` and `tokenParsed` after client initialization
has succeeded and the adapter reports an authenticated session. It does not
decode JWTs or accept pasted tokens. The fixed allowlist is `sub`, `iss`, `aud`
(string or array), and `exp` (shown in UTC). The ID-token section additionally
shows `preferred_username`, `name`, `given_name`, and `family_name` as escaped
text. Missing or malformed display values show “Not provided”. These formatting
checks are not token validation.

No raw ID, access, or refresh token is read by the inspection component or
rendered, persisted, logged, or sent anywhere by it. Other claims, including
nonce, session identifiers, email, roles, and arbitrary custom claims, are
excluded from inspection. The existing Day 5 role summary remains separate.
Names and subject identifiers are still personal information: use disposable
lab accounts and redact them from shared evidence.

## Consumers and validation boundaries

| Token | Intended consumer and purpose | Required validation at the consumer |
| --- | --- | --- |
| ID token | OIDC relying party `security-web`; represents the authentication event and user identity. Its audience includes the client ID. It is never an API bearer credential. | Validate the exact trusted issuer, client audience, authorized party (`azp`) where applicable, expiry, and the transaction nonce. Validate the signature with trusted issuer keys and an allowed algorithm, subject to the specific direct token-endpoint TLS exception described below. Apply authentication-time/max-age requirements when requested. |
| Access token | Resource server `security-api`; authorizes access to protected resources. Its audience must include the API. | Verify the signature and allowed algorithm with trusted issuer keys, exact issuer, API audience, validity times, expected token type and applicable client restrictions. Then enforce scopes, roles and resource ownership for the requested operation. Browser display claims grant no permissions. |
| Refresh token | Authorization server token endpoint; obtains replacement tokens. | The authorization server validates the token, expiry/revocation, client binding and its rotation/reuse policy. It is neither an identity display nor a resource API credential. This lab clears the session on expiry instead of refreshing. |

The pinned `keycloak-js` 26.2.4 adapter owns callback state correlation, S256
PKCE, code exchange, nonce checking and parsed claim objects. This view displays
claims **handled by that client**, not independently cryptographically verified
claims. In this version, parsing JWTs is decoding: the browser adapter does not
perform a general JWT signature/issuer/audience verification pass. It trusts
the configured Keycloak token endpoint and checks the login transaction. Do not
use this display as evidence that every validation requirement above was checked.

[OIDC Core ID-token validation](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)
allows reliance on TLS server validation instead of signature checking for an
ID token obtained directly from the token endpoint in code flow. This is a
specific exception, not permission to trust arbitrary decoded JWTs or omit the
other claim checks. This local lab uses HTTP on localhost; it does not demonstrate
production TLS trust. A production client must meet all applicable OIDC
validation requirements through its supported library/integration and trusted
HTTPS provider configuration. Do not add a hand-written browser JWT verifier.
See also the [Keycloak adapter reference](https://www.keycloak.org/securing-apps/javascript-adapter).

The existing API independently uses JOSE to verify RS256 signatures from the
configured realm JWKS, issuer `http://localhost:8080/realms/lab`, audience
`security-api`, `azp=security-web`, and signed payload `typ=Bearer`. It requires
`exp`, `iat`, subject and scope, rejects expired tokens and future `iat`, and
checks `nbf` when present. It then enforces route-specific scopes, roles and
ownership. ID tokens (`typ=ID`) are rejected even if other claims overlap.
See the [resource server checks](../../apps/api/src/oidc/README.md).

This view makes no resource API calls. Any future caller must use only the
adapter's **access token** as `Authorization: Bearer …` for the intended API;
never substitute an ID token or refresh token. Access tokens can be opaque in
other deployments: the API's supported token format and validation contract
determine how it validates them, not this browser inspector.

## Verification

1. Sign in and inspect both sections. The ID audience should include
   `security-web`; the access audience should include `security-api` with the
   current realm seed. Check each section's subject, issuer and UTC expiry.
2. Confirm the DOM contains only the selected claims, with no raw tokens or
   full payload dump. Do not copy token responses into screenshots or evidence.
3. Confirm inspecting the page causes no request to `localhost:4000`.
4. Use local logout, reload, or let the adapter's expiry callback run: claim
   values disappear. A new login can reuse the Keycloak SSO session.
5. A rejected callback must show the generic Day 5 error and no claim values.

Automated rendering tests cover claim separation, omitted credentials and
unlisted claims, profile escaping, malformed values, signed-out/cleared state,
and no fetch during rendering. Run `yarn workspace @frontend-security-lab/web test`,
`typecheck`, and `lint`. These tests do not replace live Keycloak/browser checks
or the API's independent verifier tests.
