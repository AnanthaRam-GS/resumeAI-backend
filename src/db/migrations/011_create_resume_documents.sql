-- 011: Resume document tracking for upload history and duplicate detection

DO $$
BEGIN
  CREATE TYPE resumeai_parsing_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE resumeai_import_source AS ENUM ('portfolio', 'onboarding');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS resume_documents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_filename       TEXT NOT NULL,
  storage_key             TEXT NOT NULL,
  mime_type               TEXT NOT NULL,
  file_size               INTEGER NOT NULL,
  file_hash               TEXT NOT NULL,
  canonical_content_hash  TEXT,
  extracted_text          TEXT,
  parsing_status          resumeai_parsing_status NOT NULL DEFAULT 'completed',
  parsing_error           TEXT,
  parsed_data             JSONB,
  upload_source           resumeai_import_source NOT NULL DEFAULT 'portfolio',
  version_number          INTEGER NOT NULL DEFAULT 1,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent same user uploading identical binary file twice
CREATE UNIQUE INDEX IF NOT EXISTS resume_documents_user_file_hash_uidx
  ON resume_documents (user_id, file_hash);

-- Fast lookup for content duplicate check
CREATE INDEX IF NOT EXISTS resume_documents_user_content_hash_idx
  ON resume_documents (user_id, canonical_content_hash);

CREATE INDEX IF NOT EXISTS resume_documents_user_id_idx
  ON resume_documents (user_id);

CREATE INDEX IF NOT EXISTS resume_documents_parsing_status_idx
  ON resume_documents (parsing_status);

DROP TRIGGER IF EXISTS resume_documents_set_updated_at ON resume_documents;
CREATE TRIGGER resume_documents_set_updated_at
BEFORE UPDATE ON resume_documents
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();
