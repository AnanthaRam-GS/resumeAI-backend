CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
	CREATE TYPE resumeai_portfolio_item_type AS ENUM ('project', 'experience', 'education', 'skill', 'certification');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	CREATE TYPE resumeai_portfolio_item_source AS ENUM ('manual', 'upload', 'github');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	CREATE TYPE resumeai_resume_generation_job_status AS ENUM (
		'queued',
		'analyzing_jd',
		'scoring_portfolio',
		'generating_content',
		'rendering_pdf',
		'completed',
		'failed'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	CREATE TYPE resumeai_resume_version_status AS ENUM ('draft', 'submitted', 'archived');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION resumeai_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	NEW.updated_at = NOW();
	RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS users (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	full_name TEXT NOT NULL,
	email TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	university TEXT,
	graduation_year SMALLINT,
	target_role_category TEXT,
	career_goal TEXT,
	onboarding_step SMALLINT NOT NULL DEFAULT 1,
	onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
	profile_photo_s3_key TEXT,
	notif_gap_digest BOOLEAN NOT NULL DEFAULT TRUE,
	notif_gen_complete BOOLEAN NOT NULL DEFAULT FALSE,
	notif_sync_complete BOOLEAN NOT NULL DEFAULT TRUE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();
