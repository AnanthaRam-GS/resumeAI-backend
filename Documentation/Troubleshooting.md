# Troubleshooting

## Supabase DNS Fails

Symptom:

```text
getaddrinfo ENOTFOUND db.[PROJECT_REF].supabase.co
```

Check that:

- The project ref is correct.
- The Supabase project is active and not paused/deleted.
- `SUPABASE_DATABASE_URL` uses the correct direct host format.
- If runtime uses a pooler URL, `DIRECT_URL` is still set to the direct database URL for migrations.
- New Supabase direct database hosts can resolve only to IPv6. If your local or deploy network does not support IPv6 egress, use the Supabase session pooler:

```env
SUPABASE_DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require
DIRECT_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require
```

Run:

```bash
pnpm db:diagnose
pnpm db:check
```

This compares the configured project ref with the authenticated Supabase CLI project list and reports stale or inactive projects.
Supabase CLI statuses such as `ACTIVE` and `ACTIVE_HEALTHY` are valid active states.

## Pooler Tenant/User Not Found

Symptom:

```text
tenant/user postgres.[PROJECT_REF] not found
```

Check that the pooler URL, username format, region, and project ref came from the same Supabase project.

## Health Readiness Fails

`GET /health` only verifies the HTTP API is alive. `GET /health/ready` verifies database reachability and returns `503` while Supabase is unreachable.

## Migration Fails

Run:

```bash
pnpm db:check
pnpm db:migrate
```

If runtime uses a pooler URL, set `DIRECT_URL` before running migrations. Prefer a direct URL for migrations when the host resolves and your network supports IPv6; otherwise use the session pooler on port `5432`.

## Final Supabase Setup Checklist

1. Create or resume the Supabase project and copy the current project ref.
2. Set `USE_SUPABASE=true`.
3. Set `SUPABASE_URL=https://[PROJECT_REF].supabase.co`.
4. Set `SUPABASE_DATABASE_URL` and `DIRECT_URL` from the same project. Use the session pooler format if the direct host fails DNS or IPv6 connectivity.
5. Keep `PGSSLMODE=require`.
6. Run `pnpm db:diagnose`, `pnpm db:check`, and `pnpm db:migrate`.
7. Verify `curl http://localhost:3000/health/db` returns `{"success":true,"status":"ok"}`.
8. Test `/auth/register`, `/auth/login`, and `/auth/me` from the frontend origin.
