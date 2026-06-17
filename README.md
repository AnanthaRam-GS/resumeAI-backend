# ResumeAI

ResumeAI is an AI-assisted resume and cover letter platform designed for university students and early-career candidates who need to tailor application materials quickly, consistently, and with stronger ATS alignment.

This repository currently contains the **backend codebase** for the platform, plus the planning and architecture documents for the **full ResumeAI product**, including the planned frontend application, browser extension, AI orchestration pipeline, analytics, cover letter generation, and gap analysis features.

## Product Vision

ResumeAI is intended to help a user:

- build a structured professional profile
- centralize projects, experience, education, certifications, and skills
- import portfolio data from documents and GitHub
- analyze a job description
- select the most relevant portfolio signals
- generate ATS-aware resume content and PDF outputs
- generate cover letters
- surface career gaps and improvement recommendations

The long-term product scope is broader than the currently wired backend API. The planning documents in this repository define the full system direction.

## Repository Scope

This repo is currently a **backend-first implementation** built with Fastify, PostgreSQL, TypeScript, and AI service integrations.

Today, the repository includes:

- Fastify API foundation
- PostgreSQL schema and migration runner
- local PostgreSQL workflow
- Docker Compose PostgreSQL workflow
- AWS S3 storage utility
- authentication module
- profile and onboarding module
- portfolio CRUD module
- settings module
- AI-related service scaffolding and domain services
- resume, documents, cover-letter, and analytics module code in various stages of implementation
- unit test coverage for implemented core backend modules

Planned but not fully represented as runnable code in this repository:

- Next.js frontend application
- browser extension for job description capture
- full async multi-agent orchestration and production deployment topology from the complete blueprint

## Planning Documents

The two primary references for this project are:

- [documents/ResumeAI_Blueprint.md](./documents/ResumeAI_Blueprint.md)
- [documents/ResumeAI__MVP_Build_Plan.md](./documents/ResumeAI__MVP_Build_Plan.md)

They serve different purposes:

- `ResumeAI_Blueprint.md` describes the **complete product vision**, end-to-end user flow, full technology stack, AI agent design, future frontend and extension scope, infrastructure direction, and engineering work split.
- `ResumeAI__MVP_Build_Plan.md` translates that broader vision into a **backend implementation plan**, database design, phased delivery model, and backend folder/module conventions.

## Current Implementation Status

### Implemented and actively wired

- `GET /health`
- auth routes under `/auth`
- profile routes under `/profile`
- portfolio routes under `/portfolio`
- settings routes under `/settings`

### Core completed backend areas

- repository and Fastify scaffold
- environment validation
- shared middleware
- PostgreSQL connection layer
- SQL migrations and reset workflow
- local PostgreSQL setup
- Docker Compose PostgreSQL setup
- S3 storage service
- auth endpoints
- profile and onboarding endpoints
- portfolio CRUD endpoints
- settings endpoints
- unit tests for the implemented modules above

### Present in codebase but broader than currently wired API surface

- AI service clients
- ATS scoring services
- gap advisor services
- document parsing services
- resume generation services
- cover-letter services

These areas exist in the repository as part of the full project trajectory, but the current API registration and execution path should be treated as backend work in progress rather than complete end-to-end product readiness.

## High-Level Architecture

### Current backend architecture

- **Runtime:** Node.js 20+
- **Framework:** Fastify
- **Language:** TypeScript
- **Validation:** Zod
- **Database:** PostgreSQL
- **Storage:** AWS S3
- **AI integrations:** Groq and Google Gemini
- **PDF rendering:** Puppeteer

### Planned full-platform architecture

According to the complete blueprint, ResumeAI is intended to evolve into:

- a **Next.js frontend** for onboarding, dashboarding, resume preview, cover letter generation, and analytics
- a **browser extension** for collecting job descriptions directly from job boards
- a **multi-agent AI pipeline** for JD extraction, portfolio scoring, content generation, ATS scoring, and gap analysis
- a **managed infrastructure stack** with hosted frontend, hosted backend, managed PostgreSQL, object storage, and production observability

## Backend Modules

### Active API modules

- `src/modules/auth`
- `src/modules/profile`
- `src/modules/portfolio`
- `src/modules/settings`

### Supporting and planned domain modules

- `src/modules/documents`
- `src/modules/resume`
- `src/modules/cover-letter`
- `src/modules/analytics`
- `src/modules/ai`

### Shared service layer

- `src/services/storage.service.ts`
- `src/services/document-parser.service.ts`
- `src/services/groq.service.ts`
- `src/services/gemini.service.ts`
- `src/services/pdf-renderer.service.ts`
- `src/services/ats-scorer.service.ts`

## Repository Structure

```text
resumeAI-backend/
├── documents/                  # Product blueprint and backend MVP plan
├── docs/                       # Developer setup documentation
├── docker/                     # Docker initialization assets
├── scripts/                    # Local database setup and utilities
├── src/
│   ├── config/                 # Environment and app configuration
│   ├── data/                   # Static supporting data
│   ├── db/                     # DB client, migrations, reset utilities
│   ├── middleware/             # Auth, validation, upload, rate-limit
│   ├── modules/                # Feature modules
│   ├── services/               # Shared services and external integrations
│   ├── templates/              # Rendering templates
│   ├── types/                  # Shared TypeScript types
│   └── utils/                  # Errors, logging, response helpers
├── tests/
│   ├── fixtures/               # Test fixtures
│   └── unit/                   # Unit and endpoint tests
├── docker-compose.yml          # Docker PostgreSQL setup
├── package.json
└── README.md
```

