# Day 1 summary: browser request boundaries

This summary records repository behavior verified by automated tests and the existing notes in `request-baseline.md`. Browser observations remain explicitly marked as pending until screenshots are added.

## Origin table

Normal mode means `LAB_INSECURE_CORS` is absent or is not exactly `true`.

| Request source | Normal-mode server response | JavaScript read expectation | Evidence |
| --- | --- | --- | --- |
| `Origin: http://localhost:3000` | `Access-Control-Allow-Origin: http://localhost:3000`, no credentials header, and `Vary: Origin` | Allowed by the returned CORS headers | E2E test |
| `Origin: http://localhost:3001` | Application returns HTTP 200 for `GET /public`, but no `Access-Control-Allow-Origin` | Browser JavaScript should not receive the response data | Server behavior covered by E2E test; browser observation pending |
| No `Origin` header | `GET /public` returns HTTP 200 with `requestOrigin: null` and no CORS allow-origin header | CORS is not involved | E2E test and existing curl note |
| Any origin with `LAB_INSECURE_CORS=true` | `Access-Control-Allow-Origin: *`, with no credentials header | Non-credentialed JavaScript reads are allowed | E2E test; browser observation pending |

Normal mode exposes only `GET,POST` and the request headers `Content-Type,x-lab-user` in preflight responses. It does not enable credentialed CORS.

## Simple requests and preflight

### Verified by tests or existing notes

- A normal-mode `GET /public` carrying the allowed web origin receives the origin-specific allow header and `Vary: Origin`.
- The same GET carrying the attacker origin still reaches the API and receives HTTP 200 at the server-test level, but the response omits the allow-origin header.
- An allowed `OPTIONS /transfer` preflight requesting `POST` with `content-type,x-lab-user` receives HTTP 204 and advertises only `GET,POST` plus `Content-Type,x-lab-user`.
- The existing curl notes record that requests without `Origin` receive HTTP 200 from `/public`, HTTP 401 from `/private` without `x-lab-user`, and HTTP 200 from `/private` with that header.

### Browser experiments still awaiting evidence

- `GET /public` from the web UI is structurally a simple cross-origin request.
- `GET /private` with `x-lab-user` requires preflight because `x-lab-user` is not a CORS-safelisted request header.
- JSON `POST /transfer` requires preflight because `application/json` is not a CORS-safelisted `Content-Type`.
- The attacker page contains a plain HTML form using the safelisted `application/x-www-form-urlencoded` encoding and a hidden iframe target. The repository currently has no automated browser test or saved note confirming the observed Network behavior.

## Request sent versus response readable

Request delivery and JavaScript response access are separate questions:

1. The denied-origin E2E test proves the API handled `GET /public` and returned HTTP 200 while omitting `Access-Control-Allow-Origin`.
2. Based on the returned headers, browser JavaScript from port 3001 is expected to be denied access to the response. A DevTools screenshot is still needed to record that browser observation.
3. A native HTML form can initiate a request without giving the submitting page permission to read the cross-origin response. The attacker UI demonstrates this setup, but its actual browser request remains pending evidence.
4. CORS does not authenticate a caller and does not prevent every request from being sent. It controls whether browser JavaScript may read a cross-origin response.

## Commands and tests run during this review

Repository inspection:

```sh
sed -n '1,280p' docs/evidence/day-01/request-baseline.md
sed -n '1,260p' apps/api/src/cors.ts
sed -n '1,280p' apps/api/src/app.controller.ts
sed -n '1,360p' apps/api/test/app.e2e.spec.ts
sed -n '1,280p' apps/web/app/page.tsx
sed -n '1,280p' apps/attacker/app/page.tsx
sed -n '1,220p' apps/api/src/request-metadata-logger.middleware.ts
```

Validation commands and their results are recorded after the review edits:

```sh
yarn workspace @frontend-security-lab/api test
yarn workspace @frontend-security-lab/web lint
git diff --check
```

- API test result: passed — 2 suites and 10 tests.
- Web lint result: passed with no errors or warnings.
- Whitespace check: passed.

The curl commands shown in `request-baseline.md` are existing recorded evidence; they were not rerun during this review.

## DevTools screenshot placeholders

### Screenshot 1 — allowed web origin

<!-- Add screenshot: port 3000 GET /public, showing Request Origin, HTTP status, Access-Control-Allow-Origin, and Vary. -->

### Screenshot 2 — denied attacker JavaScript read

<!-- Add screenshot: port 3001 GET /public, showing the UI error and the corresponding Network request/response headers. -->

### Screenshot 3 — preflight

<!-- Add screenshot: OPTIONS request produced by x-lab-user or application/json, including Access-Control-Request-* and Access-Control-Allow-* headers. -->

### Screenshot 4 — form request without response access

<!-- Add screenshot: attacker form POST /transfer in Network plus API metadata log, without claiming the parent page read the response. -->

### Screenshot 5 — explicit insecure mode

<!-- Add screenshot: LAB_INSECURE_CORS=true request from port 3001 showing Access-Control-Allow-Origin: * and no Access-Control-Allow-Credentials. -->

## Remaining misconceptions to check

- [ ] `Origin` identifies a page origin, not a user. It is not authentication or authorization.
- [ ] CORS is enforced by browsers; curl and server-to-server clients are not blocked by it.
- [ ] A missing allow-origin header can prevent JavaScript from reading a response even when the API received the request and returned HTTP 200.
- [ ] A preflight is a separate permission check and may prevent the intended request from being sent.
- [ ] A simple request can be sent without preflight; that does not imply the response is readable.
- [ ] `LAB_INSECURE_CORS=false` selects the normal allowlist. Only the exact string `true` enables wildcard mode.
- [ ] Wildcard non-credentialed CORS does not establish user identity and must remain local-only.
