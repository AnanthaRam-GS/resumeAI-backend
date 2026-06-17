import { pool } from '../../db/client.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { requestGeminiJson } from '../../services/gemini.service.js';
import { gapAdvisorPrompt } from '../ai/prompts/gap-advisor.prompt.js';
import type { GapAnalysisRow, MissingSkill, SuggestedProject, LearningResource } from '../../types/resume.types.js';

type GapAnalysisPayload = {
  careerGoal: string;
  portfolioSummary: {
    skills: string[];
    techStack: string[];
    projectDomains: string[];
    experienceSummary: string[];
    certifications: string[];
  };
};

type GeminiGapOutput = {
  missing_skills?: MissingSkill[];
  suggested_projects?: SuggestedProject[];
  learning_resources?: LearningResource[];
};

const ALLOWED_PRIORITIES = new Set(['high', 'medium', 'low']);

const normalizePriority = (p: string): MissingSkill['priority'] =>
  ALLOWED_PRIORITIES.has(p) ? (p as MissingSkill['priority']) : 'medium';

const normalizeOutput = (raw: GeminiGapOutput): {
  missing_skills: MissingSkill[];
  suggested_projects: SuggestedProject[];
  learning_resources: LearningResource[];
} => ({
  missing_skills: (raw.missing_skills ?? [])
    .slice(0, 8)
    .map((s) => ({ ...s, priority: normalizePriority(s.priority) })),
  suggested_projects: (raw.suggested_projects ?? []).slice(0, 5),
  learning_resources: (raw.learning_resources ?? []).slice(0, 6),
});

export const runGapAnalysis = async (userId: string): Promise<GapAnalysisRow> => {
  // Fetch user career goal
  const userResult = await pool.query<{ career_goal: string | null }>(
    `SELECT career_goal FROM users WHERE id = $1`,
    [userId],
  );
  const user = userResult.rows[0];
  if (!user) throw new NotFoundError('User not found');

  const careerGoal = user.career_goal?.trim();
  if (!careerGoal) {
    throw new ValidationError('Career goal must be set before running gap analysis');
  }

  // Fetch portfolio summary
  const itemsResult = await pool.query<{
    type: string;
    title: string;
    tech_stack: string[] | null;
    skill_name: string | null;
    domain_category: string | null;
    company_name: string | null;
    issuing_org: string | null;
  }>(
    `SELECT type, title, tech_stack, skill_name, domain_category, company_name, issuing_org
     FROM portfolio_items
     WHERE user_id = $1`,
    [userId],
  );

  const items = itemsResult.rows;
  const skills = items
    .filter((i) => i.type === 'skill' && i.skill_name)
    .map((i) => i.skill_name!);
  const techStack = Array.from(
    new Set(items.flatMap((i) => i.tech_stack ?? [])),
  );
  const projectDomains = items
    .filter((i) => i.type === 'project' && i.domain_category)
    .map((i) => i.domain_category!);
  const experienceSummary = items
    .filter((i) => i.type === 'experience')
    .map((i) => `${i.title} at ${i.company_name ?? 'company'}`);
  const certifications = items
    .filter((i) => i.type === 'certification')
    .map((i) => `${i.title} by ${i.issuing_org ?? ''}`);

  const payload: GapAnalysisPayload = {
    careerGoal,
    portfolioSummary: { skills, techStack, projectDomains, experienceSummary, certifications },
  };

  const raw = await requestGeminiJson<GeminiGapOutput>({
    systemPrompt: gapAdvisorPrompt,
    userPrompt: JSON.stringify(payload),
    maxOutputTokens: 1536,
    temperature: 0.3,
  });

  const normalized = normalizeOutput(raw);

  // Upsert — one row per user
  const result = await pool.query<GapAnalysisRow>(
    `INSERT INTO gap_analyses (user_id, career_goal, missing_skills, suggested_projects, learning_resources, generated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       career_goal = EXCLUDED.career_goal,
       missing_skills = EXCLUDED.missing_skills,
       suggested_projects = EXCLUDED.suggested_projects,
       learning_resources = EXCLUDED.learning_resources,
       generated_at = NOW()
     RETURNING *`,
    [
      userId,
      careerGoal,
      JSON.stringify(normalized.missing_skills),
      JSON.stringify(normalized.suggested_projects),
      JSON.stringify(normalized.learning_resources),
    ],
  );

  return result.rows[0]!;
};

export const getLatestGapAnalysis = async (userId: string): Promise<GapAnalysisRow> => {
  const result = await pool.query<GapAnalysisRow>(
    `SELECT * FROM gap_analyses WHERE user_id = $1`,
    [userId],
  );

  const analysis = result.rows[0];
  if (!analysis) throw new NotFoundError('No gap analysis found. Run POST /analytics/gap-analysis first.');
  return analysis;
};
