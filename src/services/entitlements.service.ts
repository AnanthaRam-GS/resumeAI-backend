import { pool } from '../db/client.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export type UsageKey =
  | 'resume_generation'
  | 'ai_request'
  | 'github_sync'
  | 'benchmark';
export interface UsageIncrement {
  key: UsageKey;
  amount?: number;
}

const FREE_LIMITS: Record<UsageKey, number> = {
  resume_generation: 10,
  ai_request: 80,
  github_sync: 12,
  benchmark: 20,
};

export const getEntitlements = async (userId: string) => {
  void userId;
  return { tier: 'free' as const, limits: FREE_LIMITS, usageLimitsEnabled: env.USAGE_LIMITS_ENABLED };
};

const currentPeriodStart = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

export const assertAndConsumeUsage = async (
  userId: string,
  key: UsageKey,
  amount = 1,
): Promise<void> => {
  await assertAndConsumeUsageBatch(userId, [{ key, amount }]);
};

export const assertAndConsumeUsageBatch = async (
  userId: string,
  increments: UsageIncrement[],
): Promise<void> => {
  if (!env.USAGE_LIMITS_ENABLED || increments.length === 0) {
    return;
  }

  const periodStart = currentPeriodStart();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const increment of increments) {
      const amount = increment.amount ?? 1;
      const limit = FREE_LIMITS[increment.key];

      const result = await client.query<{ count: number }>(
        `INSERT INTO usage_counters (user_id, usage_key, period_start, count)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, usage_key, period_start) DO UPDATE SET
           count = usage_counters.count + $4,
           updated_at = NOW()
         RETURNING count`,
        [userId, increment.key, periodStart, amount],
      );

      const count = Number(result.rows[0]?.count ?? 0);
      if (count > limit) {
        throw new AppError(
          'Free usage limit reached. Please try again next month.',
          429,
          'USAGE_LIMIT_REACHED',
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
