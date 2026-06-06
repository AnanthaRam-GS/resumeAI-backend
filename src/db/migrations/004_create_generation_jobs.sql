CREATE TABLE IF NOT EXISTS generation_jobs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	job_target_id UUID REFERENCES job_targets(id) ON DELETE SET NULL,
	job_type resumeai_generation_job_type NOT NULL,
	status resumeai_generation_job_status NOT NULL DEFAULT 'queued',
	input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
	output_data JSONB NOT NULL DEFAULT '{}'::jsonb,
	error_message TEXT,
	attempt_count INTEGER NOT NULL DEFAULT 0,
	started_at TIMESTAMPTZ,
	completed_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS generation_jobs_user_id_idx ON generation_jobs (user_id);
CREATE INDEX IF NOT EXISTS generation_jobs_status_idx ON generation_jobs (status);
CREATE INDEX IF NOT EXISTS generation_jobs_job_target_id_idx ON generation_jobs (job_target_id);
CREATE INDEX IF NOT EXISTS generation_jobs_job_type_idx ON generation_jobs (job_type);

DROP TRIGGER IF EXISTS generation_jobs_set_updated_at ON generation_jobs;
CREATE TRIGGER generation_jobs_set_updated_at
BEFORE UPDATE ON generation_jobs
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();
