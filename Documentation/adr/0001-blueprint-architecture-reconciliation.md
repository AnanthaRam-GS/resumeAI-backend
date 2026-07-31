# ADR 0001: Blueprint Architecture Reconciliation

## Status

Accepted.

## Context

The Blueprint describes a larger production architecture with Next.js, Clerk, S3, Redis/BullMQ, pgvector, browser-extension ingestion, provider fallback, analytics, and observability. The current application is a Fastify API with a Vite React frontend, JWT authentication, PostgreSQL migrations, and optional external providers.

## Decision

Keep the current Fastify + Vite + JWT architecture and extend it with production slices instead of replacing working modules. New behavior is added through migrations, typed service modules, route modules, BullMQ workers, frontend pages/hooks, and operational documentation.

## Implemented Adaptations

- Vite React remains the frontend framework instead of moving to Next.js.
- JWT auth remains the auth boundary instead of Clerk.
- PostgreSQL remains the system of record; pgvector is enabled by migration where available.
- Redis/BullMQ is optional for API-only local development through `WORKERS_ENABLED=false`.
- S3 remains configurable for file/PDF storage; local tests mock storage.
- LinkedIn import is ZIP-export based only. No scraping is performed.
- Browser extension support is implemented as authenticated backend contracts and secure frontend prefill.
- AI provider fallback is implemented with a scoped circuit breaker and sanitized errors.
- Payment providers are intentionally excluded because Signuture is a free application.
- Resend and PostHog are optional unless their features are enabled.

## Consequences

This avoids a framework rewrite and keeps existing MVP flows intact. Some capabilities remain externally blocked until credentials or infrastructure are configured: Resend delivery, PostHog capture, Redis-backed workers, provider-backed AI calls, GitHub OAuth, S3 storage, and pgvector-backed semantic retrieval.
