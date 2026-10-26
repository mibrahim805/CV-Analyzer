# PostgreSQL schema

All mutable tables have `created_at`/`updated_at` (`timestamptz`, UTC). Primary keys are UUIDv7/UUID. User-owned rows carry a non-null `user_id`; queries must scope it even when reached through another table. Email uniqueness uses normalized lowercase values. Money uses integer minor units plus ISO currency.

## Identity, preferences, documents

| Entity | Important fields / constraints | Indexes and deletion |
|---|---|---|
| `users` | email, password_hash, status, email_verified_at, last_login_at; unique normalized email | status; soft-delete then scheduled erasure |
| `auth_sessions` | user_id, refresh_token_hash unique, family_id, expires_at, revoked_at, IP/UA hashes | `(user_id, revoked_at)`, expires_at; cascade |
| `user_profiles` | user_id unique, display_name, headline, country/locale/timezone | cascade |
| `career_preferences` | user_id unique, target_roles[], locations[], arrangements[], levels[], salary_min/max/currency; min≤max | GIN target roles; cascade |
| `cv_documents` | user_id, label, active_version_id, deleted_at | `(user_id, created_at desc)`; restrict active version then purge |
| `cv_versions` | document_id, version_no unique per document, original_name, media_type, byte_size, sha256, object_key, status, failure_code | `(document_id, version_no)`, `(status, updated_at)`; object deletion workflow |
| `cv_processing_jobs` | version_id, kind, processor_version, status, attempt, idempotency_key unique, timings/error_code | claim index `(status, available_at)`; cascade |

## Structured CV and analysis

| Entity | Important fields / constraints |
|---|---|
| `cv_profiles` | version_id, revision, is_current, summary, contact JSON (encrypted fields where needed); unique current revision |
| `cv_profile_revisions` | profile_id, editor(user/system), patch JSON, reason; immutable |
| `work_experiences` | profile_id, employer, title, location, start/end, current, description, source spans/confidence; valid dates |
| `education_records` | profile_id, institution, credential, field, dates, provenance/confidence |
| `skills` | canonical_name unique, category |
| `cv_profile_skills` | profile_id, skill_id, evidence, proficiency nullable, provenance; unique pair |
| `projects`, `certifications`, `languages`, `professional_links` | profile_id, normalized fields, provenance/confidence; ordering |
| `cv_analyses` | profile_id, target_role, rubric_version, prompt_version, status, completed_at |
| `cv_recommendations` | analysis_id, criterion, severity, explanation, evidence refs, suggestion, generated=true; ordering |

Index child tables by `(profile_id, display_order)` and dates. Confidence is constrained to 0..1 and never replaces provenance.

## Jobs

| Entity | Important fields / constraints/indexes |
|---|---|
| `job_sources` | provider key unique, terms/version, enabled, health state |
| `job_listings` | source_id, external_id, canonical_url, title/company/location/arrangement, description, salary, published/expires/last_verified, content_hash, status; unique `(source_id, external_id)`, URL/content indexes, FTS/GiST as justified |
| `job_skills` | listing_id, skill_id, required, source evidence; unique pair/type |
| `job_search_queries` | user_id, normalized filters, provider cursor/state, requested/completed timestamps; `(user_id, created_at desc)` |
| `job_matches` | user_id, listing_id, profile_id, model/rubric version, relevance value 0..100, evidence JSON, gaps JSON, computed_at; unique current tuple; listing/status and user/rank indexes |
| `saved_jobs` | user_id, listing_id, note, saved_at; unique pair; cascade user, restrict listing |

Listings are shared provider facts. Matches and saves are tenant-owned. Expired listings remain for historical explanation but are excluded from discovery.

## Conversations, interviews, AI governance

| Entity | Important fields / constraints/indexes |
|---|---|
| `chat_conversations` | user_id, title, status; `(user_id, updated_at desc)` |
| `chat_messages` | conversation_id, role, content_encrypted/reference, sequence unique, safety metadata |
| `tool_executions` | message_id, tool_name/version, validated args/result references, status, latency, authorization subject; no secrets |
| `interview_sessions` | user_id, `cv_version_id`/listing_id nullable snapshots, mode/difficulty/status, max/current sequence, minimized context; `(user_id, created_at desc)` |
| `interview_questions` | session_id, sequence unique, prompt/topic/intent, source evidence, asked/answered timestamps |
| `interview_responses` | question_id unique, answer text, skipped, submitted_at |
| `interview_evaluations` | session/question nullable, rubric version, bounded dimensions, strengths/improvements/evidence; unique `(session_id, question_id)` scope |
| `ai_usage_records` | user_id, operation, provider/model, input/output tokens, cost micros/currency, request correlation; time/user indexes |
| `audit_events` | actor_user_id nullable, subject_user_id nullable, action, target type/id, outcome, IP/UA hashes, safe metadata, occurred_at; monthly partition candidate, append-only |

The Phase 4 interview tables are introduced by Alembic migration `20261026_0004_interview_coach`. Interview context is a minimized JSON snapshot used to make a session reproducible; raw CV documents remain in private object storage.

## Storage ownership

- **PostgreSQL:** identities, normalized facts, provenance, lifecycles, provider metadata, conversations/evaluations, costs, audit metadata. Do not store raw CV binaries.
- **Object storage:** quarantined originals, clean immutable versions, extraction/OCR artifacts, user exports. Private, encrypted, versioned, tagged by retention state; keys use random IDs, not names/emails.
- **Redis:** Celery broker/results, short-lived locks, rate counters, cached provider responses and readiness. Loss must not destroy business state.

Deletion is an auditable saga: mark inaccessible, revoke links/sessions, enqueue object deletion, remove/irreversibly anonymize dependent rows according to legal retention, then record completion without retaining deleted content.
