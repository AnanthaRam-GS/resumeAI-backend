-- 020: LinkedIn data export import batches and preview records.

ALTER TYPE resumeai_portfolio_item_source ADD VALUE IF NOT EXISTS 'linkedin_import';

CREATE TABLE IF NOT EXISTS linkedin_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview_ready'
    CHECK (status IN ('uploaded', 'processing', 'preview_ready', 'applied', 'discarded', 'failed')),
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  parsed_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, file_hash)
);

CREATE INDEX IF NOT EXISTS linkedin_import_batches_user_created_idx
  ON linkedin_import_batches(user_id, created_at DESC);

DROP TRIGGER IF EXISTS linkedin_import_batches_set_updated_at ON linkedin_import_batches;
CREATE TRIGGER linkedin_import_batches_set_updated_at
BEFORE UPDATE ON linkedin_import_batches
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();

CREATE TABLE IF NOT EXISTS linkedin_import_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES linkedin_import_batches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  record_type resumeai_portfolio_item_type NOT NULL,
  normalized_hash TEXT NOT NULL,
  normalized_data JSONB NOT NULL,
  duplicate_portfolio_item_id UUID REFERENCES portfolio_items(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'preview'
    CHECK (status IN ('preview', 'selected', 'skipped_duplicate', 'applied', 'failed')),
  error_message TEXT,
  created_portfolio_item_id UUID REFERENCES portfolio_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS linkedin_import_records_batch_idx
  ON linkedin_import_records(batch_id);

CREATE INDEX IF NOT EXISTS linkedin_import_records_user_hash_idx
  ON linkedin_import_records(user_id, normalized_hash);
