# Security and Privacy Notes

## Authentication and Authorization

- Protected routes require a valid JWT.
- User-owned resources are filtered by `user_id` in service queries.
- Browser-extension ingestion uses the same authenticated route boundary as the web app.

## GitHub OAuth and Tokens

- OAuth state validation is handled by the GitHub OAuth flow before exchanging the code.
- GitHub access tokens are encrypted with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`.
- Rotate `TOKEN_ENCRYPTION_KEY` with a planned re-encryption migration; do not change it ad hoc in production.

## Upload and ZIP Safety

- LinkedIn import accepts user-provided export ZIP files only.
- ZIP entries are streamed with `yauzl`; archives are not extracted to disk.
- Absolute paths, `..` path traversal, symlinks, encrypted entries, oversized entries, and unsupported structures are rejected.
- Preview records are stored before persistence, and users explicitly choose which entries to apply.

## Payments

Signuture is a free application. Billing, checkout, paid plans, payment providers, and subscription features are intentionally not part of the public runtime surface.

## Analytics and Benchmarks

- Analytics events are routed through centralized wrappers and sanitized.
- Respect analytics opt-out settings.
- ATS benchmarks expose only anonymized aggregate context and require a minimum sample threshold before showing percentile information.

## Secrets

Never commit `.env` files or provider credentials. Rotate credentials after accidental exposure and invalidate old OAuth/provider tokens where supported.
