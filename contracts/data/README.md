# Data contract v1

Migration owner: D02-A. `services/api/src/main/resources/db/migration/V1__platform_data.sql`
is the first and only migration in this task. Later changes require a new Flyway version;
never edit a migration already applied to a shared database.

| HTTP resource (v0) | PostgreSQL table | Internal fields beyond JSON |
| --- | --- | --- |
| authenticated user | `platform_users` | normalized unique email, status, row version |
| application | `applications` | `owner_id`, status, row version |
| task | `generation_tasks` | event sequence, row version |
| event | `task_events` | `(task_id, sequence)` unique |
| version | `application_versions` | row version, immutable application/number/digest |
| build | `builds` | row version |
| publication/deployment | `publications` | row version, update time |
| model call | `model_calls` | provider/model, token usage, error code, row version |

All IDs are UUID and all stored times are PostgreSQL `timestamptz` in UTC when serialized.
Rows have database generated timestamps. `row_version` starts at zero and is used for
optimistic writes; task writes also lock their row to allocate an event sequence.
Task creation commits PLAN and its first event in one transaction. Later status changes
and events also commit together. A failed event insert
rolls back the status, sequence, and row version. `READY` additionally needs a successful
build attached to a verified version of the same application.

Ownership lives on `applications.owner_id`. Repository owner filtered reads are the
minimum access path for future authenticated handlers. Publication inserts are guarded
by the database: the requester must own the application and the version must be verified.
This guard does not replace HTTP authentication. `latest_ready_version_id` can only point
to a verified version of the same application. A failed build or repair must leave it
unchanged.

The v0 JSON shapes remain unchanged. In particular, user identity and model calls are
internal records; callers cannot set ownership, tool outcomes, or token counts through
the public v0 resource schemas.
