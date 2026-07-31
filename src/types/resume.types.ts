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

export type MatchCategory = 'excellent' | 'strong' | 'moderate' | 'weak' | 'low';

export interface RankedProject {
  projectId: string;
  title: string;
  rank: number;
  relevanceScore: number;
  priorityScore: number;
  matchCategory: MatchCategory;
  matchedSkills: string[];
  matchedRequirements: string[];
  matchedKeywords: string[];
  missingRelatedKeywords: string[];
  strengthCategory: string;
  reasoning: string;
  recommendedUsage: 'use_in_resume' | 'improve_before_using' | 'supporting_project' | 'not_recommended';
  selectedForResume: boolean;
  componentScores: {
    semanticSimilarity: number;
    skillKeywordMatch: number;
    techStackMatch: number;
    projectQuality: number;
    recency: number;
    impact: number;
    roleAlignment: number;
  };
}

export interface RankedCertification {
  certificationId?: string;
  name: string;
  issuer: string | null;
  rank: number;
  relevanceScore: number;
  matchedRequirements: string[];
  matchedSkills: string[];
  reasoning: string;
  recommendedUsage: 'include' | 'supporting' | 'not_recommended';
}

export interface StrengthMapping {
  assetId?: string;
  assetType: 'project' | 'certification' | 'skill' | 'experience' | 'education' | 'achievement' | 'research_paper';
  title: string;
  relevanceScore: number;
  priorityScore: number;
  matchedRequirements: string[];
  matchedKeywords: string[];
  missingRelatedKeywords: string[];
  strengthCategory: MatchCategory;
  reasoning: string;
  recommendedUsage: string;
  evidence: string[];
}

export interface SkillMatch {
  skill: string;
  status: 'strong_match' | 'explicit_match' | 'inferred_match' | 'weak_support' | 'missing';
  evidence: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface GapRecommendation {
  title: string;
  category:
    | 'skill'
    | 'technology'
    | 'domain'
    | 'certification'
    | 'experience'
    | 'project_type'
    | 'seniority'
    | 'documentation'
    | 'impact'
    | 'keyword';
  priority: 'critical' | 'high' | 'medium' | 'low';
  severity: number;
  whyItMatters: string;
  evidence: string[];
  suggestedAction: string;
  suggestedProjectIdea?: string;
  suggestedCertification?: string;
  suggestedSkill?: string;
  estimatedImpact: 'high' | 'medium' | 'low';
}

export interface ProjectRankingResult {
  rankedProjects: RankedProject[];
  selectedProjects: RankedProject[];
  excludedProjects: RankedProject[];
  selectedProjectIds: string[];
  requestedProjectCount: number;
  availableProjectCount: number;
  notice?: string;
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

// ─── Evidence Level ────────────────────────────────────────────────────────────
// 0 = No mention anywhere
// 1 = Listed in skills section only (no project demonstrates it)
// 2 = Appears in 1+ project descriptions or tech_stack
// 3 = Appears in 2+ projects AND at least one has non-null impact_metrics
export type EvidenceLevel = 0 | 1 | 2 | 3;

export const EVIDENCE_LEVEL_LABELS: Record<EvidenceLevel, string> = {
  0: 'Not found in portfolio',
  1: 'Listed only (undemonstrated)',
  2: 'Demonstrated in projects',
  3: 'Proven with measurable impact',
};

// ─── Pre-computed Gap Evidence (Layer 2 output) ────────────────────────────────
export interface SkillGapEvidence {
  skill: string;
  evidenceLevel: EvidenceLevel;
  evidenceSummary: string;
  supportingProjects: {
    id: string;
    title: string;
    hasImpact: boolean;
    validationScore: number | null;
  }[];
  semanticSimilarityScore: number;
  semanticallySimilarProject: string | null;
  jdFrequency: number;
  priority: 'high' | 'medium' | 'low';
  learningPathOrder: number;
  clusterName: string | null;
}

// ─── Rich Portfolio Evidence (Layer 1 output) ──────────────────────────────────
export interface RichPortfolioProject {
  id: string;
  title: string;
  description: string | null;
  techStack: string[];
  impactMetrics: string | null;
  validationScore: number | null;
  domainCategory: string | null;
  source: 'github' | 'manual' | 'upload';
  endDate: string | null;
  isCurrent: boolean;
  hasEmbedding: boolean;
}

export interface RichPortfolioEvidence {
  projects: RichPortfolioProject[];
  demonstratedSkills: string[];
  listedSkills: string[];
  experience: {
    title: string;
    company: string | null;
    techStack: string[];
    isCurrent: boolean;
  }[];
  certifications: { id?: string; name: string; issuingOrg: string | null }[];
  avgValidationScore: number | null;
  totalProjectCount: number;
  githubProjectCount: number;
}

// ─── Enhanced Missing Skill ────────────────────────────────────────────────────
export interface EnrichedMissingSkill extends MissingSkill {
  evidence_level: EvidenceLevel;
  supporting_projects: string[];
  learning_path_order: number;
  cluster_name: string | null;
  semantic_similarity_score: number;
}

// ─── Enhanced Gap Analysis Row (stored in DB) ──────────────────────────────────
export interface EnhancedGapAnalysisRow extends GapAnalysisRow {
  analysis_mode: 'career_goal' | 'jd_comparison';
  overall_assessment: string | null;
  evidence_data: SkillGapEvidence[];
  jd_snippet: string | null;
  portfolio_snapshot: {
    totalItems: number;
    projectCount: number;
    skillCount: number;
    hasGithubProjects: boolean;
    avgValidationScore: number | null;
  } | null;
  overall_match_score?: number | string | null;
  strengths?: StrengthMapping[];
  ranked_projects?: RankedProject[];
  ranked_certifications?: RankedCertification[];
  skill_matches?: SkillMatch[];
  gaps?: GapRecommendation[];
  selected_project_ids?: string[];
  recommended_project_count?: number | null;
}

// ─── LLM Synthesis Output Shape ───────────────────────────────────────────────
export interface GapAdvisorLLMOutput {
  overall_assessment: string;
  missing_skills: EnrichedMissingSkill[];
  suggested_projects: SuggestedProject[];
  learning_resources: LearningResource[];
}

// ─── Analysis Options ──────────────────────────────────────────────────────────
export interface GapAnalysisOptions {
  jobDescription?: string;
  jobTargetIds?: string[];
  persist?: boolean;
  projectCount?: number;
}
