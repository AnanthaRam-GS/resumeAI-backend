CREATE TABLE IF NOT EXISTS cover_letters (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	job_target_id UUID REFERENCES job_targets(id) ON DELETE SET NULL,
	resume_version_id UUID REFERENCES resume_versions(id) ON DELETE SET NULL,
	generation_job_id UUID REFERENCES generation_jobs(id) ON DELETE SET NULL,
	status resumeai_cover_letter_status NOT NULL DEFAULT 'draft',
	title TEXT,
	subject TEXT,
	content TEXT NOT NULL DEFAULT '',
	content_data JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (resume_version_id)
);

CREATE INDEX IF NOT EXISTS cover_letters_user_id_idx ON cover_letters (user_id);
CREATE INDEX IF NOT EXISTS cover_letters_job_target_id_idx ON cover_letters (job_target_id);
CREATE INDEX IF NOT EXISTS cover_letters_resume_version_id_idx ON cover_letters (resume_version_id);
CREATE INDEX IF NOT EXISTS cover_letters_status_idx ON cover_letters (status);

DROP TRIGGER IF EXISTS cover_letters_set_updated_at ON cover_letters;
CREATE TRIGGER cover_letters_set_updated_at
BEFORE UPDATE ON cover_letters
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();
