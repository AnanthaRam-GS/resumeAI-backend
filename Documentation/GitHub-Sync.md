# GitHub Sync

GitHub sync is owned by the backend API. The frontend starts the OAuth flow through `GET /github/connect` and the backend handles callback exchange, encrypted token storage, repository discovery, enrichment, and sync progress.

## Required Variables

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `APP_BASE_URL`
- `FRONTEND_URL`
- `TOKEN_ENCRYPTION_KEY`
- `REDIS_URL`
- `WORKERS_ENABLED=true` when background sync workers should run

## OAuth Callback

Local:

```text
http://localhost:3000/github/callback
```

Production:

```text
https://your-api.example.com/github/callback
```

## Safety Notes

- GitHub tokens are encrypted with `TOKEN_ENCRYPTION_KEY`.
- OAuth state is single-use and backed by Redis.
- Repository imports must stay scoped to the authenticated user.
- Worker failures should surface through sync status and logs without exposing tokens.

