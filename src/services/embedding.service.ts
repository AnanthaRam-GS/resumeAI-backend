import { GoogleGenerativeAI } from '@google/generative-ai';
import { pool } from '../db/client.js';
import { env } from '../config/env.js';
import { hashNormalizedText } from './content-hash.service.js';
import { startPipelineTrace, completePipelineTrace } from './pipeline-trace.service.js';
import { withCircuitBreaker } from './circuit-breaker.service.js';

export const EMBEDDING_MODEL = 'text-embedding-004';
export const EMBEDDING_DIMENSIONS = 768;

const toVectorLiteral = (values: number[]): string => `[${values.join(',')}]`;

export const buildPortfolioEmbeddingText = (item: {
  title?: string | null;
  description?: string | null;
  tech_stack?: string[] | null;
  impact_metrics?: string | null;
  domain_category?: string | null;
  company_name?: string | null;
  institution_name?: string | null;
  skill_name?: string | null;
}): string =>
  [
    item.title,
    item.description,
    item.impact_metrics,
    item.domain_category,
    item.company_name,
    item.institution_name,
    item.skill_name,
    ...(item.tech_stack ?? []),
  ].filter(Boolean).join(' ');

export const generateEmbedding = async (
  text: string,
  operation = 'embedding',
): Promise<number[]> => {
  return withCircuitBreaker(
    { provider: 'gemini', operation, model: EMBEDDING_MODEL },
    async () => {
      const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
      const result = await model.embedContent(text);
      const values = result.embedding.values;
      if (values.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${values.length}`);
      }
      return values;
    },
  );
};

export const invalidatePortfolioEmbedding = async (
  userId: string,
  portfolioItemId: string,
): Promise<void> => {
  await pool.query(
    `UPDATE portfolio_items
     SET embedding = NULL,
         embedding_status = 'pending',
         embedding_error = NULL,
         embedding_updated_at = NULL
     WHERE id = $1 AND user_id = $2`,
    [portfolioItemId, userId],
  );
};

export const embedPortfolioItem = async (
  userId: string,
  portfolioItemId: string,
): Promise<'completed' | 'skipped' | 'failed'> => {
  const traceId = await startPipelineTrace({
    userId,
    pipelineType: 'embedding',
    relatedEntityType: 'portfolio_item',
    relatedEntityId: portfolioItemId,
    provider: 'gemini',
    model: EMBEDDING_MODEL,
  });
  const startedAt = Date.now();

  const result = await pool.query<{
    id: string;
    title: string;
    description: string | null;
    tech_stack: string[];
    impact_metrics: string | null;
    domain_category: string | null;
    company_name: string | null;
    institution_name: string | null;
    skill_name: string | null;
    embedding_content_hash: string | null;
  }>(
    `SELECT id, title, description, tech_stack, impact_metrics, domain_category,
            company_name, institution_name, skill_name, embedding_content_hash
     FROM portfolio_items
     WHERE id = $1 AND user_id = $2`,
    [portfolioItemId, userId],
  );

  const item = result.rows[0];
  if (!item) return 'failed';
  const text = buildPortfolioEmbeddingText(item);
  const contentHash = hashNormalizedText(text);

  if (!text.trim()) {
    await pool.query(
      `UPDATE portfolio_items
       SET embedding_status = 'skipped',
           embedding_error = 'No semantic content available',
           embedding_content_hash = $1
       WHERE id = $2 AND user_id = $3`,
      [contentHash, portfolioItemId, userId],
    );
    await completePipelineTrace(traceId, { terminalStatus: 'completed', latencyMs: Date.now() - startedAt });
    return 'skipped';
  }

  if (item.embedding_content_hash === contentHash) {
    await pool.query(
      `UPDATE portfolio_items
       SET embedding_status = CASE WHEN embedding IS NULL THEN 'pending' ELSE 'completed' END
       WHERE id = $1 AND user_id = $2`,
      [portfolioItemId, userId],
    );
    await completePipelineTrace(traceId, { terminalStatus: 'completed', latencyMs: Date.now() - startedAt });
    return 'skipped';
  }

  await pool.query(
    `UPDATE portfolio_items SET embedding_status = 'processing', embedding_error = NULL WHERE id = $1 AND user_id = $2`,
    [portfolioItemId, userId],
  );

  try {
    const embedding = await generateEmbedding(text, 'portfolio_embedding');
    await pool.query(
      `UPDATE portfolio_items
       SET embedding = $1::vector,
           embedding_content_hash = $2,
           embedding_status = 'completed',
           embedding_error = NULL,
           embedding_model = $3,
           embedding_updated_at = NOW()
       WHERE id = $4 AND user_id = $5`,
      [toVectorLiteral(embedding), contentHash, EMBEDDING_MODEL, portfolioItemId, userId],
    );
    await completePipelineTrace(traceId, { terminalStatus: 'completed', latencyMs: Date.now() - startedAt });
    return 'completed';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `UPDATE portfolio_items
       SET embedding_status = 'failed',
           embedding_error = $1
       WHERE id = $2 AND user_id = $3`,
      [message.slice(0, 500), portfolioItemId, userId],
    );
    await completePipelineTrace(traceId, {
      terminalStatus: 'failed',
      latencyMs: Date.now() - startedAt,
      safeErrorCategory: 'embedding_provider_failure',
    });
    return 'failed';
  }
};

export const embedJobTarget = async (
  userId: string,
  jobTargetId: string,
): Promise<'completed' | 'skipped' | 'failed'> => {
  const result = await pool.query<{ job_description: string; embedding_content_hash: string | null }>(
    `SELECT job_description, embedding_content_hash
     FROM job_targets
     WHERE id = $1 AND user_id = $2`,
    [jobTargetId, userId],
  );
  const target = result.rows[0];
  if (!target) return 'failed';
  const contentHash = hashNormalizedText(target.job_description);
  if (target.embedding_content_hash === contentHash) return 'skipped';

  try {
    const embedding = await generateEmbedding(target.job_description, 'job_target_embedding');
    await pool.query(
      `UPDATE job_targets
       SET jd_embedding = $1::vector,
           embedding_content_hash = $2,
           embedding_status = 'completed',
           embedding_error = NULL
       WHERE id = $3 AND user_id = $4`,
      [toVectorLiteral(embedding), contentHash, jobTargetId, userId],
    );
    return 'completed';
  } catch (error) {
    await pool.query(
      `UPDATE job_targets
       SET embedding_status = 'failed',
           embedding_error = $1
       WHERE id = $2 AND user_id = $3`,
      [error instanceof Error ? error.message.slice(0, 500) : 'Embedding failed', jobTargetId, userId],
    );
    return 'failed';
  }
};

