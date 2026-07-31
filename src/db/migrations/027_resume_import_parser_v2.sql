-- 027: Resume import parser v2 metadata, cache, and apply summary.

ALTER TABLE resume_documents
  ADD COLUMN IF NOT EXISTS parser_version TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS parse_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS parse_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apply_summary JSONB;

CREATE INDEX IF NOT EXISTS resume_documents_user_file_parser_idx
  ON resume_documents (user_id, file_hash, parser_version)
  WHERE parsing_status = 'completed';
