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
| Resume generation | In progress | Services, routes, orchestration scaffolding exist |
| Cover letters | In progress | Module code exists |
| Documents | In progress | Parsing and upload-oriented services exist |
| Analytics | In progress | ATS and gap-analysis services exist |
| Frontend app | Planned | Described in planning documents |
| Browser extension | Planned | Intended for job description capture |

## Quick Start

From the backend directory:

```bash
pnpm install
cp .env.example .env
cp .env.test.example .env.test
pnpm db:migrate
pnpm dev
```

The API starts on the port configured in `.env`.

```bash
curl http://localhost:3000/health
```

Expected shape:

```json
{
  "status": "ok"
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
| `DATABASE_URL` | Main PostgreSQL connection string |
| `TEST_DATABASE_URL` | Test PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN` | JWT lifetime |
| `AWS_ACCESS_KEY_ID` | S3 access key |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key |
| `AWS_REGION` | S3 region |
| `AWS_S3_BUCKET` | S3 bucket name |
| `GROQ_API_KEY` | Groq API key |
| `GEMINI_API_KEY` | Gemini API key |

Do not commit real `.env` files. The repository already ignores `.env`, `.env.local`, `.env.production`, and `.env.staging`.

## Database Setup

ResumeAI uses PostgreSQL with SQL migrations in `src/db/migrations`.

### Option A: Local PostgreSQL

Use this if PostgreSQL is installed directly on your machine.

```bash
pnpm db:local:setup
pnpm db:migrate
pnpm db:check
```

Detailed guide: [docs/postgres-local-setup.md](./docs/postgres-local-setup.md)

### Option B: Docker Compose PostgreSQL

Use this if you prefer a containerized database.

```bash
pnpm db:docker:up
pnpm db:migrate
pnpm db:check
```

Detailed guide: [docs/docker-postgres-setup.md](./docs/docker-postgres-setup.md)

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
├── documents/                  # Product blueprint and MVP build plan
├── docs/                       # Developer setup documentation
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
| `pnpm db:reset` | Reset current database and rerun migrations |
| `pnpm db:check` | Smoke-test DB connectivity |
| `pnpm db:local:setup` | Set up local PostgreSQL databases |
| `pnpm db:local:connect` | Connect to local dev database |
| `pnpm db:test:connect` | Connect to local test database |
| `pnpm db:docker:up` | Start Docker PostgreSQL |
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
| AI integrations | Groq, Google Gemini |
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
- `src/services/groq.service.ts`
- `src/services/gemini.service.ts`
- `src/services/pdf-renderer.service.ts`
- `src/services/ats-scorer.service.ts`

## Planning Documents

The broader product direction lives in:

- [documents/ResumeAI_Blueprint.md](./documents/ResumeAI_Blueprint.md)
- [documents/ResumeAI__MVP_Build_Plan.md](./documents/ResumeAI__MVP_Build_Plan.md)

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
