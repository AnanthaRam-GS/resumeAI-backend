CREATE TABLE IF NOT EXISTS gap_analyses (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	job_target_id UUID REFERENCES job_targets(id) ON DELETE SET NULL,
	generation_job_id UUID REFERENCES generation_jobs(id) ON DELETE SET NULL,
	status resumeai_gap_analysis_status NOT NULL DEFAULT 'pending',
	score NUMERIC(5, 2),
	analysis_summary TEXT,
	analysis_data JSONB NOT NULL DEFAULT '{}'::jsonb,
	skill_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
	recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	UNIQUE (job_target_id)
);

CREATE INDEX IF NOT EXISTS gap_analyses_user_id_idx ON gap_analyses (user_id);
CREATE INDEX IF NOT EXISTS gap_analyses_job_target_id_idx ON gap_analyses (job_target_id);
CREATE INDEX IF NOT EXISTS gap_analyses_status_idx ON gap_analyses (status);

DROP TRIGGER IF EXISTS gap_analyses_set_updated_at ON gap_analyses;
CREATE TRIGGER gap_analyses_set_updated_at
BEFORE UPDATE ON gap_analyses
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();
