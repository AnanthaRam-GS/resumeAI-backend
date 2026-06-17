export type ResumeVersionStatus = 'draft' | 'submitted' | 'archived';

export type GenerationJobStatus =
  | 'queued'
  | 'analyzing_jd'
  | 'scoring_portfolio'
  | 'generating_content'
  | 'rendering_pdf'
  | 'completed'
  | 'failed';

export interface ResumeVersionRow {
  id: string;
  user_id: string;
  job_target_id: string | null;
  generation_job_id: string | null;
  version_label: string | null;
  template_id: string;
  page_length: string;
  selected_item_ids: string[];
  generated_content: Record<string, unknown>;
  ats_score: string | null;
  ats_feedback: Record<string, unknown>;
  pdf_s3_key: string | null;
  cover_letter_id: string | null;
  status: ResumeVersionStatus;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface GenerationJobRow {
  id: string;
  user_id: string;
  job_target_id: string | null;
  status: GenerationJobStatus;
  current_stage: string | null;
  progress_percent: number;
  error_message: string | null;
  started_at: Date;
  completed_at: Date | null;
}

export interface CoverLetterRow {
  id: string;
  user_id: string;
  resume_version_id: string;
  why_company: string | null;
  tone: string;
  highlight_note: string | null;
  content_text: string | null;
  pdf_s3_key: string | null;
  created_at: Date;
}

export interface GapAnalysisRow {
  id: string;
  user_id: string;
  career_goal: string;
  missing_skills: MissingSkill[];
  suggested_projects: SuggestedProject[];
  learning_resources: LearningResource[];
  generated_at: Date;
}

export interface MissingSkill {
  skill: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
}

export interface SuggestedProject {
  project_type: string;
  description: string;
  skills_addressed: string[];
}

export interface LearningResource {
  resource: string;
  url?: string;
  skill_addressed: string;
}
