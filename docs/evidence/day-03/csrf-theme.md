# LOCAL LAB ONLY: CSRF against a theme preference

Use only these lab origins: trusted web `http://localhost:3000`, attacker
`http://localhost:3001`, API `http://localhost:4000`. Use `localhost` consistently,
not a mixture of localhost and 127.0.0.1. No external endpoints or real credentials
are involved. The attack requests only the harmless preference `theme=dark`.

## Secure default

1. Run `yarn dev` with `LAB_INSECURE_CSRF` absent (and `LAB_INSECURE_CORS` absent).
   If an older dev session is running, stop it first. The API and attacker dev
   servers bind to loopback. The auto-submit route is available only in development.
2. Open the trusted web page, sign in as Alice, and find **Day 3**.
3. Click **Set theme to light**, then **GET saved theme**. Latest result should
   show `200 {"theme":"light"}`. Only this saved preference changes, not page styling.
4. Open DevTools Network with Preserve log, then visit
   `http://localhost:3001/labs/csrf`. The page automatically submits a plain HTML
   form into a hidden iframe; it sends `application/x-www-form-urlencoded` with
   `theme=dark`. There is no fetch or custom header and no preflight is required.
5. Observe a POST to `/profile/theme` returning **403**. The request reaches the
   server, but the API rejects its `Origin: http://localhost:3001` before mutation.
6. The attacker page reports that it cannot read the response (`SecurityError`).
   Return to the trusted tab and click **GET saved theme**: it remains **light**.

## Explicit insecure mode

1. Stop the dev session and restart with:

   ```sh
   LAB_INSECURE_CSRF=true yarn dev
   ```

   The API logs `LOCAL LAB ONLY: theme changes skip CSRF token and Origin validation.`
   Only the exact value `true` enables the bypass; other values keep secure mode.
2. Sign in again: sessions and preferences are in memory and reset with the API.
   Set light and read it back from Day 3.
3. Visit/reload `http://localhost:3001/labs/csrf` with Network open.
4. Observe the POST returning **200**, still without a CORS allow-origin header
   for the attacker. The attacker script still reports an unreadable response.
5. Back on the trusted page, **GET saved theme** now shows **dark**. This is proof
   of mutation despite the attacker being unable to read the response.

## Evidence to record

For each mode, record the before/after saved theme, POST status, form content
type, attacker Origin, and the unreadable-response message. Server output from
`RequestMetadata` should contain:

```json
{"method":"POST","path":"/profile/theme","origin":"http://localhost:3001","contentType":"application/x-www-form-urlencoded","hasCookie":true,"hasAuthorization":false}
```

Do not copy cookie values or session IDs into evidence. The logger records only
cookie presence. DevTools can display responses with browser debugging privileges;
that does not imply attacker page JavaScript can access them.

The page probes only the response frame's origin to demonstrate the same-origin
policy rejection; it never inspects its body or reads cookies or credentials.
A frame load or failed read alone does not prove mutation: use the trusted GET.

## Why this works

Ports 3000, 3001, and 4000 are different origins but the **same site**. Cookies
are not scoped by port. The existing HttpOnly, SameSite=Lax session can accompany
this same-site form POST. This demonstrates cross-origin CSRF, not a claim that
Lax cookies accompany arbitrary cross-site POSTs.

CORS controls JavaScript response access; it does not stop ordinary cross-origin
HTML form submissions. The iframe response is unreadable because of the
same-origin policy. See [MDN's CSRF explanation](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF).

Secure mode requires both a session-bound `X-CSRF-Token` header and the exact
trusted Origin `http://localhost:3000` on mutations. The web client obtains the
existing token from authenticated `GET /session/csrf` before each write and keeps
it out of URLs and browser storage. Login creates a random token after session
regeneration; GET never creates or rotates it. Logout destroys the session/token.
Old sessions from before this change must sign in again.

The global guard protects comment creation/reset, document edits, logout, the
Day 1 counter, and theme changes. Login checks Origin without requiring a token
from a session that does not yet exist. GET remains read-only. The insecure flag
bypasses token and Origin checks only on `POST /profile/theme`; authentication
and input validation always apply. The theme is keyed by authenticated lab user.

CORS permits only the exact trusted web origin to read credentialed responses.
Allowed methods are GET, POST, PATCH, DELETE; allowed headers are Content-Type,
x-lab-user (the Day 1 exercise), and x-csrf-token. Secure responses include
`Vary: Origin` even for rejected origins. The explicit `LAB_INSECURE_CORS=true`
comparison still allows wildcard, non-credentialed reads; it does not bypass CSRF.
The attacker form has neither the custom token header nor the trusted Origin.

## Cleanup

Set the preference back to light from the trusted page. Stop the insecure session
and run `yarn dev` without the flag; sign in again and repeat the secure case.
Restarting the API clears all in-memory preferences and sessions.

## Implementation verification

API tests cover both modes, authentication, missing/null/untrusted origins,
valid form/JSON inputs, invalid input, and per-user isolation. A headless Chrome
check also submitted the actual attacker form and observed `SecurityError` in
both modes, with light retained in secure mode and dark saved in insecure mode.
That check used isolated API instances on loopback ports 4100/4101, redirecting
the form request via the browser test protocol, to preserve the running lab's data.
The manual steps above exercise the standard port-4000 setup.
