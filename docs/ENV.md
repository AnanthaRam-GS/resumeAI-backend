# Environment variables

This project reads environment variables from `.env` (or `.env.test` when running tests).
Copy `.env.example` to `.env` and fill in real values before running the server locally.

Required variables (see `src/config/env.ts`):

- `PORT` - HTTP port (default 3000)
- `NODE_ENV` - `development`, `test`, or `production`
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - secret for signing JWTs (min 32 characters)
- `JWT_EXPIRES_IN` - JWT expiry (e.g. `7d`)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` - S3 storage for PDFs
- `GROQ_API_KEY` - Groq SDK API key
- `GEMINI_API_KEY` - Google Gemini API key

Testing notes
- The test environment uses `.env.test`. See `tests/setup.ts` which loads `.env.test`.
- To run the unit and integration tests locally:

```bash
pnpm install
pnpm type-check
pnpm vitest
```

Integration tests may mock external clients (LLMs, S3). Do not commit production credentials.

Security
- Keep credentials out of source control. Use a secret manager or CI-provided secrets for CI runs.
