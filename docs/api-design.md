# REST API design

Base path `/api/v1`; JSON uses `snake_case`; timestamps are UTC ISO 8601; IDs are opaque UUID strings. OpenAPI is authoritative and generates frontend types. List endpoints use opaque cursor pagination (`data`, `next_cursor`, `has_more`). Mutations accept `Idempotency-Key` where retries could duplicate work.

## Authentication

Browsers receive a short-lived access token and rotating opaque refresh token in `Secure`, `HttpOnly`, `SameSite=Lax` cookies. Refresh hashes only are stored. Token reuse revokes the entire family. State-changing cookie-authenticated requests require an origin check and double-submit CSRF token; login/register are strictly rate-limited. Native clients may later use OAuth 2.1 Authorization Code + PKCE.

| Method/path | Contract | Result |
|---|---|---|
| `POST /auth/register` | `{email,password,display_name,terms_version}` | `201 User`; verification sent (generic response policy prevents enumeration) |
| `POST /auth/login` | `{email,password}` | `200 User` + cookies |
| `POST /auth/refresh` | CSRF + refresh cookie | rotated cookies, `204` |
| `POST /auth/logout` | current/family scope | revoke and clear cookies, `204` |
| `GET /users/me` | authenticated | profile/account summary |
| `PATCH /users/me` | display/locale/timezone fields | updated profile |
| `GET/PATCH /users/me/preferences` | typed career preference schema | preferences |
| `DELETE /users/me` | password/re-auth confirmation | `202` deletion workflow |

## Documents (Phase 1 + Phase 2 extraction)

- `POST /cv-documents/uploads`: `{filename, media_type, byte_size, sha256, label?}` → `201 {document,version,upload:{url,method,headers,expires_at}}`. The API rejects extensions/media types outside PDF/DOCX, unsafe names, duplicate active idempotency keys, and configured size bounds.
- `POST /cv-documents/{document_id}/versions/{version_id}/complete`: `{sha256,byte_size}` → `202 Version(status="quarantined")`; server HEAD-validates object metadata before enqueueing scan.
- `GET /cv-documents?cursor&limit`, `GET /cv-documents/{id}`, `GET /cv-documents/{id}/versions/{version_id}`: owner-scoped metadata and processing status.
- `GET /cv-documents/{id}/versions/{version_id}/extraction`: owner-scoped extraction status and non-sensitive metadata (`ready`, `needs_ocr`, or an explicit failure code); extracted text remains in private object storage.
- `POST /cv-documents/{id}/versions/{version_id}/analyze`: runs the transparent foundation review when extraction is `ready`; returns explicit checks and recommendations, never an ATS prediction or fabricated AI output.
- `POST /cv-documents/{id}/versions`: begin another immutable version.
- `DELETE /cv-documents/{id}`: `202`, marks unavailable and enqueues purge.
- `POST /cv-documents/{id}/versions/{version_id}/download`: creates a brief presigned clean-object URL only when authorization and clean state pass.

## Job discovery (Phase 3 foundation)

- `POST /job-searches`: accepts target roles, locations, work arrangement, experience, and salary constraints; queues a provider-adapter search and returns `202` with a durable search status.
- `GET /job-searches` and `GET /job-searches/{id}`: owner-scoped search history and provider status (`unconfigured`, `available`, `partial`, or `unavailable`).
- `GET /job-searches/{id}/matches`: normalized, deduplicated listings with a 0–100 relevance indicator, matched skills, missing required skills, and formula evidence.
- `POST /saved-jobs`, `GET /saved-jobs`, `DELETE /saved-jobs/{id}`: owner-scoped saved opportunities with idempotent duplicate saves.

The initial adapters support configured Greenhouse public boards and Lever public postings. No provider configuration produces an explicit empty result rather than fixture or fabricated jobs. Listing links remain the source's original URLs.

Later resources follow the same conventions: `/cv-profiles`, `/cv-analyses`, `/job-searches`, `/job-matches`, `/saved-jobs`, `/conversations/{id}/messages`, `/interviews/{id}/responses`.

## Representative contracts

```json
{
  "id": "uuid",
  "document_id": "uuid",
  "version_no": 2,
  "filename": "backend-cv.pdf",
  "media_type": "application/pdf",
  "byte_size": 248920,
  "status": "scanning",
  "failure": null,
  "created_at": "2026-10-24T10:00:00Z",
  "updated_at": "2026-10-24T10:00:08Z"
}
```

```json
{
  "type": "https://api.careerpilot.example/problems/validation-error",
  "title": "Request validation failed",
  "status": 422,
  "detail": "One or more fields are invalid.",
  "instance": "/api/v1/cv-documents/uploads",
  "code": "validation_error",
  "request_id": "01J...",
  "errors": [{"field":"byte_size","code":"too_large","message":"File exceeds 10 MiB."}]
}
```

Errors use RFC 9457 problem details and safe stable codes. `401` means authenticate, `403` authenticated but prohibited, `404` is also used to conceal other users’ resource existence, `409` state/idempotency conflict, `413` too large, `415` unsupported media type, `422` validation, `429` rate limit with `Retry-After`, and `503` unavailable dependency/provider. Stack traces and provider payloads never reach clients.

## Concurrency and compatibility

Mutable resources expose an ETag derived from row version and require `If-Match` for conflicting edits. Additive fields are backward-compatible; breaking changes get a new major API path. Deprecated contracts carry dates. Job/AI endpoints return `503 provider_unconfigured` or provider-specific availability status—never invented fallback results.
