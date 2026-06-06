CREATE TABLE IF NOT EXISTS job_targets (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	job_title TEXT NOT NULL,
	company_name TEXT NOT NULL,
	job_description TEXT NOT NULL,
	source_url TEXT,
	ingested_via TEXT NOT NULL DEFAULT 'manual',
	extracted_entities JSONB NOT NULL DEFAULT '{}'::jsonb,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_targets_user_id_idx ON job_targets (user_id);
