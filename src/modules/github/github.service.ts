import crypto from 'crypto';
import { pool } from '../../db/client.js';
import { env } from '../../config/env.js';
import { redis } from '../../workers/redis.js';
import { discoveryQueue } from '../../workers/queues.js';
import { encryptToken, decryptToken } from '../../services/github-token.service.js';
import { getAuthenticatedUser, revokeToken } from '../../services/github-client.service.js';
import { NotFoundError, AppError, ConflictError } from '../../utils/errors.js';
import type { GithubDiscoveryJobData } from '../../types/github.types.js';

const GITHUB_OAUTH_STATE_PREFIX = 'github_oauth_state:';
const STATE_TTL_SECONDS = 600;

const sanitizeReturnTo = (returnTo?: string): string => {
  if (!returnTo || !returnTo.startsWith('/')) return '/github-sync';
  if (returnTo.startsWith('//') || returnTo.includes('://')) return '/github-sync';
  return returnTo.slice(0, 200);
};

const isGithubOAuthConfigured = (): boolean =>
  env.GITHUB_CLIENT_ID.trim() !== '' && env.GITHUB_CLIENT_SECRET.trim() !== '';

const requireGithubOAuthConfigured = (): void => {
  if (!isGithubOAuthConfigured()) {
    throw new AppError(
      'GitHub OAuth is not configured for this environment.',
      503,
      'GITHUB_NOT_CONFIGURED',
    );
  }
};

const getRecoverableSyncStatus = async (userId: string): Promise<string> => {
  const result = await pool.query(
    `SELECT
       u.github_sync_status,
       EXISTS (
         SELECT 1
         FROM github_repositories gr
         WHERE gr.user_id = u.id
           AND gr.enrichment_status IN ('pending', 'processing')
       ) AS sync_has_active_repositories
     FROM users u
     WHERE u.id = $1`,
    [userId],
  );

  const row = result.rows[0] as
    | {
        github_sync_status?: string;
        sync_has_active_repositories?: boolean;
      }
    | undefined;

  if (row?.github_sync_status === 'syncing' && !row.sync_has_active_repositories) {
    await pool.query(
      `UPDATE users SET github_sync_status = 'idle', sync_started_at = NULL WHERE id = $1`,
      [userId],
    );
    await pool
      .query(
        `UPDATE github_sync_runs
       SET status = 'failed',
           completed_at = NOW(),
           error_message = COALESCE(error_message, 'Recovered stale sync with no active repositories')
       WHERE user_id = $1
         AND status = 'running'`,
        [userId],
      )
      .catch(() => undefined);
    return 'idle';
  }

  return row?.github_sync_status ?? 'idle';
};

// ─── Initiate OAuth Flow ──────────────────────────────────────────────────────

export const initiateOAuthFlow = async (
  userId: string,
  returnTo?: string,
): Promise<{ redirectUrl: string }> => {
  requireGithubOAuthConfigured();

  if ((await getRecoverableSyncStatus(userId)) === 'syncing') {
    throw new ConflictError('A sync is already in progress');
  }

  const state = crypto.randomBytes(32).toString('hex');

  await redis.set(
    `${GITHUB_OAUTH_STATE_PREFIX}${state}`,
    JSON.stringify({ userId, returnTo: sanitizeReturnTo(returnTo) }),
    'EX',
    STATE_TTL_SECONDS,
  );

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: `${env.APP_BASE_URL}/github/callback`,
    scope: 'repo read:user read:org',
    state,
  });

  return {
    redirectUrl: `https://github.com/login/oauth/authorize?${params.toString()}`,
  };
};

// ─── Handle OAuth Callback ────────────────────────────────────────────────────

