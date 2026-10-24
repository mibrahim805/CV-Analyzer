# Genuine job discovery integration strategy

## Source policy

Integrate only documented APIs, licensed feeds, customer-authorized ATS endpoints, or sources whose terms explicitly allow the use. Initial candidates are direct employer ATS/public feeds (for example Greenhouse/Lever endpoints where permitted) and a contracted aggregator appropriate to launch geography. Commercial selection requires terms, coverage, freshness, quota, data-retention, attribution, deep-link, and redistribution review. API keys and paid plans require explicit owner approval.

No browser scraping, CAPTCHA bypass, paywall circumvention, copied gated descriptions, or “sample jobs” shown as live. If providers are absent or degraded the UI says so and retains last-verified timestamps.

## Adapter contract

```text
JobProvider
  capabilities() -> regions, filters, quotas, attribution rules
  search(SearchCriteria, cursor) -> ProviderPage[ProviderJob]
  fetch(external_id) -> ProviderJob | unavailable
  health() -> ProviderHealth
```

Provider DTOs are untrusted and map through a validated canonical schema. Adapters own auth, timeouts, backoff, quota headers, cursor semantics, attribution, and raw-payload retention policy. The domain layer owns normalization and matching, so adding a provider does not change ranking.

## Pipeline

1. Validate user criteria and minimize provider fields sent.
2. Query providers concurrently within quotas; cache only contract-permitted responses.
3. Normalize titles, locations, arrangements, currencies, dates, URLs, skill evidence, required/optional wording.
4. Deduplicate first by provider ID/canonical URL, then conservative fingerprint (`company + normalized title + location + description hash`). Preserve all source references.
5. Reject malformed/unsafe URLs; mark expired from explicit expiry, provider removal, or freshness SLA. Reverify before recommendation display when stale.
6. Hard-filter legal/work arrangement/location/salary constraints only when data is known. Unknown fields remain unknown, not false.
7. Rank using explicit dimensions: required-skill evidence, optional skills, experience/seniority alignment, role/title similarity, preferences, transferable skills, and freshness. Store weighted contributions and gaps.
8. Present the source, original link, verified time, matched evidence, missing/unknown qualifications, and the relevance formula/version.

The relevance indicator ranges 0–100 as a normalized weighted coverage of job-related dimensions, not hiring likelihood. Required qualification gaps are never hidden by optional skill matches. Offline evaluation uses labeled relevance judgments, freshness/duplication metrics, and subgroup fairness audits without using protected traits in online ranking.

## Reliability

Per-provider circuit breakers, bounded retries with jitter, request budgets, encrypted credentials, request correlation, kill switches, and source health dashboards are required. Webhooks are verified and idempotent where available; otherwise scheduled refresh respects quotas. Provider raw data is retained only when licensed and is isolated from prompts until sanitized.
