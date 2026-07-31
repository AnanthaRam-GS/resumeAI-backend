# Database

ResumeAI uses PostgreSQL through `pg` and SQL migrations in `src/db/migrations`.

## Migration Commands

```bash
pnpm db:migrate
pnpm db:check
pnpm db:supabase:init
```

`pnpm db:supabase:init` runs migrations against Supabase and then verifies runtime database connectivity. Migrations use `DIRECT_URL` when it is set, otherwise they use the selected runtime database URL.

## Migration Tracking

Applied migrations are stored in `schema_migrations`. Migration files are copied into `dist/db/migrations` during `pnpm build` so deployment-time migration commands can run from compiled output.

Use a direct Supabase PostgreSQL URL for migrations when the host resolves and your network supports IPv6. If the app runtime uses a Supabase pooler URL and the direct host is unreachable, set `DIRECT_URL` to the session pooler on port `5432`.

## Local Development

Local PostgreSQL and Docker PostgreSQL are optional. Use them only with:

```env
USE_SUPABASE=false
LOCAL_DATABASE_URL=postgresql://...
```

The seed script refuses to seed Supabase unless explicitly run with `--allow-supabase`.
