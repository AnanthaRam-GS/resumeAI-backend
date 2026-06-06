CREATE TABLE IF NOT EXISTS cover_letters (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	resume_version_id UUID NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
	why_company TEXT,
	tone TEXT NOT NULL DEFAULT 'balanced',
	highlight_note TEXT,
	content_text TEXT,
	pdf_s3_key TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cover_letters_resume_version_id_idx ON cover_letters (resume_version_id);

ALTER TABLE resume_versions
	ADD CONSTRAINT resume_versions_cover_letter_id_fkey
	FOREIGN KEY (cover_letter_id) REFERENCES cover_letters(id) ON DELETE SET NULL;