export const handleOAuthCallback = async (
  code: string,
  state: string,
): Promise<{ userId: string; returnTo: string }> => {
  requireGithubOAuthConfigured();

  const stateKey = `${GITHUB_OAUTH_STATE_PREFIX}${state}`;
  const storedState = await redis.get(stateKey);
  await redis.del(stateKey);

  if (!storedState) {
    throw new AppError('Invalid or expired OAuth state. Please try connecting again.', 400);
  }

  let storedUserId = storedState;
  let returnTo = '/github-sync';
  try {
    const parsed = JSON.parse(storedState) as { userId?: string; returnTo?: string };
    storedUserId = parsed.userId ?? storedState;
    returnTo = sanitizeReturnTo(parsed.returnTo);
  } catch {
    storedUserId = storedState;
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${env.APP_BASE_URL}/github/callback`,
    }),
  });

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (tokenData.error || !tokenData.access_token) {
    throw new AppError(
      `GitHub OAuth failed: ${tokenData.error_description ?? tokenData.error ?? 'Unknown error'}`,
      400,
    );
  }

  const accessToken = tokenData.access_token;
  const scopes = (tokenData.scope ?? '').split(',').map((s) => s.trim());

  const githubUser = await getAuthenticatedUser(accessToken);
  const encryptedToken = encryptToken(accessToken);

  await pool.query(
    `INSERT INTO github_profiles (
      user_id, github_user_id, github_username,
      access_token, token_scopes, raw_data
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (user_id) DO UPDATE SET
      github_user_id = EXCLUDED.github_user_id,
      github_username = EXCLUDED.github_username,
      access_token = EXCLUDED.access_token,
      token_scopes = EXCLUDED.token_scopes,
      raw_data = EXCLUDED.raw_data,
      sync_error = NULL`,
    [
      storedUserId,
      githubUser.id,
      githubUser.login,
      encryptedToken,
      scopes,
      JSON.stringify({
        login: githubUser.login,
        name: githubUser.name,
        avatar_url: githubUser.avatar_url,
        public_repos: githubUser.public_repos,
      }),
    ],
  );

  // Enqueue initial sync — non-fatal if the queue is temporarily unavailable.
  // The user can trigger a manual sync from the Settings page.
  try {
    await enqueueSyncJob(storedUserId, 'post_connect');
  } catch (queueErr) {
    console.error('[github] Failed to enqueue post-connect sync job:', queueErr);
  }

  return { userId: storedUserId, returnTo };
};

// ─── Enqueue Sync Job ─────────────────────────────────────────────────────────

export const enqueueSyncJob = async (
  userId: string,
  triggeredBy: GithubDiscoveryJobData['triggeredBy'],
  options: { githubRepositoryId?: string } = {},
): Promise<string> => {
  if (!env.WORKERS_ENABLED && env.NODE_ENV !== 'test') {
    throw new AppError(
      'GitHub sync workers are disabled. Set WORKERS_ENABLED=true and restart the backend.',
      503,
      'WORKERS_DISABLED',
    );
  }

  const profileResult = await pool.query(`SELECT id FROM github_profiles WHERE user_id = $1`, [
    userId,
  ]);

  if (!profileResult.rows[0]) {
    throw new NotFoundError(
      'GitHub account not connected. Please connect your GitHub account first.',
    );
  }

  if ((await getRecoverableSyncStatus(userId)) === 'syncing') {
    throw new ConflictError('A sync is already in progress');
  }

  if (options.githubRepositoryId) {
    const repoResult = await pool.query(
      `SELECT id FROM github_repositories WHERE id = $1 AND user_id = $2`,
      [options.githubRepositoryId, userId],
    );

    if (!repoResult.rows[0]) {
      throw new NotFoundError('GitHub repository not found for this account');
    }
  }

  const jobName = options.githubRepositoryId
    ? `discovery-${userId}-${options.githubRepositoryId}`
    : `discovery-${userId}`;
  const jobId = `${jobName}-${crypto.randomUUID()}`;
  const jobData: GithubDiscoveryJobData = { userId, triggeredBy };
  if (options.githubRepositoryId) {
    jobData.githubRepositoryId = options.githubRepositoryId;
  }

  await pool.query(
    `UPDATE users SET github_sync_status = 'syncing', sync_started_at = NOW() WHERE id = $1`,
    [userId],
  );

  let job;
  try {
    job = await discoveryQueue.add(jobName, jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
      jobId,
    });
  } catch (error) {
    await pool.query(
      `UPDATE users SET github_sync_status = 'failed', sync_started_at = NULL WHERE id = $1`,
      [userId],
    );
    await pool.query(`UPDATE github_profiles SET sync_error = $1 WHERE user_id = $2`, [
      (error as Error).message.slice(0, 500),
      userId,
    ]);
    throw error;
  }

  return job.id ?? jobId;
};

// ─── Get Sync Status ──────────────────────────────────────────────────────────

export const getSyncStatus = async (userId: string) => {
  await getRecoverableSyncStatus(userId);

  const result = await pool.query(
    `SELECT
       u.github_sync_status,
       u.sync_started_at,
       gp.github_username,
       gp.github_user_id,
       gp.last_synced_at,
       gp.repos_discovered,
       gp.repos_processed,
       gp.sync_error,
       gp.raw_data,
       (SELECT COUNT(*) FROM github_repositories WHERE user_id = u.id AND enrichment_status = 'completed') AS repos_enriched,
       (SELECT COUNT(*) FROM github_repositories WHERE user_id = u.id AND enrichment_status = 'failed') AS repos_failed,
       (SELECT COUNT(*) FROM github_repositories WHERE user_id = u.id AND enrichment_status = 'pending') AS repos_pending,
       (SELECT COUNT(*) FROM portfolio_items WHERE user_id = u.id AND source = 'github') AS portfolio_items_count
     FROM users u
     LEFT JOIN github_profiles gp ON gp.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new NotFoundError('User not found');

  return {
    connected: !!row.github_username,
    syncStatus: (row.github_sync_status as string) ?? 'idle',
    syncStartedAt: row.sync_started_at ?? null,
    githubUsername: (row.github_username as string) ?? null,
    githubUserId: (row.github_user_id as number) ?? null,
    avatarUrl: (row.raw_data as Record<string, unknown> | null)?.avatar_url ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    reposDiscovered: (row.repos_discovered as number) ?? 0,
    reposProcessed: (row.repos_processed as number) ?? 0,
    reposEnriched: parseInt(row.repos_enriched as string, 10) || 0,
    reposFailed: parseInt(row.repos_failed as string, 10) || 0,
    reposPending: parseInt(row.repos_pending as string, 10) || 0,
    portfolioItemsCount: parseInt(row.portfolio_items_count as string, 10) || 0,
    syncError: (row.sync_error as string) ?? null,
  };
};

// ─── List Repositories ────────────────────────────────────────────────────────

export const listGithubRepositories = async (userId: string) => {
  const result = await pool.query(
    `SELECT
       gr.id,
       gr.github_repo_id,
       gr.full_name,
       gr.name,
       gr.description,
       gr.html_url,
       gr.primary_language,
       gr.language_breakdown,
       gr.topics,
       gr.stars_count,
       gr.forks_count,
       gr.is_fork,
       gr.is_archived,
       gr.owner_login,
       gr.filter_reason,
       gr.duplicate_group_key,
       gr.duplicate_of_github_repo_id,
       gr.duplicate_reason,
       gr.github_pushed_at,
       gr.enrichment_status,
       gr.enrichment_error,
       gr.last_sync_state,
       gr.last_enriched_at,
       gr.portfolio_item_id,
       EXISTS (
         SELECT 1
         FROM portfolio_items pi
         WHERE pi.user_id = gr.user_id
           AND (
             pi.extra->>'github_repo_id' = gr.github_repo_id::text
             OR pi.extra->'github_repo_ids' ? gr.github_repo_id::text
             OR (
               gr.duplicate_group_key IS NOT NULL
               AND pi.extra->>'github_project_group_key' = gr.duplicate_group_key
             )
           )
       ) AS imported
     FROM github_repositories gr
     WHERE gr.user_id = $1
       AND gr.deleted_or_archived = FALSE
     ORDER BY gr.github_pushed_at DESC`,
    [userId],
  );

  return result.rows.map((row) => {
    const repo = row as Record<string, unknown>;
    return {
      id: repo.id as string,
      githubRepoId: Number(repo.github_repo_id),
      fullName: repo.full_name as string,
      name: repo.name as string,
      description: (repo.description as string | null) ?? null,
      htmlUrl: repo.html_url as string,
      primaryLanguage: (repo.primary_language as string | null) ?? null,
      languageBreakdown: (repo.language_breakdown as Record<string, number> | null) ?? {},
      topics: (repo.topics as string[] | null) ?? [],
      starsCount: (repo.stars_count as number) ?? 0,
      forksCount: (repo.forks_count as number) ?? 0,
      isFork: (repo.is_fork as boolean) ?? false,
      isArchived: (repo.is_archived as boolean) ?? false,
      ownerLogin: (repo.owner_login as string | null) ?? null,
      filterReason: (repo.filter_reason as string | null) ?? null,
      duplicateGroupKey: (repo.duplicate_group_key as string | null) ?? null,
      duplicateOfGithubRepoId:
        repo.duplicate_of_github_repo_id === null || repo.duplicate_of_github_repo_id === undefined
          ? null
          : Number(repo.duplicate_of_github_repo_id),
      duplicateReason: (repo.duplicate_reason as string | null) ?? null,
      isDuplicate:
        repo.duplicate_of_github_repo_id !== null && repo.duplicate_of_github_repo_id !== undefined,
      githubPushedAt: repo.github_pushed_at,
      enrichmentStatus: repo.enrichment_status as string,
      enrichmentError: (repo.enrichment_error as string | null) ?? null,
      lastSyncState: (repo.last_sync_state as string | null) ?? null,
      lastEnrichedAt: repo.last_enriched_at ?? null,
      portfolioItemId: (repo.portfolio_item_id as string | null) ?? null,
      imported: Boolean(repo.imported),
    };
  });
};

// ─── Disconnect GitHub ────────────────────────────────────────────────────────

export const disconnectGithub = async (userId: string): Promise<void> => {
  const profileResult = await pool.query(
    `SELECT access_token FROM github_profiles WHERE user_id = $1`,
    [userId],
  );

  const profile = profileResult.rows[0] as { access_token: string } | undefined;
  if (!profile) throw new NotFoundError('GitHub account not connected');

  try {
    requireGithubOAuthConfigured();
    const plainToken = decryptToken(profile.access_token);
    await revokeToken(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, plainToken);
  } catch {
    // Token may already be expired — continue with cleanup
  }

  // Keep portfolio_items — users may have edited their project descriptions
  await pool.query(`DELETE FROM github_profiles WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM github_repositories WHERE user_id = $1`, [userId]);

  await pool.query(
    `UPDATE users SET github_sync_status = 'idle', sync_started_at = NULL WHERE id = $1`,
    [userId],
  );
};
