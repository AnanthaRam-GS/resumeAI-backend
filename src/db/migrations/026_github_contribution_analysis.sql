-- 026: Add user contribution analysis fields to github_repositories.
-- Tracks how many recent commits the authenticated user made vs. total,
-- the computed contribution level, a short summary, commit ETags, and
-- a sample of the user's commit messages for AI enrichment.

ALTER TABLE github_repositories
  ADD COLUMN IF NOT EXISTS user_commit_count      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_recent_commits   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contribution_level     TEXT
    CHECK (contribution_level IN (
      'primary_author', 'major_contributor', 'contributor',
      'minor_contributor', 'unclear'
    )),
  ADD COLUMN IF NOT EXISTS contribution_summary   TEXT,
  ADD COLUMN IF NOT EXISTS etag_commits           TEXT,
  ADD COLUMN IF NOT EXISTS sample_commit_messages TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS github_repositories_contribution_level_idx
  ON github_repositories(user_id, contribution_level)
  WHERE contribution_level IS NOT NULL;
