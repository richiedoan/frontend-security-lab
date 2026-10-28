# Day 2 IDOR reproduction

This is an explicitly insecure, local-only comparison. `LAB_INSECURE_AUTHZ=true` weakens only authenticated document reads. Document edits and admin audit authorization remain enforced.

## Prerequisites

Run all commands from the repository root. Keep the lab bound to localhost and do not use real credentials or data.

## Secure default

Start the lab without the insecure flag:

```sh
yarn dev
```

In another terminal, create a temporary cookie jar, log in as Bob, and request Alice's private document:

```sh
LAB_COOKIE_JAR=$(mktemp)
curl -sS -c "$LAB_COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d '{"username":"bob"}' \
  http://localhost:4000/session/login > /dev/null
curl -i -b "$LAB_COOKIE_JAR" \
  http://localhost:4000/documents/alice-private
rm -f "$LAB_COOKIE_JAR"
```

Expected result: HTTP `403 Forbidden`.

Stop the running lab with `Ctrl+C` before changing modes.

## LOCAL LAB ONLY insecure comparison

Start all apps with the explicit insecure authorization flag:

```sh
LAB_INSECURE_AUTHZ=true yarn dev
```

Repeat the request with a new temporary cookie jar:

```sh
LAB_COOKIE_JAR=$(mktemp)
curl -sS -c "$LAB_COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d '{"username":"bob"}' \
  http://localhost:4000/session/login > /dev/null
curl -i -b "$LAB_COOKIE_JAR" \
  http://localhost:4000/documents/alice-private
rm -f "$LAB_COOKIE_JAR"
```

Expected result: HTTP `200 OK` with Alice's document. The API startup log must include the `LOCAL LAB ONLY` insecure authorization warning.

This demonstrates an IDOR: Bob changes a resource identifier and the insecure read path checks only that a session exists. It does not grant Bob edit access and does not grant audit access.

## Automated comparison

```sh
yarn workspace @frontend-security-lab/api test authorization.e2e.spec.ts
```

The demonstration test asserts the same Bob/Alice request returns 403 in secure mode and 200 only in insecure mode. It also verifies Bob still receives 403 for PATCH and admin audit in insecure mode.

## Mitigation

- Keep secure mode as the default; never set `LAB_INSECURE_AUTHZ=true` outside this local lab.
- Resolve identity from the server-side session, not from request parameters.
- Load the requested document and enforce ownership/editor/viewer policy in the service for every access.
- Deny authenticated users with 403 when policy fails; do not rely on hidden UI controls.
- Retain authorization matrix tests so resource-ID manipulation cannot silently bypass policy.
