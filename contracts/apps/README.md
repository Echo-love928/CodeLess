# D04-A application API handoff

This task-local contract extends the D01 v0 application resource. The shared
`contracts/openapi.v0.json` and `contracts/schemas/v0/application.schema.json`
are maintained separately; their owner must fold in the additive list, rename,
`status`, and `baseVersionId` fields before these endpoints are advertised as
the complete public v0 OpenAPI contract. D03-A session cookies and CSRF apply.

## Endpoints

| Method and path | Input | Success |
| --- | --- | --- |
| `POST /api/v0/applications` | `{"name":"My app","dataMode":"MOCK"}`; optional `description` (up to 1000 characters), optional `template:"VUE"` | 201, application view |
| `GET /api/v0/applications?page=0&size=20` | Zero-based page; size 1–100 | 200, `{items, page, size, total}` |
| `GET /api/v0/applications/{applicationId}` | UUID path | 200, application view |
| `PATCH /api/v0/applications/{applicationId}` | `{"name":"New name"}` | 200, application view |
| `GET /api/v0/versions/{versionId}` | UUID path | 200, existing v0 version resource |

The application view uses the D01 application fields (`id`, `name`, optional
`description`, `template`, `dataMode`, optional `latestReadyVersionId`,
`createdAt`, `updatedAt`) and adds `status` (`ACTIVE` or `ARCHIVED`) and
`baseVersionId` (UUID of version 1). The API omits nullable fields when unset.
`status` is **application metadata**, not a generation or verification result.
An initial response example is:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "name": "My app",
  "template": "VUE",
  "dataMode": "MOCK",
  "status": "ACTIVE",
  "baseVersionId": "55555555-5555-4555-8555-555555555555",
  "createdAt": "2026-09-29T00:00:00Z",
  "updatedAt": "2026-09-29T00:00:00Z"
}
```

Creation atomically inserts the application and version 1 (`DRAFT`). Its
`sourceDigest` is SHA-256 of empty bytes: an explicit **placeholder**, with no
generated source or build. It cannot be published or treated as READY.
`baseVersionId` is reserved for a later generation request to name the draft
base; D04-A does not implement that request or add a database column. Later
generation work must validate that the supplied version belongs to the
application and that the source exists before using it.

The owner comes solely from the authenticated session. Requests with `ownerId`,
unknown fields, unsupported `template`/`framework`, empty or whitespace-only
names, names over 120 characters, or invalid `dataMode` return 400 with the
existing `ApiError` shape. Anonymous access returns 401; writes without CSRF
return 403. A foreign or absent application/version returns the same 404.
Lists include only the current owner's rows and order by `created_at DESC,
id DESC` for stable ties. `total` counts that owner's rows before pagination.
