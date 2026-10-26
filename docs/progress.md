# Implementation progress

Last updated: 2026-10-26

| Milestone | Status | Evidence / next step |
|---|---|---|
| A–K design artifacts | Complete | Documents linked from `docs/README.md` |
| Monorepo/tooling foundation | Complete | Compose, CI, Python/TypeScript configs |
| Database baseline | Complete | SQLAlchemy models + Alembic initial migration |
| Authentication contracts | Complete | Registration/login/refresh/logout/current-user endpoints and tests |
| User profile/preferences | Complete foundation | Read/update profile contract and model |
| Private CV upload lifecycle | Complete foundation | Initiate/complete/list/delete endpoints; quarantine state machine |
| Malware scan worker | Complete foundation | ClamAV scan task and storage promotion contract |
| Frontend design system/shell | Complete foundation | Landing, auth pages, responsive dashboard |
| CI and docs | Complete | GitHub Actions and developer documentation |
| Runtime service verification | Complete | PostgreSQL/Redis/S3Mock/ClamAV healthy; migration round-trip; API readiness 200 |
| Auth smoke journey | Complete | Disposable registration returned 201 and cookie-authenticated `/users/me` returned 200; fixture removed |
| Phase 2 deterministic extraction and foundation review | In progress | PDF/DOCX embedded-text extraction, OCR-required state, durable artifact metadata, extraction status, and transparent CV checks/recommendations are implemented; structured parsing and model-backed analysis are next. |
| Phase 3 job intelligence foundation | In progress | Greenhouse/Lever provider adapters, normalized listings, durable searches, explainable CV matching, saved jobs, migration `20261026_0003`, and `/dashboard/jobs` are implemented. Configure an approved source before displaying live vacancies. |
| AI-understood CV profile dependency | In progress | Versioned Pydantic professional profiles, evidence verification, profile review/editing, background model task, profile-bound job searches, profile revision tracking, and migration `20261026_0006` are implemented. Configure the AI provider before generating profiles. |
| Phase 4 interview coach foundation | In progress | Persistent adaptive text interviews, mode/difficulty controls, contextual follow-ups, skip/end flows, evidence-based rubric feedback, migration `20261026_0004`, and `/dashboard/interviews` are implemented. Model-backed orchestration and voice remain later milestones. |

“Complete foundation” means the Phase 1 contract and safe boundary exist. Phase 2 now adds deterministic extraction; OCR, structured parsing, and model-backed analysis remain separate milestones. Phase 3 adds the provider and matching boundary; live results still require an approved source configuration. Phase 4 adds the persistent deterministic coaching boundary; model-backed turns and voice remain separate milestones.
