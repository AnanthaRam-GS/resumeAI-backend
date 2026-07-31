import { PostHog } from 'posthog-node';
import { env } from '../config/env.js';
import { pool } from '../db/client.js';

const client = env.POSTHOG_API_KEY
  ? new PostHog(env.POSTHOG_API_KEY, { host: env.POSTHOG_HOST })
  : null;

const SAFE_EVENT_FIELDS = new Set([
  'count',
  'status',
  'source',
  'tier',
  'templateId',
  'pageLength',
  'score',
  'roleCategory',
  'operation',
  'language',
  'platform',
]);

const sanitizeProperties = (properties: Record<string, unknown> = {}): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(properties).filter(([key, value]) =>
      SAFE_EVENT_FIELDS.has(key) &&
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null),
    ),
  );

export const trackEvent = async (
  userId: string,
  event: string,
  properties: Record<string, unknown> = {},
): Promise<void> => {
  try {
    const userResult = await pool.query<{ analytics_opt_out: boolean }>(
      `SELECT analytics_opt_out FROM users WHERE id = $1`,
      [userId],
    );
    if (userResult.rows[0]?.analytics_opt_out || !client) return;
    client.capture({
      distinctId: userId,
      event,
      properties: sanitizeProperties(properties),
    });
  } catch {
    // Analytics failure must never affect user-facing functionality.
  }
};

export const shutdownAnalytics = async (): Promise<void> => {
  await client?.shutdown().catch(() => undefined);
};

