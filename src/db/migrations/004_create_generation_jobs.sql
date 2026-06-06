CREATE TABLE IF NOT EXISTS resume_generation_jobs (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	job_target_id UUID REFERENCES job_targets(id) ON DELETE SET NULL,
	status resumeai_resume_generation_job_status NOT NULL DEFAULT 'queued',
	current_stage TEXT,
	progress_percent SMALLINT NOT NULL DEFAULT 0,
	error_message TEXT,
	started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS resume_generation_jobs_user_id_idx ON resume_generation_jobs (user_id);
