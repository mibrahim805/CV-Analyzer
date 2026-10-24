# Security and privacy threat model

Method: STRIDE plus privacy abuse cases. Assets include credentials/sessions, CV PII and documents, corrected profiles, job preferences, conversations/interview responses, provider/model keys, usage/cost data, and audit evidence. Trust boundaries exist at browser/API, API/storage, API/Redis/PostgreSQL, worker/untrusted file parser, provider egress, and operator access.

| Threat / abuse | Principal controls | Verification |
|---|---|---|
| Credential stuffing/enumeration | Argon2id, generic responses, per-account/IP rate limits, email verification, breached-password policy later, MFA roadmap | auth/rate-limit tests and alerts |
| Token theft/replay | Secure HttpOnly cookies, short access TTL, hashed rotating refresh families, reuse revocation, CSRF+Origin checks | replay/CSRF tests |
| IDOR/cross-tenant access | mandatory user scope in repositories/services, deny-by-default policies, concealed 404s, opaque IDs as defense-in-depth only | parameterized isolation tests |
| Malicious/polyglot/oversized CV | extension + declared type + magic bytes, size/checksum, quarantine, ClamAV, hardened parser worker with CPU/memory/time limits, no macros/execution | EICAR, mismatch, zip-bomb and malformed fixtures |
| Object disclosure | private buckets, random keys, KMS encryption, brief scoped presigned URLs, blocked public ACLs, access logging | bucket policy and URL-expiry tests |
| Prompt injection/data exfiltration | untrusted-data boundary, typed tools, server-injected identity, per-tool authorization, egress allow-list, URL validation, output schema and encoding | adversarial contract suite |
| SQL/XSS/SSRF | ORM parameters, no raw model SQL, React escaping/sanitized rich text, provider host allow-list, block private/metadata IPs, redirect revalidation | SAST and payload tests |
| Queue replay/race | idempotency keys, compare-and-set transitions, task timeouts/retries, DLQ/operator review | duplicate/concurrency tests |
| Dependency/supply-chain compromise | lockfiles, minimal pinned images, vulnerability/license scans, signed CI artifacts/SBOM for release | Dependabot/scanners and image gates |
| Insider/operator snooping | RBAC/JIT support access, reason capture, field masking, immutable audit, no content in telemetry | periodic audit/access review |
| AI cost denial | per-user/tenant budgets, token/tool/turn caps, concurrency limits, circuit breakers, cached safe work | quota/load tests and cost alerts |
| Data remanence | explicit retention, user purge saga, object lifecycle/version purge, backup expiry, provider deletion terms | scheduled deletion reconciliation |

## Privacy design

Collect only account, career, and feature-use data needed for the service. Publish purposes and retention by category; record terms/privacy consent versions separately from optional AI-improvement consent. Default provider/model sharing to the minimum. Encrypt transit and storage, with application-level encryption for selected contact/conversation fields where threat analysis warrants it. Keep production out of developer environments; use synthetic labeled fixtures.

Data subject workflows support access/export, correction, deletion, consent withdrawal, and session revocation. Account deletion immediately blocks access; completion is tracked across database, objects, caches, providers, telemetry, and backups (which expire rather than being surgically modified where documented). Audit records retain minimal non-content evidence when legally necessary.

## Operational requirements

Secrets live in a managed secrets service, never source/env examples with real values. Production CORS is an exact allow-list; HSTS/CSP/referrer/permissions policies are set at the edge. Database and object storage are private-network only. Backups are encrypted and restore-tested. Security events have severity/runbooks; incident response includes containment, evidence preservation, notification assessment, recovery, and postmortem. A DPIA and jurisdiction-specific legal review precede launch.

## Residual risks

LLM output can still be wrong; the UI communicates uncertainty and preserves source evidence. Malware scanners and file parsers can miss zero-days; sandboxing and least privilege limit blast radius. Job providers may serve stale or misleading content; verification timestamps, expiry, user reporting, and provider kill switches reduce harm.
