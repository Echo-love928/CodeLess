# D03-A platform authentication

The API stores identity in `platform_users` from D02-A and password hashes/roles in
Flyway V2 `auth_credentials`. Only active users can authenticate. Opt-in seed passwords
must be provided as environment variables before startup; they are never returned by
the API. Existing seeded credentials are not overwritten on restart.

Local development: set `CODELESS_DEMO_PASSWORD` and `CODELESS_ADMIN_PASSWORD` to
different values of at least 12 characters, and set `CODELESS_COOKIE_SECURE=false`
only when serving the API over plain HTTP. Use the D02 environment instructions to
supply the PostgreSQL URL, username and password. Production keeps Secure cookies and
requires HTTPS. The cookie is HttpOnly, host-only and SameSite=Lax; session lifetime
is 30 minutes. `GET /api/v0/auth/csrf` starts the session. Send its returned token as
`X-CSRF-Token` with login and every later write. Refresh restores identity through
`GET /api/v0/auth/me`; logout invalidates the session.

`OwnershipGuard` checks the authenticated user against application owner IDs. Task
and version checks join through applications; missing and foreign IDs have the same
404 response. `requireAdmin` checks the database-backed current role. Future CRUD
handlers must call these guards before returning or changing a resource. The D04
application handlers do not yet exist, so no real CRUD authorization is claimed.

The D01 shared OpenAPI still advertises Bearer/JWT, which conflicts with these session
endpoints. The additive contract is in `contracts/auth/README.md`; the common contract
maintainer must apply this difference alongside D03-B before enabling real UI auth.
This task does not alter `contracts/openapi.v0.json`.

Auth tests run against the same pinned PostgreSQL Testcontainers image as D02-A:
`$env:JAVA_HOME='<Java 21 directory>'; corepack pnpm verify:api`. The report is
`services/api/target/surefire-reports/dev.codeless.api.auth.AuthIntegrationTest.txt`.
No model provider is involved. Login limits are kept in memory for 15 minutes and
must move to a shared store before serving multiple API instances.
