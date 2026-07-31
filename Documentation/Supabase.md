# Supabase

Supabase PostgreSQL is the primary database for this project.

## Required Configuration

```env
USE_SUPABASE=true
SUPABASE_DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require
DIRECT_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require
PGSSLMODE=require
```

Use the direct database URL for migrations when your network can reach `db.[PROJECT_REF].supabase.co`. New Supabase direct database hosts may be IPv6-only; if the direct host cannot be resolved or reached, use the session pooler on port `5432` for both `SUPABASE_DATABASE_URL` and `DIRECT_URL`.

## Verification

```bash
pnpm db:check
pnpm db:migrate
curl http://localhost:3000/health/db
curl http://localhost:3000/health/ready
```

Health responses confirm availability without exposing database hostnames, usernames, or credentials.

## RLS

The current app accesses PostgreSQL through the backend API rather than directly from the browser Supabase client. User isolation is enforced in backend auth middleware and user-scoped SQL queries. If direct Supabase client queries are added later, enable Row Level Security and document policies here before exposing data to the anon key.
