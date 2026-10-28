# Frontend Security Lab

A local-only educational lab for learning frontend security concepts safely.

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- Yarn Classic 1.x

## Getting started

```sh
yarn install
yarn dev
```

Services: web at http://localhost:3000, second-app login at http://localhost:3001/second-app,
harmless local attacker simulation at http://localhost:3001/attacker, and API at http://localhost:4000.

The application uses local in-memory sessions and data; no database or containers
are required to run it. Optional local Keycloak and Postgres infrastructure is
available under [`infra/`](infra/README.md), with setup, lifecycle, and realm
import/export commands. [Day 5 browser login](docs/labs/keycloak-oidc.md) connects
the web app to Keycloak; the earlier cookie and token labs keep their existing API sessions.
The API's separate [`/oidc/*` resource server](apps/api/src/oidc/README.md) verifies
Keycloak access tokens and enforces scope, role, and subject-based ownership.
[Day 6 OIDC inspection](docs/labs/oidc-inspection.md) displays selected claims on
the login page and explains each token's consumer and validation requirements.
The [two-app SSO walkthrough](docs/labs/keycloak-sso.md) traces separate client
logins through one Keycloak session without sharing application tokens.
The [local BFF critical path](docs/labs/bff.md) keeps local lab credentials
server-side, coordinates refresh, and protects document mutations with CSRF and
exact Origin checks.

Sign in as a lab user to load and post comments in the web app. `GET /comments`
returns `{ comments: [{ id, authorId, text }] }`; `POST /comments` accepts
`{ text }` and returns the created comment. Both routes require a session cookie.
Comments are shared among authenticated users and reset when the API restarts.
Text must be a string containing a non-whitespace character, up to 1,000 characters.
HTML-like input is preserved as data and rendered as escaped React text.

An isolated, development-only demo is available at
http://localhost:3000/labs/xss/insecure. It provides two independent stored XSS demos: one sets an execution marker,
and the other reads only a fake `xssLabMarker` localStorage key. Each has separate cleanup. See the [walkthrough and explanation](docs/labs/stored-xss.md).
The normal comments page continues to render all comments as text.

## Commands

```sh
yarn dev
yarn lint
yarn test
yarn build
yarn typecheck
```

## Structure

`apps/` contains the three applications. `docs/` contains daily evidence, ADRs, diagrams, and capstone material.

The local CSRF theme demo is available at `http://localhost:3001/labs/csrf`.
Use Day 3 on the trusted web page to inspect/reset the saved theme. Secure mode
requires a session-bound CSRF token and the trusted Origin by default; `LAB_INSECURE_CSRF=true yarn dev` explicitly
bypasses those checks for `POST /profile/theme` only. See the
[CSRF evidence walkthrough](docs/evidence/day-03/csrf-theme.md).

Authenticated writes use `X-CSRF-Token`, obtained from `GET /session/csrf` after
login, plus `Origin: http://localhost:3000`. The web UI handles this automatically.
Login requires the trusted Origin and rotates the session and token. Re-login
after updating an already-running lab. Day 1's counter POST now also requires
an authenticated session and CSRF protection; its plain attacker form is rejected.
No rich-text rendering or sanitizer is added: untrusted comments remain React text.

Day 3 also includes `/labs/csp`: run `CSP_MODE=report-only yarn dev`, then
`CSP_MODE=enforce yarn dev` to compare reporting and blocking a harmless data-URL
image. See the [CSP walkthrough and separate production target](docs/labs/csp.md).
