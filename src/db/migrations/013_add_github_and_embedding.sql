-- 013: Add GitHub sync infrastructure to users, create github_profiles,
--      and add pgvector embedding to portfolio_items

-- Enable pgvector extension when it is available in the current PostgreSQL
-- installation. Local API development can run without vector support; semantic
-- retrieval features require a pgvector-enabled database.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  END IF;
END $$;

-- Add GitHub sync state to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS github_sync_status  TEXT NOT NULL DEFAULT 'idle'
    CHECK (github_sync_status IN ('idle', 'syncing', 'failed')),
  ADD COLUMN IF NOT EXISTS sync_started_at     TIMESTAMPTZ;

-- Create github_profiles table
CREATE TABLE IF NOT EXISTS github_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  github_username     TEXT NOT NULL,
  access_token        TEXT NOT NULL,   -- AES-256-GCM encrypted
  last_synced_at      TIMESTAMPTZ,
  raw_data            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS github_profiles_user_id_idx ON github_profiles(user_id);

DROP TRIGGER IF EXISTS github_profiles_set_updated_at ON github_profiles;
CREATE TRIGGER github_profiles_set_updated_at
  BEFORE UPDATE ON github_profiles
  FOR EACH ROW EXECUTE FUNCTION resumeai_set_updated_at();

-- Add vector embedding column to portfolio_items (768 dims for Gemini
-- text-embedding-004) only when pgvector is installed.
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
