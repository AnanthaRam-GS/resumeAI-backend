-- 025: Allow users to re-upload the same resume document for re-parsing.
-- Duplicate portfolio entries are now skipped when applying parsed data.

DROP INDEX IF EXISTS resume_documents_user_file_hash_uidx;
