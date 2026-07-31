-- 015: Create github_repositories staging table
-- This table decouples GitHub API fetching from AI enrichment.
-- Repos are fetched into this table first, then enriched into portfolio_items.
-- Retrying failed enrichment never requires re-hitting the GitHub API.

CREATE TABLE IF NOT EXISTS github_repositories (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- GitHub identifiers (stable numeric id, not the mutable full_name)
  github_repo_id        BIGINT NOT NULL,
  full_name             TEXT NOT NULL,
  name                  TEXT NOT NULL,

  -- Metadata from GitHub API
  description           TEXT,
  html_url              TEXT NOT NULL,
  homepage_url          TEXT,
  primary_language      TEXT,
  language_breakdown    JSONB DEFAULT '{}',
  topics                TEXT[] DEFAULT '{}',
  stars_count           INT DEFAULT 0,
  forks_count           INT DEFAULT 0,
  is_fork               BOOLEAN DEFAULT FALSE,
  is_archived           BOOLEAN DEFAULT FALSE,
  has_readme            BOOLEAN DEFAULT FALSE,

  -- Content fetched for AI enrichment
  readme_content        TEXT,
  file_tree_sample      TEXT[],
  key_files             JSONB DEFAULT '{}',

  -- GitHub timing signals
  github_created_at     TIMESTAMPTZ,
  github_pushed_at      TIMESTAMPTZ NOT NULL,
  commit_count_estimate INT DEFAULT 0,

  -- Enrichment pipeline state machine
  enrichment_status     TEXT NOT NULL DEFAULT 'pending'
                        CHECK (enrichment_status IN
                          ('pending', 'filtered_out', 'processing', 'completed', 'failed')),
  filter_reason         TEXT,
  enrichment_error      TEXT,
  enrichment_attempts   INT DEFAULT 0,
  last_enriched_at      TIMESTAMPTZ,

  -- Link back to the resulting portfolio_items row
  portfolio_item_id     UUID REFERENCES portfolio_items(id) ON DELETE SET NULL,

  -- ETag for conditional GitHub API requests
  etag_readme           TEXT,
  etag_languages        TEXT,

  -- Audit timestamps
  last_fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, github_repo_id)
);

CREATE INDEX IF NOT EXISTS github_repos_user_status_idx
  ON github_repositories(user_id, enrichment_status);

CREATE INDEX IF NOT EXISTS github_repos_pushed_idx
  ON github_repositories(user_id, github_pushed_at DESC);

CREATE INDEX IF NOT EXISTS github_repos_portfolio_item_idx
  ON github_repositories(portfolio_item_id)
  WHERE portfolio_item_id IS NOT NULL;

DROP TRIGGER IF EXISTS github_repositories_set_updated_at ON github_repositories;
CREATE TRIGGER github_repositories_set_updated_at
  BEFORE UPDATE ON github_repositories
  FOR EACH ROW EXECUTE FUNCTION resumeai_set_updated_at();
