CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
	CREATE TYPE resumeai_user_status AS ENUM ('active', 'disabled');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	CREATE TYPE resumeai_portfolio_item_type AS ENUM (
		'experience',
		'project',
		'education',
		'certification',
		'award',
		'skill',
		'volunteer',
		'publication',
		'other'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	CREATE TYPE resumeai_job_target_status AS ENUM ('draft', 'active', 'archived');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	CREATE TYPE resumeai_generation_job_type AS ENUM ('resume', 'cover_letter', 'gap_analysis');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	CREATE TYPE resumeai_generation_job_status AS ENUM (
		'queued',
		'processing',
		'completed',
		'failed',
		'cancelled'
	);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	CREATE TYPE resumeai_resume_version_status AS ENUM ('draft', 'generated', 'published', 'archived');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	CREATE TYPE resumeai_cover_letter_status AS ENUM ('draft', 'generated', 'sent', 'archived');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
	CREATE TYPE resumeai_gap_analysis_status AS ENUM ('pending', 'completed', 'failed');
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
	email TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	full_name TEXT NOT NULL,
	headline TEXT,
	timezone TEXT,
	status resumeai_user_status NOT NULL DEFAULT 'active',
	email_verified_at TIMESTAMPTZ,
	last_login_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();
