# ResumeAI Backend

AI-powered resume generation API built with Fastify, PostgreSQL,
and free-tier LLMs (Groq + Gemini).

## Prerequisites

- Node.js 20.x LTS
- pnpm 9.x
- PostgreSQL 16 (Supabase or local Docker)

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment file and fill in credentials
cp .env.example .env

# 3. Run database migrations
pnpm db:migrate

# 4. Start development server
pnpm dev
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start server with hot reload |
| `pnpm build` | Compile TypeScript |
| `pnpm lint` | Run ESLint |
| `pnpm type-check` | TypeScript check |
| `pnpm test` | Run all tests |
| `pnpm db:migrate` | Apply DB migrations |

## Developer Assignment

- **Developer A:** Auth, Profile, Portfolio, Documents, Settings
- **Developer B:** AI Pipeline, Resume Generation, Cover Letter, Analytics

## Branch Strategy

- `main` — production only
- `develop` — integration branch
- `feature/*` — individual task branches