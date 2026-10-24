# Detailed Phase 1 checklist

## Architecture and developer experience

- [x] Modular-monolith boundaries, state machine, ADR log, ownership and future AWS topology documented.
- [x] Monorepo paths for web/API/contracts/docs/infra, environment template, Compose topology, Dockerfiles.
- [x] CI skeleton for backend and frontend; dependency caches and service health checks.
- [x] Generate and pin the pnpm lockfile after dependency installation.
- [ ] Add release SBOM/image signing in Phase 6 pipeline.

## Data and API

- [x] SQLAlchemy Phase 1 models and initial Alembic migration.
- [x] UUID identifiers, UTC timestamps, constraints, indexes, ownership and soft-delete semantics.
- [x] Versioned FastAPI, problem details, request IDs, health/liveness/readiness.
- [x] Auth/profile/preferences schemas and endpoints.
- [x] CV initiate/finalize/list/get/delete contracts and explicit statuses.
- [x] Exercise migration upgrade/downgrade/upgrade against PostgreSQL 16 container.

## Security and privacy

- [x] Argon2 password hashing and password validation.
- [x] JWT access token plus opaque hashed rotating refresh-session design.
- [x] Exact-origin CORS configuration, security headers, safe errors, no secret logging.
- [x] Quarantine and private clean buckets; presigned upload boundary and ClamAV worker contract.
- [x] Extension/media/size/checksum validation and owner scoping.
- [ ] Email verification delivery (requires approved transactional provider).
- [ ] Production secrets/KMS/WAF infrastructure (Phase 6 environment decision).
- [ ] Full data export/purge saga implementation after downstream schemas exist.

## Frontend

- [x] Token-based light/dark theme, typography, focus/reduced-motion rules.
- [x] Responsive marketing, authentication entry, and authenticated dashboard shell.
- [x] Typed API client boundary and honest Phase 1 feature states.
- [ ] Complete component catalog/Storybook as screens expand.
- [ ] Browser/axe E2E after dependency installation.

## Quality and operations

- [x] Unit tests for password/auth token and upload validation contracts.
- [x] Structured logging/request correlation hooks and dependency readiness checks.
- [x] Worker idempotency/state contracts and retry policy.
- [x] Run backend lint/type/tests and frontend lint/type/unit/build checks.
- [ ] Run EICAR, malformed document, upload race, Redis/Postgres interruption integration suite with Compose.
- [ ] Configure error monitoring/OpenTelemetry exporter only after vendor/deployment selection.

The unchecked items are explicit exit work; they are not silently treated as complete.
