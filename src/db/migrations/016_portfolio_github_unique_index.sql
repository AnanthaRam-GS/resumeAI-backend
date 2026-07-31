-- 016: Add partial unique index for GitHub portfolio items deduplication
-- Required for ON CONFLICT upsert in the enrichment worker

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_items_github_repo_unique
  ON portfolio_items (user_id, (extra->>'github_repo_id'))
  WHERE extra->>'github_repo_id' IS NOT NULL;
