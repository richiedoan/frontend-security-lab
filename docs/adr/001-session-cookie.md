# ADR 001: Server-side session cookie for local authentication

- Status: Accepted for the local Day 2 lab
- Date: 2026-09-20

## Context

Day 2 needs a browser authentication state that can demonstrate authentication, authorization, logout, and session-fixation defenses without introducing an identity provider or a production data store. The lab runs over local HTTP and accepts only the predefined usernames `alice`, `bob`, and `admin`; it does not implement real passwords.

The design must distinguish browser cookie state from server session state and must keep authorization at the API boundary rather than relying on hidden UI controls.

## Decision

Use `express-session` on NestJS's Express adapter with its default in-memory store for this local-only lab.

### Cookie versus session

The browser cookie and the server session are different objects:

- The `session` cookie carries an opaque, signed session identifier. It does not contain the lab username, role, document permissions, or document data.
- The server-side session record stores the authenticated `userId` in process memory.
- Possession of a cookie is not itself an authorization decision. The API resolves the session identity and then applies policy to the requested resource.

The request metadata logger records only whether a Cookie or Authorization header exists. It does not log cookie values or session identifiers.

### Local cookie flags

Local HTTP development uses:

| Attribute | Local value | Reason |
| --- | --- | --- |
| Name | `session` | Simple local lab name |
| `HttpOnly` | `true` | Prevent direct cookie reads through browser JavaScript |
| `SameSite` | `Lax` | Reduce some cross-site cookie sending while supporting ordinary local navigation |
| `Secure` | `false` | Required because the current lab uses local HTTP, not HTTPS |
| `Path` | `/` | Make the session available to all API routes |
| `Domain` | omitted | Keep the cookie host-only |

Credentialed CORS is origin-specific and enabled only for `http://localhost:3000` in normal mode. The local insecure wildcard CORS mode does not enable credentials.

### Login and session regeneration

`POST /session/login` accepts a predefined lab username. Before storing `userId`, the controller regenerates the session. It then writes the identity and explicitly saves the new session before returning.

Regeneration prevents an identifier associated with a pre-login session from continuing as the authenticated session identifier. This is the lab's session-fixation defense.

### Logout semantics

`POST /session/logout` performs two separate operations:

1. Destroy the server-side session record.
2. Clear the browser's `session` cookie using matching local cookie attributes and `Path=/`.

Clearing only the cookie would leave server state alive. Destroying only server state would leave a stale browser cookie. Tests verify that a captured old cookie is rejected after logout.

### 401 versus 403

- `401 Unauthorized` means no valid authenticated identity was resolved from the server session. The session authentication guard owns this decision.
- `403 Forbidden` means an authenticated user exists but policy denies the requested resource or action. The document service owns this decision.

Despite the HTTP reason phrase, this project uses 401 for missing authentication and 403 for failed authorization.

### Server authorization boundary

The API is the authorization boundary:

- The session guard resolves the authenticated user and attaches it to the server request.
- The service applies role, ownership, editor, viewer, and admin policy to each protected operation.
- UI control visibility is only a usability feature and grants no authority.
- Next.js middleware is not used as an authorization boundary.

Secure mode is the default. `LAB_INSECURE_AUTHZ=true` is an explicitly labelled `LOCAL LAB ONLY` comparison that intentionally skips document read policy after authentication. It does not weaken edit or admin-audit authorization and is not part of the production design.

## Consequences

### Benefits

- Session identity remains server-side rather than being exposed as mutable client claims.
- Login rotates the session identifier.
- Logout invalidates server state as well as clearing client state.
- Authentication and authorization failures are observable as distinct 401 and 403 responses.
- Pure policies and e2e authorization matrices can be tested independently of UI visibility.

### In-memory store limitations

The default Express MemoryStore is deliberately non-production:

- All sessions disappear when the API restarts.
- Multiple API instances cannot share sessions.
- It is not designed for production memory management, durability, availability, or operational load.

No Redis or other shared session store exists in the repository at this stage.

## Production changes required

The production target is not implemented. A production deployment would require at least:

- HTTPS termination and a cookie named `__Host-session` with `Secure`, `HttpOnly`, `Path=/`, `SameSite=Lax`, and no `Domain`.
- A production-grade shared session store, such as Redis, with appropriate expiry, availability, and operational controls.
- An externally managed high-entropy session secret with a rotation plan instead of the committed local lab string.
- Explicit session lifetime, idle timeout, renewal, and revocation requirements.
- Correct trusted-proxy configuration when TLS terminates upstream.
- Real identity verification rather than username-only lab login.
- CSRF defenses appropriate to the deployed request model.
- XSS prevention and impact-reduction controls, including output encoding and a reviewed Content Security Policy.

This ADR does not claim that HTTPS, Redis, production secrets, proxy configuration, CSRF tokens, or a CSP currently exist.

## Residual XSS and CSRF risk

`HttpOnly` reduces direct session-cookie theft through JavaScript, but it does not eliminate XSS risk. Script running in the trusted origin can still issue authenticated requests as the user, read same-origin data, modify the page, and exfiltrate accessible information.

`SameSite=Lax` reduces some cross-site cookie attachment, but it is not a complete CSRF defense. The lab currently has no CSRF token mechanism or explicit Origin/Referer validation for state-changing requests. CORS controls whether browser JavaScript may read cross-origin responses; it must not be treated as CSRF protection or authentication.

The local lab therefore demonstrates session mechanics and server authorization, not a complete production browser-security posture.

## Verification

The repository's e2e tests cover:

- unauthenticated session rejection;
- login and local cookie attributes;
- authenticated `GET /session/me`;
- logout cookie clearing and server-side destruction;
- rejection of an old cookie after logout;
- 401 responses without a session;
- owner, editor, viewer, non-owner, and admin authorization outcomes;
- the explicitly insecure read comparison without weakening edit or audit policy.
