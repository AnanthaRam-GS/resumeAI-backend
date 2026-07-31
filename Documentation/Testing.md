# Testing

Run the backend validation suite from the repository root:

```bash
pnpm type-check
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm build
```

Tests load `.env.test`, which is configured for local PostgreSQL by default so automated tests do not mutate Supabase.

Critical flows to verify manually before production deployment:

- Register and login
- Profile and onboarding update
- Portfolio CRUD
- GitHub OAuth connect, sync, and disconnect
- Gap analysis
- Resume generation
- Resume preview and PDF export
- Settings update
- Logout

