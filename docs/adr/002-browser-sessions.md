# ADR-002: Secure cookie sessions with rotation

Status: accepted — 2026-10-24

Browser authentication uses short-lived signed access tokens and opaque rotating refresh tokens in Secure HttpOnly SameSite cookies. Store only refresh hashes and session-family metadata. Combine origin validation with CSRF tokens on mutations. This avoids local-storage bearer theft while supporting explicit revocation and reuse detection.
