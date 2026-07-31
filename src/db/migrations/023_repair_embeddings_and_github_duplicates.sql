-- 023: Repair optional embedding schema drift and add GitHub duplicate metadata.
-- Migration 013 intentionally skipped vector columns when pgvector was not
-- available. Databases that later gained pgvector need a new migration because
-- schema_migrations prevents 013 from being re-run.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  END IF;
END $$;

ALTER TABLE portfolio_items
  ADD COLUMN IF NOT EXISTS embedding_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS embedding_error TEXT,
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_score_reasons JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS manually_edited_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    EXECUTE 'ALTER TABLE portfolio_items ADD COLUMN IF NOT EXISTS embedding vector(768)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS portfolio_items_embedding_idx
      ON portfolio_items USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
      WHERE embedding IS NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS portfolio_items_embedding_status_idx
  ON portfolio_items(user_id, embedding_status);

CREATE INDEX IF NOT EXISTS portfolio_items_embedding_hash_idx
  ON portfolio_items(user_id, embedding_content_hash)
  WHERE embedding_content_hash IS NOT NULL;

ALTER TABLE github_repositories
  ADD COLUMN IF NOT EXISTS owner_login TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_group_key TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_of_github_repo_id BIGINT,
  ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;

CREATE INDEX IF NOT EXISTS github_repositories_duplicate_group_idx
  ON github_repositories(user_id, duplicate_group_key)
  WHERE duplicate_group_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS github_repositories_duplicate_of_idx
  ON github_repositories(user_id, duplicate_of_github_repo_id)
  WHERE duplicate_of_github_repo_id IS NOT NULL;
