# Session configuration

The Day 2 lab uses `express-session` with its default in-memory store. This is intentionally local-only and non-production: it loses sessions on restart, cannot coordinate multiple API instances, and is not designed for production load.

Local HTTP development uses a cookie named `session` with:

- `HttpOnly`
- `SameSite=Lax`
- `Secure=false`
- `Path=/`
- no `Domain`

The production target is a host-only cookie named `__Host-session` with `Secure`, `HttpOnly`, `Path=/`, `SameSite=Lax`, and no `Domain`. A production deployment also requires a production-grade shared session store and externally managed secret; those are deliberately not implemented in this lab step.
