CREATE TABLE IF NOT EXISTS resume_versions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	job_target_id UUID REFERENCES job_targets(id) ON DELETE SET NULL,
	generation_job_id UUID REFERENCES generation_jobs(id) ON DELETE SET NULL,
	version_label TEXT NOT NULL,
	status resumeai_resume_version_status NOT NULL DEFAULT 'draft',
	ats_score NUMERIC(5, 2),
	resume_data JSONB NOT NULL DEFAULT '{}'::jsonb,
	rendered_file_key TEXT,
	rendered_file_url TEXT,
	notes TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (user_id, version_label)
);

CREATE INDEX IF NOT EXISTS resume_versions_user_id_idx ON resume_versions (user_id);
CREATE INDEX IF NOT EXISTS resume_versions_job_target_id_idx ON resume_versions (job_target_id);
CREATE INDEX IF NOT EXISTS resume_versions_generation_job_id_idx ON resume_versions (generation_job_id);
CREATE INDEX IF NOT EXISTS resume_versions_status_idx ON resume_versions (status);

DROP TRIGGER IF EXISTS resume_versions_set_updated_at ON resume_versions;
CREATE TRIGGER resume_versions_set_updated_at
BEFORE UPDATE ON resume_versions
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();
