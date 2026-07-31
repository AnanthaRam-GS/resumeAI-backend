# Signuture Architecture

## Overview

Signuture is a Vite/React frontend and Fastify/TypeScript backend backed by PostgreSQL, Redis-backed queues, S3-compatible storage, and NVIDIA NIM for AI workflows.

The product is free. Usage counters protect operational cost; there is no billing or payment runtime surface.

## Backend Structure

- `src/app.ts`: Fastify app setup, security middleware, health checks, route registration.
- `src/config/env.ts`: validated environment configuration.
- `src/modules/*`: route/controller/schema/service modules for product domains.
- `src/services/*`: provider integrations and shared infrastructure services.
- `src/db/migrations`: SQL migrations.
- `src/workers`: BullMQ workers for async GitHub, embedding, and digest work.

## AI Flow

NVIDIA NIM is accessed through `src/services/nvidia-nim.service.ts`.

The service provides:

- environment-based API key/base URL/model configuration
- timeout handling
- bounded retries with exponential backoff
- per-process rate limiting
- short TTL response caching
- circuit breaker integration
- safe `AppError` failures

Callers validate or normalize AI output before persistence. Resume generation falls back to deterministic content when AI generation fails where possible.

## GitHub Sync Flow

1. Frontend calls `GET /github/connect?returnTo=/github-sync`.
2. Backend stores signed OAuth state in Redis.
3. GitHub redirects to `/github/callback`.
4. Backend encrypts the token with `TOKEN_ENCRYPTION_KEY`.
5. Sync jobs discover repositories, dedupe unchanged content, enrich projects, and upsert portfolio items.

Repeated syncs are protected by unique constraints and repository dedupe logic.

## Resume Flow

1. User supplies role/company/JD.
2. Backend stores or reuses a job target.
3. JD analysis extracts required entities.
4. Portfolio items are scored.
5. NIM generates structured content, with deterministic fallback.
6. PDF rendering stores or returns export URLs.
7. ATS scoring provides deterministic feedback.

## Frontend Structure

- `src/layouts/AppShell.tsx`: responsive app shell.
- `src/pages`: route-level screens.
- `src/components`: reusable design-system primitives.
- `src/lib/api.ts`: Axios client and auth/error handling.
- `src/lib/hooks`: polling and API hooks.

## CI/CD

GitHub Actions run type-check, tests, and builds on pull requests and main/develop pushes.

## Development Guidelines

- Add new API routes with schema validation and auth checks.
- Keep user-owned queries scoped by `user_id`.
- Add migrations as forward-only SQL files.
- Document every new environment variable in `.env.example`.
- Add deterministic fallback behavior around AI provider failures.
