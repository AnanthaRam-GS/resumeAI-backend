# Environment

Use `.env.example` as the safe template for backend configuration. Real `.env` files are ignored and must not be committed.

## Required Backend Variables

- `NODE_ENV`
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
- `RESUME_PARSER_MODE` defaults to `hybrid`; accepted values are `hybrid`, `rule-based`, `rules`, `llm-only`, and `llm`
- `TOKEN_ENCRYPTION_KEY`
- `REDIS_URL`

S3-compatible storage variables are required before uploads or PDF export are enabled in production.

## Optional Integrations

- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `POSTHOG_API_KEY`
- `RESEND_API_KEY`
- `WS_BASE_URL`

## Safety Rules

- Frontend repositories must never receive database URLs, service role keys, AI API keys, GitHub client secrets, Redis URLs, or S3 secrets.
- Production startup rejects `USE_SUPABASE=false`.
- Production startup rejects database URLs that point to localhost.
- Tests use `USE_SUPABASE=false` by default to avoid mutating Supabase.
- Migrations use `DIRECT_URL` when it is set; provide it whenever the runtime database URL uses a Supabase pooler host.
