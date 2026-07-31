import { pool } from '../../db/client.js';
import { AppError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { hashNormalizedText, normalizeWhitespace, sha256 } from '../../services/content-hash.service.js';
import { embeddingQueue, defaultJobOptions } from '../../workers/queues.js';
import { trackEvent } from '../../services/analytics-events.service.js';
import type { ImportJobTargetInput, JobTargetListQuery } from './job-targets.schema.js';

export interface JobTarget {
  id: string;
  user_id: string;
  job_title: string;
  company_name: string;
  job_description: string;
  source_url: string | null;
  ingested_via: string;
  source_platform: string | null;
  location: string | null;
  metadata: Record<string, unknown>;
  normalized_content_hash: string | null;
  created_at: Date;
}

const normalizeJobDescription = (value: string): string =>
  normalizeWhitespace(value)
    .replaceAll(String.fromCharCode(0), '')
    .trim();

const assertJobDescriptionQuality = (description: string): void => {
  if (description.length < 80) {
    throw new ValidationError('Job description is too short to import.');
  }
  if (description.length > 60_000) {
    throw new ValidationError('Job description is too large to import.');
  }
  const alphaCount = (description.match(/[a-z]/gi) ?? []).length;
  if (alphaCount < 50) {
    throw new ValidationError('Job description does not contain enough readable text.');
  }
};

const redirectUrl = (id: string): string => `/generate?jobTargetId=${encodeURIComponent(id)}`;

export const importJobTarget = async (
  userId: string,
  input: ImportJobTargetInput,
): Promise<{ jobTarget: JobTarget; duplicate: boolean; redirectUrl: string }> => {
  const normalizedDescription = normalizeJobDescription(input.jobDescription);
  assertJobDescriptionQuality(normalizedDescription);

  const normalizedContentHash = hashNormalizedText([
    input.roleTitle,
    input.companyName,
    normalizedDescription,
  ].join('\n'));
  const sourceUrlHash = input.sourceUrl ? sha256(input.sourceUrl.trim().toLowerCase()) : null;

  const duplicateResult = await pool.query<JobTarget>(
    `SELECT *
     FROM job_targets
     WHERE user_id = $1
       AND (
         normalized_content_hash = $2
         OR ($3::text IS NOT NULL AND source_url_hash = $3)
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, normalizedContentHash, sourceUrlHash],
  );

  const duplicate = duplicateResult.rows[0];
  if (duplicate) {
    return { jobTarget: duplicate, duplicate: true, redirectUrl: redirectUrl(duplicate.id) };
  }

  const result = await pool.query<JobTarget>(
    `INSERT INTO job_targets (
       user_id, job_title, company_name, job_description, source_url,
       ingested_via, source_platform, location, metadata,
       normalized_content_hash, source_url_hash
     )
     VALUES ($1,$2,$3,$4,$5,'extension',$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      userId,
      input.roleTitle,
      input.companyName,
      normalizedDescription,
      input.sourceUrl ?? null,
      input.sourcePlatform ?? 'unknown',
      input.location ?? null,
      JSON.stringify(input.metadata ?? {}),
      normalizedContentHash,
      sourceUrlHash,
    ],
  );

  const jobTarget = result.rows[0];
  if (!jobTarget) throw new AppError('Failed to persist job target', 500);

  await embeddingQueue.add(
    `job-target-${jobTarget.id}`,
    { userId, entityType: 'job_target', entityId: jobTarget.id, contentHash: normalizedContentHash },
    { ...defaultJobOptions, jobId: `job-target-embedding-${jobTarget.id}-${normalizedContentHash}` },
  ).catch(() => undefined);

  await trackEvent(userId, 'job_target_created', {
    source: 'extension',
    platform: input.sourcePlatform ?? 'unknown',
  });

  return { jobTarget, duplicate: false, redirectUrl: redirectUrl(jobTarget.id) };
};

export const getJobTarget = async (userId: string, id: string): Promise<JobTarget> => {
  const result = await pool.query<JobTarget>(
    `SELECT * FROM job_targets WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Job target not found');
  return row;
};

export const listJobTargets = async (
  userId: string,
  query: JobTargetListQuery,
): Promise<JobTarget[]> => {
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  const result = await pool.query<JobTarget>(
    `SELECT *
     FROM job_targets
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return result.rows;
};
