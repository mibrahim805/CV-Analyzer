# CareerPilot — AI CV Analyzer & Career Assistant

CareerPilot is a production-oriented SaaS foundation for secure CV ingestion, transparent CV analysis, genuine job discovery, and adaptive interview coaching. The repository currently implements **Phase 1: Foundation** and deliberately exposes interfaces—not fabricated behavior—for later AI and job-provider phases.

## Architecture

- `apps/web`: Next.js, TypeScript, Tailwind CSS, accessible application shell.
- `apps/api`: FastAPI modular monolith, SQLAlchemy 2, Alembic, Celery.
- PostgreSQL: authoritative relational state and audit records.
- Redis: queues, rate-limit counters, short-lived caches (never authoritative records).
- S3-compatible storage (LocalStack locally, S3 in production): private originals, quarantine, and artifacts.
- ClamAV: malware scanning boundary before document processing.

Read the design set in [`docs/`](docs/README.md), especially the [architecture](docs/architecture.md), [schema](docs/database-schema.md), [API contract](docs/api-design.md), and [Phase 1 checklist](docs/phase-1-checklist.md).

## Local development

1. Copy `.env.example` to `.env` and replace all development secrets.
2. Start infrastructure: `docker compose up -d postgres redis object-storage clamav`.
3. Backend: `cd apps/api`, install `python -m pip install -e '.[dev]'`, run `alembic upgrade head`, then `uvicorn app.main:app --reload`.
4. Frontend: `corepack pnpm install && corepack pnpm --filter web dev`.
5. Worker: from `apps/api`, run `celery -A app.workers.celery_app worker -l INFO`.

Or run the full stack with `docker compose up --build` after configuring `.env`.

## Verification

- Backend: `pytest`, `ruff check .`, `mypy app`
- Frontend: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`
- Compose: `docker compose config`

The application never presents test fixtures as live vacancies or real AI results. External job and model providers are intentionally disabled until configured in later phases.
