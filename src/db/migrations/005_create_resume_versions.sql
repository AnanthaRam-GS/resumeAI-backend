CREATE TABLE IF NOT EXISTS resume_versions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	job_target_id UUID REFERENCES job_targets(id) ON DELETE SET NULL,
	generation_job_id UUID REFERENCES resume_generation_jobs(id) ON DELETE SET NULL,
	version_label TEXT,
	template_id TEXT NOT NULL,
	page_length TEXT NOT NULL DEFAULT '1-page',
	selected_item_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
	generated_content JSONB NOT NULL DEFAULT '{}'::jsonb,
	ats_score NUMERIC(5, 2),
	ats_feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
	pdf_s3_key TEXT,
	cover_letter_id UUID,
	status resumeai_resume_version_status NOT NULL DEFAULT 'draft',
	submitted_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resume_versions_user_id_idx ON resume_versions (user_id);
CREATE INDEX IF NOT EXISTS resume_versions_user_id_status_idx ON resume_versions (user_id, status);
CREATE INDEX IF NOT EXISTS resume_versions_job_target_id_idx ON resume_versions (job_target_id);

DROP TRIGGER IF EXISTS resume_versions_set_updated_at ON resume_versions;
CREATE TRIGGER resume_versions_set_updated_at
BEFORE UPDATE ON resume_versions
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS resume_versions_cover_letter_id_key
	ON resume_versions (cover_letter_id);
