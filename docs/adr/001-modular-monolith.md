# ADR-001: Modular monolith plus background worker

Status: accepted — 2026-10-24

Use one FastAPI deployable with domain modules and shared PostgreSQL, plus separately scalable Celery workers. This minimizes distributed failure modes while preserving service boundaries. Modules own tables/services and communicate through typed interfaces. Extract services only after measured scaling, isolation, or compliance pressure.
