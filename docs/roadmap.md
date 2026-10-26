# Roadmap and measurable acceptance criteria

## Phase 1 — Foundation

Deliver repository/tooling, Compose services, migrations, secure auth/profile/preferences, private upload/quarantine/scan lifecycle, application shell, CI, tests, docs, health/readiness, logging hooks.

Acceptance: clean clone follows documented startup; migrations apply/reverse on an empty DB; auth/session rotation and tenant-isolation tests pass; PDF/DOCX upload contract rejects size/type/checksum abuse; unscanned files cannot be downloaded; malware fixture is rejected; duplicate completion is idempotent; responsive shell passes keyboard/axe smoke checks; CI blocks lint/type/test failures; secrets scan finds no credentials.

## Phase 2 — CV intelligence

Deterministic PDF/DOCX extraction, isolated OCR fallback, normalized facts with provenance/confidence, correction revisions, versioned transparent analysis and report history.

Acceptance: curated malformed/encrypted/empty/scanned fixtures produce safe explicit states; benchmark extraction metrics meet field-specific thresholds; every fact links to evidence or user edit; hallucinated-fact regression is zero on gate set; correction/history/export/deletion E2E passes.

## Phase 3 — Job intelligence

At least one legally approved real provider, adapter framework, normalized/deduplicated/fresh listings, preferences, explainable matching, saved jobs.

Acceptance: source contract/legal checklist approved; no fixture appears in production discovery; dedupe/freshness thresholds met; every result has source/link/verified time; provider outage is honest; offline relevance and explanation-faithfulness gates pass.

### Phase 3 foundation evidence (2026-10-26)

- [x] Adapter boundary and explicit provider-unconfigured state.
- [x] Greenhouse public-board and Lever public-posting adapters with timeout/error handling.
- [x] PostgreSQL migration for sources, listings, searches, matches, and saved jobs.
- [x] Owner-scoped search/match/save REST contracts and responsive `/dashboard/jobs` UI.
- [x] Versioned `job_match_v1` relevance evidence with required-skill gaps and source verification timestamps.
- [ ] Production provider terms/coverage approval and live source identifiers.
- [ ] Offline relevance/freshness/deduplication benchmark with labeled provider data.

## Phase 4 — Interview coach

Persistent adaptive text interviews, modes, follow-ups, skips/end, evidence-based rubrics, feedback/history.

Acceptance: one question per turn; follow-ups demonstrably use prior answer; repetition/relevance suite passes; feedback cites actual responses and rubric; interruption/resume/idempotency/isolation E2E passes.

### Phase 4 foundation evidence (2026-10-26)

- [x] Persistent interview sessions, questions, responses, evaluations, and lifecycle states in migration `20261026_0004`.
- [x] General, technical, behavioral, project, job-specific, and HR modes with easy/medium/hard difficulty contracts.
- [x] One-question turn controller with contextual short-answer and technical trade-off follow-ups, skip, end, and non-repetition guards.
- [x] Transparent technical accuracy, clarity, depth, and role-relevance rubric with response evidence and coaching examples.
- [x] Owner-scoped REST endpoints and responsive `/dashboard/interviews` experience with session history.
- [ ] Resume/idempotency/isolation end-to-end coverage and model-provider-backed adaptive generation.
- [ ] Voice interview transport and production model/prompt evaluation gates.

## Phase 5 — Unified assistant

Assistant orchestration over allow-listed typed tools and approved user context.

Acceptance: tool authorization/argument schemas cover every call; cross-tenant and prompt-injection red team suite passes; destructive actions require confirmation; unavailable tools do not yield fabricated answers; costs/latency/usage are observable.

## Phase 6 — Production launch

AWS deployment, SLOs/alerts, backup/restore, security/performance testing, accessibility audit, cost controls, runbooks, legal/retention operations.

Acceptance: staging E2E and load target pass; independent penetration findings resolved by severity policy; restore and deletion drills pass; dashboards/alerts/on-call runbooks validated; DPIA/terms/provider agreements complete; release has SBOM, rollback, and signed artifact provenance.

Progression requires recorded evidence for the current phase. Later-phase interfaces may exist earlier, but simulated business results must remain visibly disabled.
