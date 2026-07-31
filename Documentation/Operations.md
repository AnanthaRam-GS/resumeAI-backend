# V2 Operations Guide

## Workers and Redis

Queues are defined in `src/workers/queues.ts` and workers in `src/workers/`. Set:

```bash
REDIS_URL=redis://localhost:6379
WORKERS_ENABLED=true
```

Run the API and workers as separate processes in production. For API-only local development or tests, set `WORKERS_ENABLED=false`; queue calls become controlled no-ops where possible and synchronous API routes continue to work.

Queues cover GitHub discovery/enrichment, document parsing, LinkedIn parsing, resume generation, cover-letter generation, embeddings, gap analysis, and weekly digest jobs. Jobs use typed payloads, bounded attempts, backoff, and deterministic job IDs where duplicate work would be harmful.

## WebSocket Progress

Authenticated clients connect to:

```text
ws://localhost:3000/ws?token=<jwt>
```

Events use this shape:

```json
{
  "operationId": "uuid-or-job-id",
  "stage": "embedding",
  "status": "running",
  "progress": 45,
  "message": "Embedding portfolio item",
  "timestamp": "2026-07-01T00:00:00.000Z",
  "payload": {}
}
```

Progress is user-scoped. Frontend polling remains the fallback when WebSockets are unavailable.

## Free-App Usage Protection

Signuture does not expose billing, checkout, subscriptions, pricing, invoices, or paid plans. Production deployments can enable `USAGE_LIMITS_ENABLED=true` to protect the free NVIDIA NIM and GitHub sync budget with monthly per-user counters.

## Resend Weekly Digest

Set:

```bash
RESEND_API_KEY=re_...
EMAIL_FROM="ResumeAI <noreply@example.com>"
```

When `RESEND_API_KEY` is missing, email sending uses a no-op local provider. Weekly digests respect `weekly_digest_opt_in` and avoid duplicate sends within the configured weekly window.

## PostHog

Backend:

```bash
POSTHOG_API_KEY=phc_...
POSTHOG_HOST=https://app.posthog.com
```

Frontend:

```bash
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://app.posthog.com
```

Analytics wrappers sanitize payloads and must not send resume text, job descriptions, contact details, OAuth tokens, document content, or other secrets.

## Pipeline Traces

`pipeline_traces` stores pipeline type, user ID, related entity IDs, stage data, provider/model names, latency, retry/fallback metadata, usage summaries, terminal status, and safe error categories. Do not store raw prompts, tokens, passwords, GitHub access tokens, or full document contents.

Recommended retention: keep detailed traces for 30-90 days, then aggregate or delete them depending on compliance requirements.
