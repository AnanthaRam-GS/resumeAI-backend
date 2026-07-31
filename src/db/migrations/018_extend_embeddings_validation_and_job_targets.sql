-- 018: Extend embedding metadata, validation metadata, job-target ingestion fields,
--      and multilingual generation metadata.

ALTER TABLE portfolio_items
  ADD COLUMN IF NOT EXISTS embedding_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS embedding_error TEXT,
  ADD COLUMN IF NOT EXISTS embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_score_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_score_reasons JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS manually_edited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS portfolio_items_embedding_status_idx
  ON portfolio_items(user_id, embedding_status);

CREATE INDEX IF NOT EXISTS portfolio_items_embedding_hash_idx
  ON portfolio_items(user_id, embedding_content_hash)
  WHERE embedding_content_hash IS NOT NULL;

ALTER TABLE job_targets
  ADD COLUMN IF NOT EXISTS source_platform TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS normalized_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS source_url_hash TEXT,
  ADD COLUMN IF NOT EXISTS embedding_content_hash TEXT,
  ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS embedding_error TEXT,
  ADD COLUMN IF NOT EXISTS output_language TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS job_targets_user_content_hash_uidx
  ON job_targets(user_id, normalized_content_hash)
  WHERE normalized_content_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS job_targets_user_source_url_hash_uidx
  ON job_targets(user_id, source_url_hash)
  WHERE source_url_hash IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    EXECUTE 'ALTER TABLE job_targets ADD COLUMN IF NOT EXISTS jd_embedding vector(768)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS job_targets_embedding_idx
      ON job_targets USING ivfflat (jd_embedding vector_cosine_ops)
      WITH (lists = 100)
      WHERE jd_embedding IS NOT NULL';
  END IF;
END $$;

ALTER TABLE resume_versions
  ADD COLUMN IF NOT EXISTS output_language TEXT NOT NULL DEFAULT 'en';

ALTER TABLE cover_letters
  ADD COLUMN IF NOT EXISTS output_language TEXT NOT NULL DEFAULT 'en';
