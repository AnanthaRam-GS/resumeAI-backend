import { pool } from '../../db/client.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { requestGeminiJson } from '../../services/gemini.service.js';
import { gapAdvisorPrompt } from '../ai/prompts/gap-advisor.prompt.js';
import { fetchUserProfile, fetchPortfolioItems } from '../resume/resume.service.js';
import type { GapAnalysisRow } from '../../types/resume.types.js';

const GAP_ANALYSIS_STALE_DAYS = 7;

interface GapAnalysisOutput {
  missingSkills: Array<{ skill: string; priority: string; reason: string }>;
  suggestedProjects: Array<{
    projectType: string;
    description: string;
    skillsAddressed: string[];
  }>;
  learningResources: Array<{ resource: string; url: string; skillAddressed: string }>;
}

const buildPortfolioSummary = (
  items: Awaited<ReturnType<typeof fetchPortfolioItems>>,
): string => {
  const skills = items
    .filter((i) => i.type === 'skill' && i.skill_name)
    .map((i) => i.skill_name as string);

  const techStack = Array.from(
    new Set(items.flatMap((i) => i.tech_stack ?? [])),
  );

  const domains = Array.from(
    new Set(items.filter((i) => i.domain_category).map((i) => i.domain_category as string)),
  );

  const experienceSummary = items
    .filter((i) => i.type === 'experience')
    .map((i) => `${i.title}${i.company_name ? ` at ${i.company_name}` : ''}`)
    .join(', ');

  const projectSummary = items
    .filter((i) => i.type === 'project')
    .map((i) => i.title)
    .join(', ');

  const educationSummary = items
    .filter((i) => i.type === 'education')
    .map((i) => `${i.degree ?? ''} at ${i.institution_name ?? ''}`.trim())
    .join(', ');

  const certsSummary = items
    .filter((i) => i.type === 'certification')
    .map((i) => i.title)
    .join(', ');

  return [
    skills.length ? `Skills: ${skills.join(', ')}` : null,
    techStack.length ? `Tech Stack: ${techStack.join(', ')}` : null,
    domains.length ? `Project Domains: ${domains.join(', ')}` : null,
    experienceSummary ? `Experience: ${experienceSummary}` : null,
    projectSummary ? `Projects: ${projectSummary}` : null,
    educationSummary ? `Education: ${educationSummary}` : null,
    certsSummary ? `Certifications: ${certsSummary}` : null,
  ]
    .filter(Boolean)
    .join('\n');
};

export const runGapAnalysis = async (userId: string): Promise<GapAnalysisRow> => {
  const [userProfile, portfolioItems] = await Promise.all([
    fetchUserProfile(userId),
    fetchPortfolioItems(userId),
  ]);

  if (!userProfile.career_goal) {
    throw new AppError(
      'Career goal is required to run gap analysis. Please set it in your profile.',
      422,
    );
  }

  const userPrompt = `Career Goal: ${userProfile.career_goal}

Current Portfolio:
${buildPortfolioSummary(portfolioItems)}`;

  const output = await requestGeminiJson<GapAnalysisOutput>({
    systemPrompt: gapAdvisorPrompt,
    userPrompt,
    temperature: 0.3,
    maxTokens: 2000,
  });

  const result = await pool.query<GapAnalysisRow>(
    `INSERT INTO gap_analyses (user_id, career_goal, missing_skills, suggested_projects, learning_resources, generated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       career_goal       = EXCLUDED.career_goal,
       missing_skills    = EXCLUDED.missing_skills,
       suggested_projects = EXCLUDED.suggested_projects,
       learning_resources = EXCLUDED.learning_resources,
       generated_at      = EXCLUDED.generated_at
     RETURNING *`,
    [
      userId,
      userProfile.career_goal,
      JSON.stringify(output.missingSkills ?? []),
      JSON.stringify(output.suggestedProjects ?? []),
      JSON.stringify(output.learningResources ?? []),
    ],
  );

  const row = result.rows[0];
  if (!row) throw new AppError('Failed to save gap analysis', 500);
  return row;
};

export const getLatestGapAnalysis = async (
  userId: string,
): Promise<GapAnalysisRow & { isStale: boolean }> => {
  const result = await pool.query<GapAnalysisRow>(
    `SELECT * FROM gap_analyses WHERE user_id = $1 LIMIT 1`,
    [userId],
  );

  const row = result.rows[0];
  if (!row) throw new NotFoundError('No gap analysis found. Run POST /analytics/gap-analysis first.');

  const ageMs = Date.now() - new Date(row.generated_at).getTime();
  const isStale = ageMs > GAP_ANALYSIS_STALE_DAYS * 24 * 60 * 60 * 1000;

  return { ...row, isStale };
};
