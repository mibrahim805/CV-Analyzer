# CareerPilot — AI CV Analyzer & Career Assistant

CareerPilot is a production-oriented SaaS foundation for secure CV ingestion, transparent CV analysis, genuine job discovery, and adaptive interview coaching. **Phase 1** is complete, **Phase 2** provides deterministic PDF/DOCX extraction and foundation review, **Phase 3 foundation** provides provider-backed job search contracts, explainable matching, and saved jobs, and **Phase 4 foundation** provides persistent adaptive text interview coaching with transparent rubrics. Model-backed generation and voice remain provider-gated later milestones.

## Architecture

- `apps/web`: Next.js, TypeScript, Tailwind CSS, accessible application shell.
- `apps/api`: FastAPI modular monolith, SQLAlchemy 2, Alembic, Celery.
- PostgreSQL: authoritative relational state and audit records.
- Redis: queues, rate-limit counters, short-lived caches (never authoritative records).
- S3-compatible storage (LocalStack locally, S3 in production): private originals, quarantine, and artifacts.
- ClamAV: malware scanning boundary before document processing.
- CV extraction: deterministic embedded-text parsing with `pypdf` and `python-docx`; scanned documents are marked `needs_ocr` rather than guessed.
- Foundation review: an explicit, non-predictive analysis endpoint checks detectable contact details, sections, quantified evidence, and bullet structure before any model-backed assistant is enabled.
- Job intelligence: configurable Greenhouse and Lever adapters normalize permitted listings, persist verification timestamps, and rank matches with the versioned `job_match_v1` formula. Empty provider configuration is reported explicitly.
- Interview coach: persistent text sessions support six interview modes, difficulty controls, contextual follow-ups, skips/end, transcript history, and bounded evidence-based feedback without pretending to predict hiring outcomes.

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

The application never presents test fixtures as live vacancies or real AI results. Configure `GREENHOUSE_BOARD_TOKENS` or `LEVER_SITE_NAMES` with approved source identifiers before live opportunities appear. Interview coaching currently uses the deterministic foundation; model-backed analysis, model-generated interview turns, and voice remain explicitly disabled until configured and evaluated.
