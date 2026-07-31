# Production Checklist

## Backend Hosting

Set:

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
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_S3_BUCKET`

Optional:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `POSTHOG_API_KEY`
- `RESEND_API_KEY`

## Frontend Hosting

Set:

- `VITE_API_URL`
- `VITE_WS_URL`
- optional `VITE_POSTHOG_KEY`
- optional `VITE_POSTHOG_HOST`

## Supabase

- Confirm project is active.
- Use a direct database URL for migrations.
- Apply migrations with `pnpm db:migrate`.
- Verify `GET /health/ready`.

## GitHub OAuth

- Callback URL: `https://your-api.example.com/github/callback`
- Frontend redirect domain must match `FRONTEND_URL`.

## Final Gate

Do not deploy until:

- Backend build passes.
- Frontend build passes.
- Tests pass.
- `pnpm db:check` passes against Supabase.
- `pnpm db:migrate` has completed successfully.
- `/health/ready` returns `200`.
