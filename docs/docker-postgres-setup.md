# Docker PostgreSQL Setup

ResumeAI Backend now supports a Docker Compose PostgreSQL setup so both developers can run the same database environment consistently without depending on a machine-specific Homebrew installation.

## Why Docker Setup Exists

- It standardizes the PostgreSQL runtime across the team
- It avoids local machine drift between developers
- It keeps the existing Homebrew workflow available for anyone who intentionally wants it

## Homebrew vs Docker

Homebrew/local PostgreSQL:

- host: `localhost`
- port: `5432`
- suited for developers who already have a stable local PostgreSQL setup

Docker PostgreSQL:

- host: `localhost`
- port: `5433`
- runs PostgreSQL 15 in Docker Compose
- recommended team default to keep both developers aligned

## Recommended Team Default

Use Docker PostgreSQL on host port `5433`.

Docker development URL:

```bash
DATABASE_URL=postgresql://resumeai:resumeai_password@localhost:5433/resumeai_dev
```

Docker test URL:

```bash
DATABASE_URL=postgresql://resumeai:resumeai_password@localhost:5433/resumeai_test
```

## Prerequisites

- Docker Desktop installed and running
- `pnpm` installed

## First-Time Setup

Start PostgreSQL:

```bash
pnpm db:docker:up
```

Create your local env file:

```bash
cp .env.example .env
```

Then fill the required non-database values in `.env`, including:

- `JWT_SECRET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `NVIDIA_API_KEY` for NVIDIA NIM-backed document upload extraction
- `GROQ_API_KEY` when using Groq-backed AI flows outside document upload
- `GEMINI_API_KEY`

Set `DATABASE_URL` in `.env` to the Docker URL:

```bash
DATABASE_URL=postgresql://resumeai:resumeai_password@localhost:5433/resumeai_dev
```

Run migrations, verify the connection, and start the API:

```bash
pnpm db:migrate
pnpm db:check
pnpm dev
```

## Manual Verification

Connect to the Docker development database:

```bash
pnpm db:docker:connect
```

Inside `psql`, run:

```sql
\dt
SELECT filename FROM schema_migrations ORDER BY filename;
```

## Test Database Access

Connect to the Docker test database:

```bash
pnpm db:docker:test:connect
```

Use this test URL when needed:

```bash
DATABASE_URL=postgresql://resumeai:resumeai_password@localhost:5433/resumeai_test
```

## Resetting Docker PostgreSQL

To delete the Docker database volume and recreate both databases:

```bash
pnpm db:docker:reset
pnpm db:migrate
```

## Common Errors

`Docker Desktop not running`

- Start Docker Desktop
- Re-run `pnpm db:docker:up`

`port 5433 already in use`

- Stop the process bound to `5433`
- Or change the mapped host port if the team intentionally updates the standard

`container already exists`

- Run `pnpm db:docker:down`
- Then run `pnpm db:docker:up`

`database missing after reset`

- Re-run `pnpm db:docker:reset`
- Re-run `pnpm db:migrate`

`init scripts not re-running because volume already exists`

- The official PostgreSQL image only runs `docker-entrypoint-initdb.d` scripts on first initialization
- Run `pnpm db:docker:reset` if you need a fresh first-time init

## Important Warning

`pnpm db:docker:reset` runs `docker compose down -v`, which deletes local Docker PostgreSQL data.

## Team Instructions

Both developers should use the same Docker `DATABASE_URL` unless they intentionally choose the Homebrew/local setup:

```bash
DATABASE_URL=postgresql://resumeai:resumeai_password@localhost:5433/resumeai_dev
```
