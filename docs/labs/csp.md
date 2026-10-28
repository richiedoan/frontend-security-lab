# Day 3: local Content Security Policy learning setup

`apps/web` uses Next.js Proxy to emit one CSP response header on document routes.
`CSP_MODE` selects the phase; unset disables CSP for comparison. Invalid values
fail rather than silently disabling the requested policy.

| CSP_MODE | Response header | Result |
| --- | --- | --- |
| unset | neither | Baseline, no CSP restrictions |
| report-only | Content-Security-Policy-Report-Only | Violations reported, resources allowed |
| enforce | Content-Security-Policy | Violating resources blocked |

## Development policy

Stop the current dev session, then run either:

```sh
CSP_MODE=report-only yarn dev
# After stopping that session:
CSP_MODE=enforce yarn dev
```

The development policy is:

```text
default-src 'self'; object-src 'none'; base-uri 'self';
frame-ancestors 'none'; form-action 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline'; img-src 'self';
connect-src 'self' http://localhost:4000 ws://localhost:3000 ws://127.0.0.1:3000
```

The inline script/style exceptions accommodate Next development rendering and
style injection; eval supports debugging machinery. WebSockets permit local HMR.
These exceptions deliberately make this a development learning policy, not strong
production XSS containment. Do not copy them into production. CSP enforcement may
change the intentional XSS demo behavior (its data image violates img-src); do
not interpret a CSP-blocked image as proof that HTML injection is safe. Leave
CSP_MODE unset when reproducing the baseline XSS exercise.

## Stricter production target

Outside development, both CSP modes use:

```text
default-src 'self'; object-src 'none'; base-uri 'self';
frame-ancestors 'none'; form-action 'self';
script-src 'self' 'nonce-<fresh-per-response-value>';
style-src 'self' 'nonce-<fresh-per-response-value>';
img-src 'self'; connect-src 'self' http://localhost:4000
```

There is no unsafe-inline, unsafe-eval, or development WebSocket allowance.
Proxy supplies the policy to Next's internal request headers so its generated
scripts/styles receive the matching nonce. That internal header does not turn
a report-only response into enforcement. Root rendering is dynamic, and CSP
responses use no-store to avoid reusing HTML with a nonce from a different response.
Never use a fixed nonce. Any added inline scripts/styles need explicit nonce support;
inline event handlers and style attributes are not authorized by an element nonce.
See [Next.js nonce guidance](https://nextjs.org/docs/app/guides/content-security-policy).

This target is for a **local production build**, retaining the requested loopback
API. For an actual HTTPS deployment, replace the HTTP API origin with its exact
HTTPS origin and review the application's resource requirements. Do not broaden
sources or add unsafe directives just to silence violations.

To test a local production build (stop the dev server first):

```sh
CSP_MODE=report-only yarn workspace @frontend-security-lab/web build
CSP_MODE=report-only yarn workspace @frontend-security-lab/web start
# After inspecting reports and stopping the server:
CSP_MODE=enforce yarn workspace @frontend-security-lab/web start
```

## Harmless violation demo and evidence

1. Open `http://localhost:3000/labs/csp` from Day 3 and open DevTools.
2. In Network, reload and select the **document** request. Inspect Response
   Headers: the selected header should contain all the directives above, with
   no second enforcing/report-only header added by this app.
3. Click **Try harmless image**. The image is a static data-URL SVG green square;
   it contains no script and causes no external request.
4. In report-only mode the square loads; the page's policy event says `report`
   and Console reports the img-src violation.
5. In enforce mode the image fails to load; the event says `enforce` and Console
   shows it was blocked by img-src. Without CSP_MODE it loads without a violation.
6. Record the mode, document header, image outcome, and Console message. Restart
   after changing the environment and reload the full document: an existing
   document does not acquire a new policy through client navigation alone.

No reporting collector or external reporting endpoint is configured. This exercise
uses DevTools and the local `securitypolicyviolation` event, not persisted reports.
Report-only does not block attacks; see [MDN's report-only header reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy-Report-Only).
CSP is an additional browser boundary, not a replacement for React text rendering,
CSRF validation, or API authorization. form-action applies to forms in the web
page; it does not protect the API from forms hosted on the attacker origin.

Header tests exercise Proxy mode selection, nonce freshness, request/header
consistency, required directives, and separation of development exceptions.

Verification: an isolated production build (`next build --webpack`) passed.
Headless Chrome checks confirmed matching HTML/header nonces, working page
controls, a loaded square plus a report in report-only mode, and a blocked square
in enforce mode. These checks used loopback ports 3100/3102 without changing the
running lab server.
