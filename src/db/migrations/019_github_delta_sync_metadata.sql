-- 019: Add GitHub delta-sync metadata and durable sync run summaries.

ALTER TABLE github_repositories
  ADD COLUMN IF NOT EXISTS repo_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS metadata_hash TEXT,
  ADD COLUMN IF NOT EXISTS readme_hash TEXT,
  ADD COLUMN IF NOT EXISTS languages_hash TEXT,
  ADD COLUMN IF NOT EXISTS key_files_hash TEXT,
  ADD COLUMN IF NOT EXISTS commits_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_or_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_sync_state TEXT
    CHECK (last_sync_state IN ('new', 'updated', 'skipped', 'filtered', 'failed', 'deleted')),
  ADD COLUMN IF NOT EXISTS last_sync_run_id UUID;

CREATE INDEX IF NOT EXISTS github_repositories_content_hash_idx
  ON github_repositories(user_id, repo_content_hash)
  WHERE repo_content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS github_repositories_last_sync_state_idx
  ON github_repositories(user_id, last_sync_state);

CREATE TABLE IF NOT EXISTS github_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('manual', 'post_connect', 'periodic')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  imported_count INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  filtered_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  deleted_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS github_sync_runs_user_created_idx
  ON github_sync_runs(user_id, created_at DESC);
