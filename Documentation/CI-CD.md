# CI/CD

The backend GitHub Actions workflow runs on pushes and pull requests to `main` and `develop`.

Required checks:

- Install dependencies with `pnpm install --frozen-lockfile`
- Lint
- Type check
- Unit tests
- Production build

CI must use safe placeholder environment values only. Real Supabase, AI provider, GitHub OAuth, Redis, and storage secrets belong in the deployment platform or GitHub Actions secrets when a job explicitly needs them.

