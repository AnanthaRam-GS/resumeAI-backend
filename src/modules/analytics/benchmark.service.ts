import { pool } from '../../db/client.js';

const MIN_SAMPLE_SIZE = 5;

const bucketScore = (score: number): number => Math.max(0, Math.min(100, Math.floor(score / 10) * 10));

export const recordAtsBenchmark = async (
  roleCategory: string | null | undefined,
  score: number,
): Promise<void> => {
  const category = roleCategory?.trim() || 'general';
  const bucket = bucketScore(score);
  await pool.query(
    `INSERT INTO ats_benchmark_aggregates (role_category, score_bucket, sample_count, average_score)
     VALUES ($1,$2,1,$3)
     ON CONFLICT (role_category, score_bucket) DO UPDATE SET
       sample_count = ats_benchmark_aggregates.sample_count + 1,
       average_score = (
         (ats_benchmark_aggregates.average_score * ats_benchmark_aggregates.sample_count) + $3
       ) / (ats_benchmark_aggregates.sample_count + 1),
       updated_at = NOW()`,
    [category, bucket, score],
  ).catch(() => undefined);
};

export const getAtsBenchmark = async (
  userId: string,
  resumeVersionId: string,
) => {
  const versionResult = await pool.query<{
    ats_score: string | null;
    target_role_category: string | null;
  }>(
    `SELECT rv.ats_score, u.target_role_category
     FROM resume_versions rv
     JOIN users u ON u.id = rv.user_id
     WHERE rv.id = $1 AND rv.user_id = $2`,
    [resumeVersionId, userId],
  );
  const version = versionResult.rows[0];
  if (!version?.ats_score) {
    return {
      available: false,
      message: 'Benchmark context is unavailable until this resume has an ATS score.',
    };
  }

  const roleCategory = version.target_role_category || 'general';
  const score = Number(version.ats_score);
  const aggregateResult = await pool.query<{
    sample_count: string;
    lower_count: string;
    total_count: string;
  }>(
    `SELECT
       SUM(sample_count)::text AS sample_count,
       SUM(CASE WHEN score_bucket <= $2 THEN sample_count ELSE 0 END)::text AS lower_count,
       SUM(sample_count)::text AS total_count
     FROM ats_benchmark_aggregates
     WHERE role_category = $1`,
    [roleCategory, bucketScore(score)],
  );
  const aggregate = aggregateResult.rows[0];
  const sampleCount = Number(aggregate?.sample_count ?? 0);
  if (sampleCount < MIN_SAMPLE_SIZE) {
    return {
      available: false,
      sampleSize: sampleCount,
      minSampleSize: MIN_SAMPLE_SIZE,
      message: 'Not enough anonymized benchmark data is available for this role category yet.',
    };
  }

  const percentile = Math.round((Number(aggregate?.lower_count ?? 0) / Number(aggregate?.total_count ?? 1)) * 100);
  const lower = Math.max(1, Math.floor(percentile / 10) * 10);
  const upper = Math.min(99, lower + 9);
  return {
    available: true,
    roleCategory,
    sampleSize: sampleCount,
    percentileRange: `${lower}-${upper}`,
    message: 'Approximate benchmark based on anonymized aggregate ATS scores.',
  };
};

