-- 010: Add editor HTML storage for WYSIWYG editor
ALTER TABLE resume_versions
  ADD COLUMN IF NOT EXISTS editor_html    TEXT,
  ADD COLUMN IF NOT EXISTS editor_updated_at TIMESTAMPTZ;
