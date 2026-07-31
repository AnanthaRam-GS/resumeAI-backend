import { pool } from '../db/client.js';
import { defaultJobOptions, embeddingQueue } from '../workers/queues.js';

interface GithubPortfolioUpsertInput {
  userId: string;
  title: string;
  description: string;
  techStack: string[];
  projectUrl: string;
  impactMetrics: string | null;
  domainCategory: string;
  validationScore: number;
  githubExtra: Record<string, unknown>;
  githubRepoId: string;
  normalizedUrlAliases: string[];
  contentHash: string | null;
}

let embeddingColumnExistsCache: boolean | null = null;

export const resetGithubPortfolioUpsertCacheForTests = (): void => {
  embeddingColumnExistsCache = null;
};

export const portfolioEmbeddingColumnExists = async (): Promise<boolean> => {
  if (embeddingColumnExistsCache !== null) return embeddingColumnExistsCache;

  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'portfolio_items'
         AND column_name = 'embedding'
     )`,
  );

  embeddingColumnExistsCache = Boolean(result.rows[0]?.exists);
  return embeddingColumnExistsCache;
};

export const buildGithubPortfolioUpsertSql = (hasEmbeddingColumn: boolean): string => {
  const clearEmbeddingOnUpdate = hasEmbeddingColumn
    ? `embedding = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN NULL ELSE portfolio_items.embedding END,`
    : '';
  const nextEmbeddingStatus = hasEmbeddingColumn ? `'pending'` : `'skipped'`;
  const nextEmbeddingError = hasEmbeddingColumn
    ? 'NULL'
    : `'Semantic embeddings unavailable because pgvector storage is not configured'`;

  return `WITH matching_portfolio_item AS (
          SELECT id
          FROM portfolio_items
          WHERE user_id = $1
            AND type = 'project'
            AND (
              extra->>'github_repo_id' = $10
              OR extra->'github_repo_ids' ? $10
              OR (
                $12::text IS NOT NULL
                AND extra->>'github_project_group_key' = $12
              )
              OR lower(regexp_replace(regexp_replace(project_url, '\\.git$', '', 'i'), '/+$', '')) = ANY($11::text[])
            )
          ORDER BY CASE WHEN source = 'github' THEN 0 ELSE 1 END, created_at ASC
          LIMIT 1
        ),
        updated_portfolio_item AS (
          UPDATE portfolio_items
          SET
            source = 'github',
            title = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN $2 ELSE portfolio_items.title END,
            description = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN $3 ELSE portfolio_items.description END,
            tech_stack = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN $4 ELSE portfolio_items.tech_stack END,
            project_url = $5,
            impact_metrics = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN $6 ELSE portfolio_items.impact_metrics END,
            domain_category = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN $7 ELSE portfolio_items.domain_category END,
            validation_score = $8,
            ${clearEmbeddingOnUpdate}
            embedding_status = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN ${nextEmbeddingStatus} ELSE portfolio_items.embedding_status END,
            embedding_error = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN ${nextEmbeddingError} ELSE portfolio_items.embedding_error END,
            extra = portfolio_items.extra || $9::jsonb,
            updated_at = NOW()
          WHERE id = (SELECT id FROM matching_portfolio_item)
          RETURNING id
        ),
        inserted_portfolio_item AS (
          INSERT INTO portfolio_items (
            user_id, type, source, title, description,
            tech_stack, project_url, impact_metrics, domain_category,
            validation_score, embedding_status, embedding_error,
            extra
          )
          SELECT
            $1, 'project', 'github', $2, $3,
            $4, $5, $6, $7,
            $8, ${nextEmbeddingStatus}, ${nextEmbeddingError},
            $9::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM matching_portfolio_item)
          ON CONFLICT (user_id, (extra->>'github_repo_id')) WHERE extra->>'github_repo_id' IS NOT NULL
          DO UPDATE SET
            source = 'github',
            title = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN EXCLUDED.title ELSE portfolio_items.title END,
            description = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN EXCLUDED.description ELSE portfolio_items.description END,
            tech_stack = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN EXCLUDED.tech_stack ELSE portfolio_items.tech_stack END,
            project_url = EXCLUDED.project_url,
            impact_metrics = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN EXCLUDED.impact_metrics ELSE portfolio_items.impact_metrics END,
            domain_category = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN EXCLUDED.domain_category ELSE portfolio_items.domain_category END,
            validation_score = EXCLUDED.validation_score,
            ${clearEmbeddingOnUpdate}
            embedding_status = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN ${nextEmbeddingStatus} ELSE portfolio_items.embedding_status END,
            embedding_error = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN ${nextEmbeddingError} ELSE portfolio_items.embedding_error END,
            extra = portfolio_items.extra || EXCLUDED.extra,
            updated_at = NOW()
          RETURNING id
        )
        SELECT id FROM updated_portfolio_item
        UNION ALL
        SELECT id FROM inserted_portfolio_item
        LIMIT 1`;
};

export const upsertGithubPortfolioItem = async (
  input: GithubPortfolioUpsertInput,
): Promise<string | null> => {
  const hasEmbeddingColumn = await portfolioEmbeddingColumnExists();

  const upsertResult = await pool.query(buildGithubPortfolioUpsertSql(hasEmbeddingColumn), [
    input.userId,
    input.title,
    input.description,
    input.techStack,
    input.projectUrl,
    input.impactMetrics,
    input.domainCategory,
    input.validationScore,
    JSON.stringify(input.githubExtra),
    input.githubRepoId,
    input.normalizedUrlAliases,
    typeof input.githubExtra.github_project_group_key === 'string'
      ? input.githubExtra.github_project_group_key
      : null,
  ]);

  const portfolioItemId = (upsertResult.rows[0] as { id: string } | undefined)?.id ?? null;

  const githubRepoIds = Array.isArray(input.githubExtra.github_repo_ids)
    ? input.githubExtra.github_repo_ids.filter(
        (value): value is string => typeof value === 'string',
      )
    : [input.githubRepoId];

  if (portfolioItemId && githubRepoIds.length > 1) {
    await pool.query(
      `DELETE FROM portfolio_items
       WHERE user_id = $1
         AND type = 'project'
         AND source = 'github'
         AND id <> $2
         AND manually_edited_at IS NULL
         AND (
           extra->>'github_repo_id' = ANY($3::text[])
           OR extra->'github_repo_ids' ?| $3::text[]
           OR lower(regexp_replace(regexp_replace(project_url, '\\.git$', '', 'i'), '/+$', '')) = ANY($4::text[])
         )`,
      [input.userId, portfolioItemId, githubRepoIds, input.normalizedUrlAliases],
    );
  }

  if (portfolioItemId && hasEmbeddingColumn) {
    await embeddingQueue
      .add(
        `portfolio-${portfolioItemId}`,
        { userId: input.userId, entityType: 'portfolio_item', entityId: portfolioItemId },
        {
          ...defaultJobOptions,
          jobId: `portfolio-embedding-${portfolioItemId}-${input.contentHash ?? Date.now()}`,
        },
      )
      .catch(() => undefined);
  }

  return portfolioItemId;
};
