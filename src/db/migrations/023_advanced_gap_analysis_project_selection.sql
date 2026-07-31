-- 023: Persist advanced gap-analysis rankings and top-N project selection.

ALTER TABLE gap_analyses
  ADD COLUMN IF NOT EXISTS overall_match_score NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ranked_projects JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ranked_certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS skill_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_project_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS recommended_project_count INT NOT NULL DEFAULT 3;

CREATE INDEX IF NOT EXISTS gap_analyses_user_generated_at_idx
  ON gap_analyses(user_id, generated_at DESC);
