import { pool } from '../db/client.js';

export interface PortfolioQualityInput {
  type: string;
  title?: string | null;
  description?: string | null;
  tech_stack?: string[] | null;
  impact_metrics?: string | null;
  start_date?: string | Date | null;
  end_date?: string | Date | null;
  is_current?: boolean | null;
  source?: string | null;
  extra?: Record<string, unknown> | null;
}

const hasMetric = (text: string): boolean =>
  /(\d+%|\$\d+|\d+x|\d+\s*(users|requests|ms|seconds|hours|days|students|customers|repos|projects))/i.test(text);

const scoreRecency = (input: PortfolioQualityInput): number => {
  if (input.is_current) return 15;
  const dateValue = input.end_date ?? input.start_date;
  if (!dateValue) return 5;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 5;
  const monthsAgo = Math.max(0, (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30));
  if (monthsAgo <= 12) return 15;
  if (monthsAgo <= 24) return 10;
  if (monthsAgo <= 48) return 6;
  return 3;
};

const scoreReadme = (extra: Record<string, unknown> | null | undefined): number => {
  const github = extra?.github_enrichment;
  const readme = typeof github === 'object' && github !== null && 'readme_excerpt' in github
    ? String((github as Record<string, unknown>).readme_excerpt ?? '')
    : '';
  if (!readme) return 0;
  const wordCount = readme.split(/\s+/).filter(Boolean).length;
  let score = wordCount > 500 ? 12 : wordCount > 200 ? 8 : wordCount > 50 ? 4 : 1;
  if (/install|setup|getting started/i.test(readme)) score += 3;
  if (/usage|example|demo/i.test(readme)) score += 3;
  if (/test|ci|deploy/i.test(readme)) score += 2;
  return Math.min(20, score);
};

export const calculatePortfolioQuality = (input: PortfolioQualityInput): {
  score: number;
  reasons: Record<string, number>;
} => {
  const text = [input.title, input.description, input.impact_metrics, ...(input.tech_stack ?? [])]
    .filter(Boolean)
    .join(' ');

  const reasons: {
    completeness: number;
    impact: number;
    recency: number;
    technologyDepth: number;
    sourceEvidence: number;
  } = {
    completeness: 0,
    impact: 0,
    recency: scoreRecency(input),
    technologyDepth: 0,
    sourceEvidence: 0,
  };

  if ((input.title ?? '').trim().length >= 3) reasons.completeness += 8;
  if ((input.description ?? '').trim().length >= 80) reasons.completeness += 15;
  else if ((input.description ?? '').trim().length >= 30) reasons.completeness += 8;
  if ((input.tech_stack ?? []).length >= 3) reasons.technologyDepth += 15;
  else if ((input.tech_stack ?? []).length > 0) reasons.technologyDepth += 8;
  if ((input.impact_metrics ?? '').trim()) reasons.impact += hasMetric(input.impact_metrics ?? '') ? 25 : 12;
  if (hasMetric(text)) reasons.impact = Math.max(reasons.impact, 20);
  if (input.source === 'github') reasons.sourceEvidence += 8;
  if (input.source === 'upload' || input.source === 'linkedin_import') reasons.sourceEvidence += 5;
  reasons.sourceEvidence += scoreReadme(input.extra);

  const score = Math.min(100, Math.round(Object.values(reasons).reduce((sum, value) => sum + value, 0)));
  return { score, reasons };
};

export const recalculatePortfolioQuality = async (
  itemId: string,
  userId: string,
): Promise<number | null> => {
  const result = await pool.query<PortfolioQualityInput & { id: string }>(
    `SELECT id, type, title, description, tech_stack, impact_metrics, start_date,
            end_date, is_current, source, extra
     FROM portfolio_items
     WHERE id = $1 AND user_id = $2`,
    [itemId, userId],
  );
  const item = result.rows[0];
  if (!item) return null;
  const calculated = calculatePortfolioQuality(item);
  await pool.query(
    `UPDATE portfolio_items
     SET validation_score = $1,
         validation_score_reasons = $2,
         validation_score_updated_at = NOW()
     WHERE id = $3 AND user_id = $4`,
    [calculated.score, JSON.stringify(calculated.reasons), itemId, userId],
  );
  return calculated.score;
};
