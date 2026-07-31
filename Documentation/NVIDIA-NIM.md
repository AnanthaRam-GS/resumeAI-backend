# NVIDIA NIM

NVIDIA NIM is the primary AI provider for generation and extraction workflows.

## Required Variables

- `NVIDIA_NIM_API_KEY`
- `NVIDIA_NIM_BASE_URL`
- `NVIDIA_NIM_MODEL`

Optional tuning:

- `NVIDIA_NIM_EMBEDDING_MODEL`
- `NVIDIA_NIM_TIMEOUT_MS`
- `NVIDIA_NIM_MAX_RETRIES`
- `NVIDIA_NIM_RATE_LIMIT_PER_MINUTE`
- `NVIDIA_NIM_CACHE_TTL_SECONDS`

## Deployment Notes

- Keep the API key only in backend deployment secrets.
- Do not expose NIM variables to the frontend.
- Production startup validates that either `NVIDIA_NIM_API_KEY` or the legacy `NVIDIA_API_KEY` is set.
- Rate limits and cache TTL should be configured conservatively for free-tier operation.

