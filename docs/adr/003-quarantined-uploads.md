# ADR-003: Direct quarantined uploads

Status: accepted — 2026-10-24

The API issues brief presigned PUT URLs to a private quarantine bucket after validating metadata. Finalization verifies stored size/checksum metadata and asynchronously scans; only clean files are promoted to a separate private bucket. This keeps large bytes off API workers and makes “not yet trusted” a physical as well as logical boundary.
