# Product requirements and MVP boundary

## Purpose and principles

CareerPilot helps a job seeker turn an uploaded CV into evidence-based improvements, discover genuine openings, and practice role-specific interviews. It is a coaching product, never an automated employment decision-maker. Every recommendation must trace to user-provided evidence, an explicitly labeled inference, or a cited external listing. The product does not infer protected traits or claim hiring probability.

## Personas and outcomes

- **Active applicant:** maintain CV versions, understand gaps, find current roles, and prepare for a chosen vacancy.
- **Career changer:** surface transferable skills and realistic next-step roles without overstating qualifications.
- **Returning professional:** correct extracted timelines and build confidence through tracked practice.
- **Operator/support:** investigate processing events using metadata and audit logs without casually viewing CV contents.

## Primary journeys

1. **Trustworthy onboarding:** register, verify email, complete a minimal profile, record consent and retention choices.
2. **Secure CV intake:** request an upload slot, upload PDF/DOCX directly to quarantine, confirm checksum/size, scan, extract asynchronously, review warnings, correct normalized facts, and retain multiple immutable versions.
3. **Transparent analysis:** choose a target role, run a versioned rubric, see criterion-level evidence/confidence/recommendations, and distinguish source facts from generated suggestions.
4. **Real job discovery:** set preferences, query permitted providers, normalize/deduplicate/expire listings, then rank with an explainable relevance model and link to the original source.
5. **Adaptive interview:** choose a CV and job/role, answer one contextual question at a time, skip/end safely, and receive rubric-based evidence and practice advice.
6. **Continuity and control:** revisit reports/sessions, export data, revoke sessions, configure retention, and delete documents/account.

## MVP definition

The commercial MVP spans Phases 1–5: authentication and secure intake; deterministic extraction plus correction and analysis; at least one approved live job provider; text interviews; unified assistant with controlled tools. Launch also requires operational controls in Phase 6.

Phase 1 does **not** claim CV extraction, AI analysis, job search, matching, chatbot, or interview functionality. It delivers deployable boundaries: accounts, preferences, upload/quarantine/scanning lifecycle, durable schemas, API contracts, application shell, worker infrastructure, tests, and observability hooks.

## Functional requirements

- Every user-owned query is scoped by authenticated `user_id`; opaque UUIDs are not authorization.
- Uploads accept only PDF/DOCX up to the configured size and remain inaccessible until a clean scan.
- State transitions are explicit, idempotent, retry-aware, timestamped, and auditable.
- Corrections create revisions; source evidence and generated suggestions remain separate.
- Job listings always expose source, canonical URL, fetched/verified time, and expiry state.
- Match indicators explain included dimensions and are never presented as hiring probabilities.
- Models use validated structured outputs, versioned prompts, bounded context, cost records, and no direct DB/network/file access.
- Accessibility target is WCAG 2.2 AA for critical journeys.

## Non-functional targets

- API p95 under 400 ms for ordinary reads excluding provider/model work; asynchronous jobs expose status.
- 99.9% monthly availability target after production launch; RPO ≤ 15 minutes and RTO ≤ 4 hours.
- Tenant isolation tests on every user-owned resource class.
- Audit security-sensitive actions without logging CV text, tokens, passwords, or prompt payloads.
- Deletion requests immediately revoke access and complete object/provider deletion within the documented retention window.

## Product metrics

Activation: verified account → clean CV → reviewed profile. Quality: correction rate per extracted field, recommendation helpfulness, valid/non-expired listing ratio, match explanation opens, interview completion/repeat rate. Safety: cross-tenant access failures, infected upload containment, prompt-injection/tool-policy blocks, deletion SLA. Business metrics must never optimize based on protected traits.

## Explicit exclusions

Automatic applications, employer-side candidate ranking, scraping prohibited sources, ATS “success” claims, psychological/personality scoring, voice/video interviews, native mobile apps, payroll/recruiting workflows, and unrestricted autonomous agents.
