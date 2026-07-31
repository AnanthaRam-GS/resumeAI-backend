-- 022: Free usage limits, applications, ATS benchmarks, analytics/email preferences.

CREATE TABLE IF NOT EXISTS usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, usage_key, period_start)
);

CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  source_url TEXT,
  job_target_id UUID REFERENCES job_targets(id) ON DELETE SET NULL,
  resume_version_id UUID REFERENCES resume_versions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'saved'
    CHECK (status IN ('saved', 'preparing', 'applied', 'interview', 'offer', 'rejected', 'withdrawn')),
  application_date DATE,
  notes TEXT,
  follow_up_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS applications_user_status_idx
  ON applications(user_id, status, created_at DESC);

DROP TRIGGER IF EXISTS applications_set_updated_at ON applications;
CREATE TRIGGER applications_set_updated_at
BEFORE UPDATE ON applications
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();

CREATE TABLE IF NOT EXISTS ats_benchmark_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_category TEXT NOT NULL,
  score_bucket SMALLINT NOT NULL,
  sample_count INT NOT NULL DEFAULT 0,
  average_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role_category, score_bucket)
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS analytics_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS weekly_digest_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unsubscribe_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_weekly_digest_sent_at TIMESTAMPTZ;
