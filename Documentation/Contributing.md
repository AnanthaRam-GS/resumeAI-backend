# Contributing

## Workflow

1. Create a feature branch.
2. Keep changes scoped to the feature or fix.
3. Add tests for behavioral changes.
4. Run local checks before opening a PR.
5. Use the PR checklist.

## Required Checks

Backend:

```bash
pnpm type-check
pnpm test:unit
pnpm build
```

Frontend:

```bash
npm run type-check
npm run build
```

## API Changes

- Validate request bodies, params, and query strings with schemas.
- Return safe user-facing errors.
- Never expose secrets, provider payloads, or raw private user content in logs.
- Update frontend endpoint constants and docs when routes change.

## Database Changes

- Use forward-only migrations.
- Include indexes for frequent lookups.
- Add user-scoped uniqueness where duplicate records are possible.
- Avoid destructive changes without a repair/rollback note.

## AI Changes

- Route NVIDIA NIM calls through the shared NIM service.
- Add timeout, retry, validation, and fallback behavior.
- Keep prompts versionable and avoid logging raw resumes or private documents.

## Environment Variables

Every new variable must be added to:

- `src/config/env.ts`
- `.env.example`
- deployment documentation

## Free-App Policy

Do not add billing, checkout, pricing, subscriptions, invoices, paid plans, or payment-provider code.