## API Overview

### Health

- `GET /health`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`

### Profile and onboarding

- `GET /profile/me`
- `PATCH /profile/personal`
- `PATCH /profile/career-goal`
- `PATCH /profile/onboarding-step`
- `GET /profile/completeness`

### Portfolio

- `POST /portfolio/items`
- `GET /portfolio/items`
- `GET /portfolio/items/:id`
- `PATCH /portfolio/items/:id`
- `DELETE /portfolio/items/:id`

### Settings

- `GET /settings`
- `PATCH /settings/notifications`
- `PATCH /settings/profile`
- `PATCH /settings/career-goal`
- `DELETE /settings/account`

## Database

The backend uses PostgreSQL with SQL migrations under `src/db/migrations`.

Current schema areas include:

- `users`
- `portfolio_items`
- `job_targets`
- `resume_generation_jobs`
- `resume_versions`
- `cover_letters`
- `gap_analyses`
- `schema_migrations`

The users and portfolio foundations are already used by the currently wired API surface. The remaining tables support the broader product plan around generation, analytics, and output management.

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- one of:
  - local PostgreSQL
  - Docker Desktop for the Docker Compose database workflow

### Install

```bash
pnpm install
```

### Environment setup

```bash
cp .env.example .env
cp .env.test.example .env.test
```

Fill in required environment variables before starting the app.

## Database Setup Options

### Option A: Local PostgreSQL

Use the local setup workflow documented in:

- [docs/postgres-local-setup.md](./docs/postgres-local-setup.md)

Typical flow:

```bash
pnpm db:local:setup
pnpm db:migrate
pnpm db:check
```

### Option B: Docker Compose PostgreSQL

Use the Docker workflow documented in:

- [docs/docker-postgres-setup.md](./docs/docker-postgres-setup.md)

Typical flow:

```bash
pnpm db:docker:up
pnpm db:migrate
pnpm db:check
```

## Running the Backend

```bash
pnpm dev
```

Production build:

```bash
pnpm build
pnpm start
```

## Scripts

### Application

- `pnpm dev` — start the backend in watch mode
- `pnpm build` — compile TypeScript
- `pnpm start` — run the compiled build
- `pnpm lint` — run ESLint
- `pnpm type-check` — run TypeScript checks

### Testing

- `pnpm test` — run all tests
- `pnpm test:unit` — run unit tests
- `pnpm test:integration` — run integration tests
- `pnpm test:coverage` — run coverage
- `pnpm test:watch` — run Vitest in watch mode

### Database

- `pnpm db:migrate` — apply migrations
- `pnpm db:reset` — reset the current database and rerun migrations
- `pnpm db:check` — smoke-test DB connectivity

### Local PostgreSQL

- `pnpm db:local:setup`
- `pnpm db:local:connect`
- `pnpm db:test:connect`

### Docker PostgreSQL

- `pnpm db:docker:up`
- `pnpm db:docker:down`
- `pnpm db:docker:logs`
- `pnpm db:docker:reset`
- `pnpm db:docker:connect`
- `pnpm db:docker:test:connect`

## Testing

The implemented backend modules are covered with mocked endpoint-level tests under `tests/unit`.

Current test coverage includes:

- auth endpoints
- profile endpoints
- portfolio endpoints
- settings endpoints
- shared middleware
- storage service

Run:

```bash
pnpm vitest
```

## Environment Variables

The application validates environment variables at startup through `src/config/env.ts`.

At minimum, local development expects values for:

- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `GROQ_API_KEY`
- `GEMINI_API_KEY`

Use `.env.example` and `.env.test.example` as the source of truth for required keys and local URL conventions.

## Engineering Notes

### Branching

This project follows a feature-branch workflow. The current repository history reflects a pattern of isolated task commits by module and endpoint.

### Validation style

- Zod schemas define request contracts
- Fastify middleware performs request validation
- shared error classes normalize API error responses

### Backend conventions

- strict TypeScript
- parameterized SQL queries
- safe user responses without `password_hash`
- route protection through JWT middleware
- modular service/controller/route separation

## Product Roadmap Summary

Based on the blueprint and implementation plan, the broader ResumeAI roadmap includes:

1. complete the remaining backend generation and analytics flows
2. connect document ingestion and AI orchestration end to end
3. implement resume generation and PDF delivery
4. implement cover letter generation
5. implement ATS scoring and gap analysis APIs
6. build the frontend application
7. build the browser extension for JD capture
8. evolve from MVP synchronous flows toward fuller production orchestration where needed

## Important Note

This README describes the **complete ResumeAI project direction** while staying honest about the **current repository reality**:

- the **project plan is full-platform**
- the **repository is currently backend-centered**
- the **wired production-ready surface today is a subset of the total planned platform**

That distinction is intentional and matches the project documents in `documents/`.
