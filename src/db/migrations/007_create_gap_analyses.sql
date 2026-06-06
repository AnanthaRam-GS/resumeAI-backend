CREATE TABLE IF NOT EXISTS gap_analyses (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
	career_goal TEXT NOT NULL,
	missing_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
	suggested_projects JSONB NOT NULL DEFAULT '[]'::jsonb,
	learning_resources JSONB NOT NULL DEFAULT '[]'::jsonb,
	generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
