# D03-A authentication contract (candidate)

This is the additive contract for D03-B integration. The D01 `openapi.v0.json` still
declares Bearer authentication. Its maintainer must replace that shared declaration
with the session scheme before the authenticated application APIs are enabled.

All paths are under `/api/v0`. JSON requests use `Content-Type: application/json`.

| Request | Result |
| --- | --- |
| `GET /auth/csrf` | `200 {"token":"<64 hex chars>"}`; creates a host-only session cookie. |
| `POST /auth/login` with `{ "email": string, "password": string }` and `X-CSRF-Token` | `200 {"id":UUID,"email":string,"displayName":string,"role":"USER"|"ADMIN"}`; rotates the session ID. |
| `GET /auth/me` | Same user response; `401` without an active session. |
| `POST /auth/logout` with `X-CSRF-Token` | `204`; invalidates the session. |
| `GET /admin/session` | Same user response for admins only; ordinary users get `403`. This is a minimal role-check endpoint. |

Every unsafe `/api/v0/` request requires `X-CSRF-Token` matching the token associated
with the session, including login and logout. The token is obtained from `/auth/csrf`,
not from JavaScript reading the session cookie. `JSESSIONID` is HttpOnly, Secure by
default, SameSite=Lax, and has no Domain attribute. Local plain-HTTP development
may set `CODELESS_COOKIE_SECURE=false` in the API process only.

Errors use the existing `ApiError` shape. Invalid credentials return `401
INVALID_CREDENTIALS`; unauthenticated access returns `401 UNAUTHENTICATED`; a
non-admin receives `403 FORBIDDEN`; missing/invalid CSRF returns `403 CSRF_INVALID`;
five failed logins for one normalized email within 15 minutes return `429
LOGIN_RATE_LIMITED`. Unknown or foreign-owned application, task and version IDs both
return `404 NOT_FOUND`. Clients should retry a login after correcting credentials;
they should fetch a new CSRF token after logout or a lost session.

Demo account initialization is opt-in and requires distinct secrets of at least 12
characters in `CODELESS_DEMO_PASSWORD` and `CODELESS_ADMIN_PASSWORD`. It creates
`demo@codeless.local` (USER) and `admin@codeless.local` (ADMIN) once, storing BCrypt
hashes in `auth_credentials`. No password is committed. The current rate limiter is
process-local; a multi-instance deployment needs a shared limiter before public use.
