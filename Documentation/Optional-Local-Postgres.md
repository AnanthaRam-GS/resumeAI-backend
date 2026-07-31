# Local PostgreSQL Setup

ResumeAI Backend can use a locally installed PostgreSQL server for developer workflows. Docker remains the most portable path because the current migrations require pgvector.

## Required Version

- PostgreSQL 15.x or a compatible local installation
- pgvector installed and available to the target database
- Current reference version on the team machine: `psql (PostgreSQL) 15.15 (Homebrew)`

## Local Database Standard

Development database:

- database: `resumeai_dev`
- user: `resumeai`
- password: `resumeai_password`
- host: `localhost`
- port: `5432`

Test database:

- database: `resumeai_test`
- user: `resumeai`
- password: `resumeai_password`
- host: `localhost`
- port: `5432`

Connection strings:

```bash
USE_SUPABASE=false
LOCAL_DATABASE_URL=postgresql://resumeai:resumeai_password@localhost:5432/resumeai_dev
TEST_DATABASE_URL=postgresql://resumeai:resumeai_password@localhost:5432/resumeai_test
```

## Team Setup Steps

Developer A and Developer B should both run:

```bash
pnpm db:local:setup
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm db:local:setup` does the following:

- checks that `psql` exists
- prints the current PostgreSQL version
- tries to start Homebrew PostgreSQL
- creates the `resumeai` role if needed
- creates `resumeai_dev` and `resumeai_test` if needed
- grants database and schema privileges

If your local PostgreSQL instance requires admin credentials for the default `postgres` database, run:

```bash
POSTGRES_SETUP_URL=postgresql://<admin-user>:<admin-password>@localhost:5432/postgres pnpm db:local:setup
```

## Manual Connection Commands

Connect to the development database:

```bash
pnpm db:local:connect
```

Connect to the test database:

```bash
pnpm db:test:connect
```

## Verifying Tables

Inside `psql`, run:

```sql
\dt
SELECT filename FROM schema_migrations ORDER BY filename;
```

You should see the application tables and the recorded migration filenames.

## Resetting the Database

To reset the currently selected local database and re-run migrations:

```bash
pnpm db:reset
```

## .env Configuration

Your local `.env` should use:

```bash
PORT=3000
NODE_ENV=development
USE_SUPABASE=false
LOCAL_DATABASE_URL=postgresql://resumeai:resumeai_password@localhost:5432/resumeai_dev
TEST_DATABASE_URL=postgresql://resumeai:resumeai_password@localhost:5432/resumeai_test
WORKERS_ENABLED=false
JWT_SECRET=your-local-jwt-secret-with-at-least-32-characters
JWT_EXPIRES_IN=7d
AWS_ACCESS_KEY_ID=your-local-aws-key
AWS_SECRET_ACCESS_KEY=your-local-aws-secret
AWS_REGION=your-aws-region
AWS_S3_BUCKET=your-local-or-shared-dev-bucket
NVIDIA_API_KEY=your-nvidia-key
GROQ_API_KEY=your-groq-key
GEMINI_API_KEY=your-gemini-key
```

`NVIDIA_API_KEY` is required for document upload extraction. `GROQ_API_KEY` remains for other AI modules that still use Groq.

## .env.test Configuration

Your local `.env.test` should use:

```bash
NODE_ENV=test
PORT=3001
USE_SUPABASE=false
LOCAL_DATABASE_URL=postgresql://resumeai:resumeai_password@localhost:5432/resumeai_test
TEST_DATABASE_URL=postgresql://resumeai:resumeai_password@localhost:5432/resumeai_test
JWT_SECRET=test-jwt-secret-that-is-at-least-32-characters-long
JWT_EXPIRES_IN=1h
AWS_ACCESS_KEY_ID=test-key
AWS_SECRET_ACCESS_KEY=test-secret
AWS_REGION=us-east-1
AWS_S3_BUCKET=resumeai-test-bucket
NVIDIA_API_KEY=test-nvidia-key
GROQ_API_KEY=test-groq-key
GEMINI_API_KEY=test-gemini-key
```

The document upload path stores original files in S3 and persists extracted portfolio items in PostgreSQL using the same schema as manual portfolio entry.

## Common Errors

`role "resumeai" does not exist`

- Run `pnpm db:local:setup`
- If it still fails, connect to `postgres` as a superuser and run `scripts/setup-local-postgres.sql` manually

`database "resumeai_dev" does not exist`

- Run `pnpm db:local:setup`
- Confirm the setup script completed without errors

`connection refused`

- Make sure PostgreSQL is running
- Retry `pnpm db:local:setup`
- If Homebrew service startup fails, run `brew services start postgresql@15` manually

`extension "vector" is not available`

- Install pgvector for your local PostgreSQL version
- Or use the Docker setup with `pnpm db:docker:init`

`port already in use`

- Check whether another PostgreSQL instance is bound to `5432`
- Align the local running instance to the team standard or update your local PostgreSQL service configuration

`permission denied`

- Re-run the setup script using a PostgreSQL superuser connection to `postgres`
- Example: `POSTGRES_SETUP_URL=postgresql://<admin-user>:<admin-password>@localhost:5432/postgres pnpm db:local:setup`
- Confirm the `resumeai` role was granted access to both databases and the `public` schema

## Important Warning

This setup is for local development only. Production and staging should use Supabase or another managed PostgreSQL service later.
