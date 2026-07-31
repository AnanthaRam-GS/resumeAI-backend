# ResumeAI Backend

AI-assisted resume, cover letter, portfolio, and career-gap tooling for students and early-career candidates.

```text
Status: Backend MVP in progress
Stack: Fastify + TypeScript + PostgreSQL + Zod + AI integrations
Runtime: Node.js 20+ / pnpm 9+
```

ResumeAI helps users turn their profile, projects, experience, skills, and target job descriptions into stronger application materials. This repository contains the backend API and product planning documents for the larger ResumeAI platform.

## Contents

- [What This Repo Contains](#what-this-repo-contains)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [API Overview](#api-overview)
- [Project Structure](#project-structure)
- [Scripts](#scripts)
- [Testing](#testing)
- [Architecture](#architecture)
- [Roadmap](#roadmap)

## What This Repo Contains

### Active backend surface

| Area | Status | Notes |
| --- | --- | --- |
| Health check | Ready | `GET /health` |
| Auth | Ready | Register, login, current user |
| Profile | Ready | Personal info, career goal, onboarding |
| Portfolio | Ready | CRUD for portfolio items |
| Settings | Ready | Account/profile/settings updates |
| Database migrations | Ready | SQL migrations under `src/db/migrations` |
| Unit tests | Ready | Core implemented modules covered |

### In progress / planned surface

| Area | Status | Notes |
| --- | --- | --- |
| Resume generation | In progress | Services, routes, and orchestration scaffolding exist |
| Cover letters | In progress | Module code exists |
| Documents | In progress | Multipart upload stores originals in S3 and extracts portfolio items via NVIDIA NIM, while parsing and upload-oriented services remain active |
| Analytics | Ready | ATS scoring and evidence-based gap analysis are available |
| GitHub sync | Ready except external config | OAuth, encrypted tokens, Redis state, and BullMQ workers are available |
| Frontend app | Planned | Described in planning documents |
| Browser extension | Planned | Intended for job description capture |

## Quick Start

From the backend directory:

```bash
pnpm install
cp .env.example .env
cp .env.test.example .env.test
# Edit .env and set SUPABASE_DATABASE_URL.
pnpm db:supabase:init
pnpm dev
```

The API starts on the port configured in `.env`.

```bash
curl http://localhost:3000/health
```

Expected shape:

```json
{
  "success": true,
  "message": "ResumeAI Backend is running"
}
```

<details>
<summary><strong>Try the API locally</strong></summary>

Register a user:

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@example.com",
    "password": "password123",
    "firstName": "Student",
    "lastName": "User"
  }'
```

Sign in:

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "student@example.com",
    "password": "password123"
  }'
```

Use the returned token for protected routes:

```bash
curl http://localhost:3000/profile/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

</details>

<details>
<summary><strong>Recommended development loop</strong></summary>

```bash
pnpm type-check
pnpm lint
pnpm test:unit
pnpm dev
```

Use this loop when editing API modules, services, middleware, or database-backed flows.

</details>

## Environment Variables

The app validates environment values during startup through `src/config/env.ts`.

Create local files from the examples:

```bash
cp .env.example .env
cp .env.test.example .env.test
```

Common local development keys:

| Key | Purpose |
| --- | --- |
| `PORT` | API port |
| `NODE_ENV` | Runtime environment |
| `USE_SUPABASE` | Defaults to Supabase outside tests; set `false` only for optional local PostgreSQL |
| `SUPABASE_DATABASE_URL` | Supabase PostgreSQL connection string used by the app and migration runner |
| `DIRECT_URL` | Direct Supabase PostgreSQL URL used by migrations when runtime uses a pooler |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Optional Supabase API values, only needed if backend code calls the Supabase API directly |
| `LOCAL_DATABASE_URL` | Optional local PostgreSQL connection string used only when `USE_SUPABASE=false` |
| `DATABASE_URL` | Legacy fallback connection string |
| `TEST_DATABASE_URL` | Test PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN` | JWT lifetime |
| `AWS_ACCESS_KEY_ID` | S3 access key; optional for boot, required for upload/export features |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key; optional for boot, required for upload/export features |
| `AWS_REGION` | S3 region |
| `AWS_S3_BUCKET` | S3 bucket name; optional for boot, required for upload/export features |
| `GROQ_API_KEY` | Groq API key for fallback narration and GitHub repo enrichment |
| `GEMINI_API_KEY` | Gemini API key for narration and embeddings |
| `NVIDIA_NIM_API_KEY` | NVIDIA NIM API key; primary AI provider credential |
| `NVIDIA_NIM_BASE_URL` | NVIDIA NIM OpenAI-compatible API base URL |
| `NVIDIA_NIM_MODEL` | Chat/completion model used for generation and extraction |
| `RESUME_PARSER_MODE` | Resume import parser strategy: `hybrid` by default, or `rule-based`/`rules`, `llm-only`/`llm` |
| `NVIDIA_NIM_EMBEDDING_MODEL` | Optional embedding model identifier |
| `NVIDIA_NIM_TIMEOUT_MS` / `NVIDIA_NIM_MAX_RETRIES` | NIM timeout and retry controls |
| `NVIDIA_NIM_RATE_LIMIT_PER_MINUTE` / `NVIDIA_NIM_CACHE_TTL_SECONDS` | Free-app abuse and cost controls for NIM calls |
| `NVIDIA_API_KEY` | Legacy alias for `NVIDIA_NIM_API_KEY` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional until GitHub sync is enabled |
| `APP_BASE_URL` / `FRONTEND_URL` | Backend and frontend URLs for OAuth redirects |
| `TOKEN_ENCRYPTION_KEY` | 64-character hex AES-256-GCM key for encrypted OAuth tokens; required for GitHub sync |
| `REDIS_URL` / `WORKERS_ENABLED` | Redis/BullMQ worker and OAuth state configuration |
| `POSTHOG_API_KEY` / `POSTHOG_HOST` | Optional backend analytics configuration |
| `RESEND_API_KEY` / `EMAIL_FROM` | Optional weekly digest email configuration |
| `CORS_ALLOWED_ORIGINS` | Comma-separated frontend origins allowed by CORS |

Do not commit real `.env` files. The repository already ignores `.env`, `.env.local`, `.env.production`, and `.env.staging`.

Current document upload flow stores the original PDF or DOCX in S3, extracts structured portfolio items with NVIDIA NIM, and persists those items in PostgreSQL or Supabase. Groq remains available for unrelated AI modules.

### GitHub OAuth setup

Create a GitHub OAuth app with callback URL:

```text
http://localhost:3000/github/callback
```

For deployed environments, replace the host with `APP_BASE_URL`. Add the app credentials to `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, set a real `TOKEN_ENCRYPTION_KEY`, and ensure Redis is reachable through `REDIS_URL`. The frontend starts the flow through authenticated `GET /github/connect`; the unauthenticated GitHub callback resolves the user from the single-use Redis state before exchanging the code.

### Redis and workers

Redis is required for GitHub OAuth state and BullMQ queues. Use a local Redis during development or an external Redis service such as Upstash in production. Set `WORKERS_ENABLED=false` when you only want to boot the HTTP API and avoid constructing workers or registering schedulers.

## Production Operations

V2 production features add GitHub delta sync, LinkedIn export ZIP import, browser-extension job ingestion, persistent embeddings, pgvector semantic retrieval, application tracking, PostHog analytics, weekly digest email, WebSocket progress, circuit breakers, and pipeline traces. Signuture is a free application; billing, checkout, paid plans, and payment providers are intentionally not part of the runtime surface.

Operational docs:

- [Documentation index](./Documentation/README.md)
- [Browser extension API contract](./Documentation/API.md)
- [V2 operations guide](./Documentation/Operations.md)
- [Production checklist](./Documentation/Production-Checklist.md)
- [Troubleshooting](./Documentation/Troubleshooting.md)
- [Security and privacy notes](./Documentation/Security-Privacy.md)
- [Blueprint architecture reconciliation ADR](./Documentation/adr/0001-blueprint-architecture-reconciliation.md)

## Database Setup

ResumeAI uses PostgreSQL with SQL migrations in `src/db/migrations`.

### Supabase

Supabase is the primary database for local development, production, and deployment validation.

Set the Supabase direct PostgreSQL URL in `.env`:

```env
USE_SUPABASE=true
SUPABASE_DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?sslmode=require
PGSSLMODE=require
```

Then run:

```bash
pnpm db:supabase:init
```

This applies migrations to Supabase and verifies database connectivity. Runtime checks use `SUPABASE_DATABASE_URL`; migrations use `DIRECT_URL` when it is set.

Detailed guide: [Documentation/Supabase.md](./Documentation/Supabase.md)

### Optional local PostgreSQL

Local PostgreSQL is retained only for explicit development and test workflows. Set `USE_SUPABASE=false` and provide `LOCAL_DATABASE_URL` before running local database scripts.

Docker guide: [Documentation/Optional-Docker-Postgres.md](./Documentation/Optional-Docker-Postgres.md)

Homebrew/local guide: [Documentation/Optional-Local-Postgres.md](./Documentation/Optional-Local-Postgres.md)

Seeded local login:

```text
student@example.com / Password123!
```

### Database areas

| Table area | Purpose |
| --- | --- |
| `users` | Authentication and account identity |
| `portfolio_items` | Projects, experience, education, skills, certifications |
| `job_targets` | Target role and job description records |
| `resume_generation_jobs` | Resume generation workflow tracking |
| `resume_versions` | Generated resume output versions |
| `cover_letters` | Generated cover letter records |
| `gap_analyses` | Career gap recommendations |
| `github_profiles` / `github_repositories` | GitHub OAuth profile and repository staging data |
| `github_sync_runs` | Durable GitHub sync summaries |
| `schema_migrations` | Applied migration tracking |

## API Overview

### Health

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | API health check |

### Auth

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/auth/register` | Create a user account |
| `POST` | `/auth/login` | Sign in and receive a token |
| `GET` | `/auth/me` | Fetch the current authenticated user |

### Profile and onboarding

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/profile/me` | Fetch current profile |
| `PATCH` | `/profile/personal` | Update personal details |
| `PATCH` | `/profile/career-goal` | Update career goal |
| `PATCH` | `/profile/onboarding-step` | Update onboarding progress |
| `GET` | `/profile/completeness` | Calculate profile completeness |

### Portfolio

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/portfolio/items` | Create a portfolio item |
| `GET` | `/portfolio/items` | List portfolio items |
| `GET` | `/portfolio/items/:id` | Fetch one portfolio item |
| `PATCH` | `/portfolio/items/:id` | Update a portfolio item |
| `DELETE` | `/portfolio/items/:id` | Delete a portfolio item |

### Documents

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/portfolio/upload` | Upload a PDF or DOCX, store the original in S3, and extract portfolio items via NVIDIA NIM |

### Settings

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/settings` | Fetch account settings |
| `PATCH` | `/settings/notifications` | Update notification settings |
| `PATCH` | `/settings/profile` | Update profile settings |
| `PATCH` | `/settings/career-goal` | Update career-goal settings |
| `DELETE` | `/settings/account` | Delete account |

## Project Structure

```text
resumeAI-backend/
├── Documentation/              # Detailed setup, deployment, architecture, and planning docs
├── docker/                     # Docker initialization assets
├── scripts/                    # Database setup and utility scripts
├── src/
│   ├── config/                 # Environment and app configuration
│   ├── data/                   # Static supporting data
│   ├── db/                     # DB client, migrations, reset utilities
│   ├── middleware/             # Auth, validation, upload, rate limiting
│   ├── modules/                # Feature modules
│   ├── services/               # Shared services and integrations
│   ├── templates/              # Rendering templates
│   ├── types/                  # Shared TypeScript types
│   └── utils/                  # Errors, logging, response helpers
├── tests/
│   ├── fixtures/               # Test fixtures
│   └── unit/                   # Unit and endpoint tests
├── docker-compose.yml
├── package.json
└── README.md
```

## Scripts

### App

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the backend in watch mode |
| `pnpm build` | Compile TypeScript |
| `pnpm start` | Run the compiled build |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Fix ESLint issues where possible |
| `pnpm type-check` | Run TypeScript checks |
| `pnpm format` | Format source and tests |
| `pnpm format:check` | Check formatting |

### Tests

| Command | Description |
| --- | --- |
| `pnpm test` | Run all tests |
| `pnpm test:unit` | Run unit tests |
| `pnpm test:integration` | Run integration tests |
| `pnpm test:coverage` | Run coverage |
| `pnpm test:watch` | Run Vitest in watch mode |

### Database

| Command | Description |
| --- | --- |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:supabase:init` | Apply migrations to Supabase and smoke-test connectivity |
| `pnpm db:reset` | Reset current database and rerun migrations |
| `pnpm db:seed` | Seed the selected local database with development data |
| `pnpm db:check` | Smoke-test DB connectivity |
| `pnpm db:wait` | Wait for selected DB readiness |
| `pnpm db:local:setup` | Set up local PostgreSQL databases |
| `pnpm db:local:init` | Set up local PostgreSQL, migrate, seed, and check |
| `pnpm db:local:connect` | Connect to local dev database |
| `pnpm db:test:connect` | Connect to local test database |
| `pnpm db:docker:up` | Start Docker PostgreSQL |
| `pnpm db:docker:init` | Start Docker PostgreSQL, migrate, seed, and check |
| `pnpm db:docker:down` | Stop Docker PostgreSQL |
| `pnpm db:docker:logs` | Tail Docker PostgreSQL logs |
| `pnpm db:docker:reset` | Reset Docker PostgreSQL volume |
| `pnpm db:docker:connect` | Connect to Docker dev database |
| `pnpm db:docker:test:connect` | Connect to Docker test database |

## Testing

Implemented modules are covered with endpoint-level and service-level tests under `tests/unit`.

Current coverage includes:

- auth endpoints
- profile endpoints
- portfolio endpoints
- settings endpoints
- GitHub OAuth/sync security contracts
- deterministic gap-analysis evidence and taxonomy logic
- shared middleware
- storage service
- AI service boundaries

Run the full suite:

```bash
pnpm test
```

Run only unit tests:

```bash
pnpm test:unit
```

## Architecture

### Current backend stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js 20+ |
| API framework | Fastify |
| Language | TypeScript |
| Validation | Zod |
| Database | PostgreSQL |
| Storage | AWS S3 |
| AI integrations | NVIDIA NIM, Groq, Google Gemini |
| PDF rendering | Puppeteer |
| Tests | Vitest |

### Backend modules

Active API modules:

- `src/modules/auth`
- `src/modules/profile`
- `src/modules/portfolio`
- `src/modules/settings`

Supporting and planned domain modules:

- `src/modules/documents`
- `src/modules/resume`
- `src/modules/cover-letter`
- `src/modules/analytics`
- `src/modules/ai`

Shared service layer:

- `src/services/storage.service.ts`
- `src/services/document-parser.service.ts`
- `src/services/nvidia-nim.service.ts`
- `src/services/groq.service.ts`
- `src/services/gemini.service.ts`
- `src/services/pdf-renderer.service.ts`
- `src/services/ats-scorer.service.ts`

## Planning Documents

The broader product direction lives in:

- [Documentation/Planning/ResumeAI_Blueprint.md](./Documentation/Planning/ResumeAI_Blueprint.md)
- [Documentation/Planning/ResumeAI_MVP_Build_Plan.md](./Documentation/Planning/ResumeAI_MVP_Build_Plan.md)

Use the blueprint for full-platform vision, AI-agent design, frontend direction, browser extension ideas, and infrastructure notes.

Use the MVP build plan for backend phases, database shape, module conventions, and implementation order.

## Roadmap

1. Complete remaining backend generation and analytics flows.
2. Connect document ingestion and AI orchestration end to end.
3. Implement resume generation and PDF delivery.
4. Implement cover letter generation.
5. Implement ATS scoring and gap analysis APIs.
6. Build the frontend application.
7. Build the browser extension for job description capture.
8. Move MVP synchronous flows toward production orchestration where needed.

## Current Reality

This README describes the complete ResumeAI direction while staying clear about the repository today:

- the product vision is full-platform
- this repository is currently backend-centered
- the fully wired API surface is smaller than the full planned product
- several future-facing modules already exist as scaffolding or partial implementation
