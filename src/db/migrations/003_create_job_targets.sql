CREATE TABLE IF NOT EXISTS job_targets (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	company_name TEXT NOT NULL,
	job_title TEXT NOT NULL,
	job_url TEXT,
	job_description TEXT NOT NULL,
	location TEXT,
	employment_type TEXT,
	status resumeai_job_target_status NOT NULL DEFAULT 'draft',
	priority SMALLINT NOT NULL DEFAULT 0,
	target_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_targets_user_id_idx ON job_targets (user_id);
CREATE INDEX IF NOT EXISTS job_targets_status_idx ON job_targets (status);
CREATE INDEX IF NOT EXISTS job_targets_user_id_status_idx ON job_targets (user_id, status);

DROP TRIGGER IF EXISTS job_targets_set_updated_at ON job_targets;
CREATE TRIGGER job_targets_set_updated_at
BEFORE UPDATE ON job_targets
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();
