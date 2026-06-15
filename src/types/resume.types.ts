export interface ResumeExperienceSection {
  company: string;
  role: string;
  location?: string | null;
  startDate: string;
  endDate?: string | null;
  isCurrent?: boolean;
  bullets: string[];
}

export interface ResumeProjectSection {
  name: string;
  url?: string | null;
  tech: string[];
  bullets: string[];
}

export interface ResumeEducationSection {
  institution: string;
  degree: string;
  fieldOfStudy?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  gpa?: string | null;
  achievements?: string | null;
}

export interface ResumeCertificationSection {
  name: string;
  issuer: string;
  date?: string | null;
  url?: string | null;
}

export interface GeneratedResumeContent {
  summary: string;
  experience: ResumeExperienceSection[];
  projects: ResumeProjectSection[];
  education: ResumeEducationSection[];
  skills: Record<string, string[]>;
  certifications?: ResumeCertificationSection[];
  atsKeywordsUsed?: string[];
}

export interface ResumeUserInfo {
  fullName: string;
  email: string;
  university?: string | null;
  graduationYear?: number | null;
}

export interface ResumeRenderData {
  user: ResumeUserInfo;
  jobTitle: string;
  companyName: string;
  content: GeneratedResumeContent;
}

export type TemplateId = 'modern' | 'academic' | 'minimal';
export type PageLength = '1-page' | '1.5-page';
export type ResumeVersionStatus = 'draft' | 'submitted' | 'archived';

export type GenerationJobStatus =
  | 'queued'
  | 'analyzing_jd'
  | 'scoring_portfolio'
  | 'generating_content'
  | 'rendering_pdf'
  | 'completed'
  | 'failed';

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

export interface ResumeVersionRow {
  id: string;
  user_id: string;
  job_target_id: string | null;
  generation_job_id: string | null;
  version_label: string | null;
  template_id: string;
  page_length: string;
  selected_item_ids: string[];
  generated_content: GeneratedResumeContent;
  ats_score: string | null;
  ats_feedback: {
    foundKeywords: string[];
    missingKeywords: string[];
    suggestions: string[];
  };
  pdf_s3_key: string | null;
  cover_letter_id: string | null;
  status: ResumeVersionStatus;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface JobTargetRow {
  id: string;
  user_id: string;
  job_title: string;
  company_name: string;
  job_description: string;
  source_url: string | null;
  ingested_via: string;
  extracted_entities: Record<string, unknown>;
  created_at: Date;
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
  missing_skills: Array<{ skill: string; priority: string; reason: string }>;
  suggested_projects: Array<{
    projectType: string;
    description: string;
    skillsAddressed: string[];
  }>;
  learning_resources: Array<{ resource: string; url: string; skillAddressed: string }>;
  generated_at: Date;
}

export interface UserProfileRow {
  id: string;
  full_name: string;
  email: string;
  university: string | null;
  graduation_year: number | null;
  target_role_category: string | null;
  career_goal: string | null;
}
