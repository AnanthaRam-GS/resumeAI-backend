-- 012: Add simhash fingerprint for near-duplicate detection
--      and expose parsing_error for async background processing visibility

ALTER TABLE resume_documents
  ADD COLUMN IF NOT EXISTS simhash_fingerprint TEXT;

-- Near-duplicate lookup index: we scan per-user only (small result set)
CREATE INDEX IF NOT EXISTS resume_documents_user_simhash_idx
  ON resume_documents (user_id, simhash_fingerprint)
  WHERE simhash_fingerprint IS NOT NULL;
