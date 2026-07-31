-- 017: Enhance gap_analyses with evidence data and analysis metadata
-- Additive migration only — existing columns are not modified.

ALTER TABLE gap_analyses
  ADD COLUMN IF NOT EXISTS analysis_mode      TEXT NOT NULL DEFAULT 'career_goal'
                                              CHECK (analysis_mode IN ('career_goal', 'jd_comparison')),
  ADD COLUMN IF NOT EXISTS overall_assessment TEXT,
  ADD COLUMN IF NOT EXISTS evidence_data      JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS jd_snippet         TEXT,
  ADD COLUMN IF NOT EXISTS portfolio_snapshot JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS gap_analyses_mode_idx ON gap_analyses(user_id, analysis_mode);
