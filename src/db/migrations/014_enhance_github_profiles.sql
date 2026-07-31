-- 014: Enhance github_profiles with sync metadata and efficiency fields

ALTER TABLE github_profiles
  ADD COLUMN IF NOT EXISTS github_user_id        BIGINT,
  ADD COLUMN IF NOT EXISTS token_scopes          TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sync_error            TEXT,
  ADD COLUMN IF NOT EXISTS repos_discovered      INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repos_processed       INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_scheduled_sync   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS etag_repos_list       TEXT;

-- Stable unique identifier for the GitHub account (survives username renames)
CREATE UNIQUE INDEX IF NOT EXISTS github_profiles_github_user_id_idx
  ON github_profiles(github_user_id)
  WHERE github_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS github_profiles_next_sync_idx
  ON github_profiles(next_scheduled_sync)
  WHERE next_scheduled_sync IS NOT NULL;
