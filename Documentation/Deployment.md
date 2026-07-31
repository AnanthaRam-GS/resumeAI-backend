# Signuture Deployment Guide

## Recommended Low-Cost Stack

- Frontend: Vercel or any static host that supports SPA fallback.
- Backend: Railway, Render, Fly.io, or another Node 20 host.
- Database: Supabase PostgreSQL or managed PostgreSQL with SSL.
- Redis: Upstash Redis or equivalent for OAuth state and BullMQ workers.
- Storage: S3-compatible object storage for uploads and generated PDFs.
- AI: NVIDIA NIM via `NVIDIA_NIM_*` environment variables.

Signuture is a free application. Do not configure billing, checkout, paid plans, invoices, or payment providers.

## Backend

Build command:

```bash
pnpm install --frozen-lockfile
pnpm build
```

Start command:

```bash
pnpm start
```

Migration command:

```bash
pnpm db:migrate
```

Health checks:

- `GET /health`
- `GET /health/db`
- `GET /health/ready`

## Required Production Environment

Set at minimum:

- `NODE_ENV=production`
- `PORT`
- `USE_SUPABASE=true`
- `SUPABASE_DATABASE_URL`
- `DIRECT_URL`
- `PGSSLMODE=require`
- `JWT_SECRET`
- `APP_BASE_URL`
- `FRONTEND_URL`
- `CORS_ALLOWED_ORIGINS`
- `NVIDIA_NIM_API_KEY`
- `NVIDIA_NIM_BASE_URL`
- `NVIDIA_NIM_MODEL`
- `TOKEN_ENCRYPTION_KEY`
- `REDIS_URL`
- S3-compatible storage variables when uploads/PDF export are enabled

Optional:

- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `POSTHOG_API_KEY`
- `RESEND_API_KEY`
- `USAGE_LIMITS_ENABLED=true`

## Frontend

Deploy the frontend repository with:

```bash
npm ci
npm run build
```

Set:

- `VITE_API_URL=https://your-api.example.com`
- `VITE_WS_URL=wss://your-api.example.com`
- optional PostHog variables

## OAuth Redirects

GitHub OAuth callback:

```text
https://your-api.example.com/github/callback
```

The backend stores single-use OAuth state in Redis and redirects users back to the frontend path that initiated the flow.

## Rollback

- Keep the last successful frontend build available in the hosting platform.
- Backend rollback should deploy the previous build artifact and avoid rolling back database migrations unless an explicit down/repair migration exists.
- If a migration causes issues, ship a forward repair migration.

## Verification

After deploy:

```bash
curl https://your-api.example.com/health/ready
```

Then verify login, onboarding, portfolio CRUD, GitHub connect/sync, resume generation fallback behavior, resume preview, and PDF export.
