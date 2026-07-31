import { Worker, FlowProducer } from 'bullmq';
import { pool } from '../db/client.js';
import { env } from '../config/env.js';
import { QUEUE_NAMES } from './queues.js';

const connection = { url: env.REDIS_URL };
import { decryptToken } from '../services/github-token.service.js';
import {
  listUserRepos,
  getRepoReadme,
  getRepoLanguages,
  getRepoTree,
  getFileContent,
  getRepoCommits,
  GithubRateLimitError,
  GithubTokenRevokedError,
} from '../services/github-client.service.js';
import type {
  GithubDiscoveryJobData,
  GithubApiRepo,
  GithubRepositoryRow,
  ContributionLevel,
} from '../types/github.types.js';
import { hashNormalizedText, hashStableJson } from '../services/content-hash.service.js';
import {
  buildGithubDuplicateMap,
  githubProjectGroupKey,
} from '../services/github-repository-dedupe.service.js';

type ExistingGithubRepo = Pick<
  GithubRepositoryRow,
  | 'id'
  | 'github_pushed_at'
  | 'enrichment_status'
  | 'etag_readme'
  | 'etag_languages'
  | 'etag_commits'
  | 'repo_content_hash'
  | 'duplicate_group_key'
  | 'duplicate_of_github_repo_id'
> & {
  has_portfolio_item: boolean;
};

// ─── Key file detection ────────────────────────────────────────────────────────

const KEY_FILE_PATHS: Record<string, string> = {
  'package.json': 'packageJson',
  'requirements.txt': 'requirementsTxt',
  'pyproject.toml': 'pyprojectToml',
  'Cargo.toml': 'cargoToml',
  'go.mod': 'goMod',
  'build.gradle': 'buildGradle',
  'pom.xml': 'pomXml',
  'docker-compose.yml': 'dockerCompose',
  'docker-compose.yaml': 'dockerCompose',
  'Dockerfile': 'dockerfile',
  'tsconfig.json': 'tsconfig',
  'prisma/schema.prisma': 'prismaSchema',
};

// ─── Contribution level ────────────────────────────────────────────────────────

export const calculateContributionLevel = (
  userCommitCount: number,
  totalRecentCommits: number,
  ownerLogin: string | null,
  githubUsername: string,
  isFork: boolean,
): ContributionLevel => {
  if (totalRecentCommits === 0) return 'unclear';

  const isOwner = (ownerLogin ?? '').toLowerCase() === githubUsername.toLowerCase();
  const ratio = userCommitCount / totalRecentCommits;

  // Fork with few user commits → minor or unclear (don't claim authorship)
  if (isFork && userCommitCount <= 5 && ratio < 0.5) {
    return userCommitCount > 0 ? 'minor_contributor' : 'unclear';
  }

  if (isOwner && ratio >= 0.5 && !isFork) return 'primary_author';
  if (ratio >= 0.35 || userCommitCount >= 15) return 'major_contributor';
  if (ratio >= 0.10 || userCommitCount >= 5) return 'contributor';
  if (userCommitCount > 0) return 'minor_contributor';
  return 'unclear';
};

const buildContributionSummary = (
  level: ContributionLevel,
  userCommitCount: number,
  totalRecentCommits: number,
  isFork: boolean,
): string => {
  const commitDetail =
    totalRecentCommits > 0
      ? ` (${userCommitCount} of ${totalRecentCommits} recent commits analyzed)`
      : '';

  switch (level) {
    case 'primary_author':
      return `Primary author of this project${commitDetail}.`;
    case 'major_contributor':
      return `Major contributor to this project${commitDetail}.`;
    case 'contributor':
      return `Active contributor to this project${commitDetail}.`;
    case 'minor_contributor':
      return isFork
        ? `Extended a fork of this project${commitDetail}.`
        : `Contributor to this project${commitDetail}.`;
    default:
      return 'Contribution level could not be determined from available commit data.';
  }
};

// ─── Worker ────────────────────────────────────────────────────────────────────

export const githubDiscoveryWorker = new Worker<GithubDiscoveryJobData>(
  QUEUE_NAMES.GITHUB_DISCOVERY,
  async (job) => {
    const { userId, githubRepositoryId } = job.data;
    const startedAt = Date.now();

    const emit = (event: Record<string, unknown>) => {
      try {
        global.wsEmitToUser?.(userId, event);
      } catch {
        // ignore
      }
    };

    // Reset any repos stuck in 'processing' from a previous crashed worker
    await pool.query(
      `UPDATE github_repositories
       SET enrichment_status = 'pending', enrichment_error = 'Reset after worker crash'
       WHERE user_id = $1 AND enrichment_status = 'processing'
         AND updated_at < NOW() - INTERVAL '10 minutes'`,
      [userId],
    );

    const profileResult = await pool.query(
      `SELECT * FROM github_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );

    const profile = profileResult.rows[0];
    if (!profile) {
      throw new Error(`No GitHub profile found for user ${userId}`);
    }

    const accessToken = decryptToken(profile.access_token as string);
    const githubUsername = (profile.github_username as string) ?? '';

    const selectedRepoResult = githubRepositoryId
      ? await pool.query<{
          id: string;
          github_repo_id: string;
          name: string;
          duplicate_group_key: string | null;
        }>(
          `SELECT id, github_repo_id, name, duplicate_group_key
         FROM github_repositories
         WHERE id = $1 AND user_id = $2`,
          [githubRepositoryId, userId],
        )
      : null;
    const selectedRepo = selectedRepoResult?.rows[0] ?? null;

    if (githubRepositoryId && !selectedRepo) {
      throw new Error(`Repository ${githubRepositoryId} not found for user ${userId}`);
    }

    const refreshNeededResult = await pool
      .query(
        `SELECT COUNT(*) FROM github_repositories gr
       WHERE gr.user_id = $1
         AND ($2::uuid IS NULL OR gr.id = $2)
         AND (
           gr.duplicate_group_key IS NULL
           OR NOT EXISTS (
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
           )
         )`,
        [userId, githubRepositoryId ?? null],
      )
      .catch(() => ({ rows: [{ count: '0' }] }));

    const forceRepositoryRefresh =
      parseInt((refreshNeededResult.rows[0] as { count: string }).count, 10) > 0;

    await pool.query(
      `UPDATE users SET github_sync_status = 'syncing', sync_started_at = NOW() WHERE id = $1`,
      [userId],
    );

    const syncRunResult = await pool
      .query<{ id: string }>(
        `INSERT INTO github_sync_runs (user_id, triggered_by, status)
       VALUES ($1,$2,'running')
       RETURNING id`,
        [userId, job.data.triggeredBy],
      )
      .catch(() => ({ rows: [] as { id: string }[] }));
    const syncRunId = syncRunResult.rows[0]?.id ?? null;

    try {
      const {
        repos: rawRepos,
        newEtag,
        notModified,
      } = await listUserRepos(
        accessToken,
        forceRepositoryRefresh ? null : (profile.etag_repos_list as string | null),
      );

      if (notModified) {
        await pool.query(
          `UPDATE github_repositories gr
           SET enrichment_status = 'pending',
               last_sync_state = 'updated',
               last_sync_run_id = $2
           WHERE gr.user_id = $1
             AND gr.enrichment_status IN ('completed', 'failed')
             AND ($3::uuid IS NULL OR gr.id = $3)
             AND NOT EXISTS (
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
             )`,
          [userId, syncRunId, githubRepositoryId ?? null],
        );

        await pool.query(
          `UPDATE github_repositories gr
           SET last_sync_state = 'skipped',
               last_sync_run_id = $2
           WHERE gr.user_id = $1
             AND gr.enrichment_status = 'completed'
             AND ($3::uuid IS NULL OR gr.id = $3)
             AND EXISTS (
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
             )`,
          [userId, syncRunId, githubRepositoryId ?? null],
        );

        const pendingCount = await pool.query(
          `SELECT COUNT(*) FROM github_repositories
           WHERE user_id = $1
             AND enrichment_status = 'pending'
             AND ($2::uuid IS NULL OR id = $2)`,
          [userId, githubRepositoryId ?? null],
        );

        if (parseInt(pendingCount.rows[0].count as string, 10) === 0) {
          await finalizeSync(userId, startedAt, syncRunId);
          return;
        }
      }

      const selectedGroupKey =
        selectedRepo?.duplicate_group_key ??
        (selectedRepo ? githubProjectGroupKey(selectedRepo.name) : null);
      const repos = (rawRepos as GithubApiRepo[]).filter((repo) => {
        if (!selectedRepo) return true;
        return (
          Number(selectedRepo.github_repo_id) === repo.id ||
          (selectedGroupKey !== null && githubProjectGroupKey(repo.name) === selectedGroupKey)
        );
      });

      if (selectedRepo && repos.length === 0) {
        await pool.query(
          `UPDATE github_repositories
           SET deleted_or_archived = TRUE,
               last_sync_state = 'deleted',
               last_sync_run_id = $3
           WHERE user_id = $1 AND id = $2`,
          [userId, selectedRepo.id, syncRunId],
        );
        await finalizeSync(userId, startedAt, syncRunId);
        return;
      }

      if (newEtag) {
        await pool.query(`UPDATE github_profiles SET etag_repos_list = $1 WHERE user_id = $2`, [
          newEtag,
          userId,
        ]);
      }

      let willProcess = 0;
      let filtered = 0;
      const duplicateMap = buildGithubDuplicateMap(repos, githubUsername);

      for (const repo of repos) {
        const duplicateInfo = duplicateMap.get(repo.id) ?? {
          groupKey: null,
          duplicateOfGithubRepoId: null,
          duplicateReason: null,
        };
        const ownerLogin = repo.owner?.login ?? repo.full_name.split('/')[0] ?? null;
        const isDuplicate = duplicateInfo.duplicateOfGithubRepoId !== null;
        const existingRow = await pool.query<ExistingGithubRepo>(
          `SELECT
             gr.id,
             gr.github_pushed_at,
             gr.enrichment_status,
	             gr.etag_readme,
	             gr.etag_languages,
	             gr.etag_commits,
	             gr.repo_content_hash,
	             gr.duplicate_group_key,
	             gr.duplicate_of_github_repo_id,
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
             ) AS has_portfolio_item
           FROM github_repositories gr
           WHERE gr.user_id = $1 AND gr.github_repo_id = $2`,
          [userId, repo.id],
        );

        const existing = existingRow.rows[0];
        const duplicateMetadataChanged = existing
          ? existing.duplicate_group_key !== duplicateInfo.groupKey ||
            Number(existing.duplicate_of_github_repo_id) !==
              Number(duplicateInfo.duplicateOfGithubRepoId)
          : false;
        const hasChanged =
          !existing ||
          new Date(repo.pushed_at) > new Date(existing.github_pushed_at) ||
          existing.enrichment_status === 'failed' ||
          !existing.has_portfolio_item ||
          duplicateMetadataChanged;

        if (!hasChanged) {
          await pool.query(
            `UPDATE github_repositories
             SET last_seen_at = NOW(),
                 deleted_or_archived = $3,
                 last_sync_state = 'skipped',
                 last_sync_run_id = $4,
                 owner_login = $5,
                 duplicate_group_key = $6,
                 duplicate_of_github_repo_id = $7,
                 duplicate_reason = $8
             WHERE user_id = $1 AND github_repo_id = $2`,
            [
              userId,
              repo.id,
              repo.archived,
              syncRunId,
              ownerLogin,
              duplicateInfo.groupKey,
              duplicateInfo.duplicateOfGithubRepoId,
              duplicateInfo.duplicateReason,
            ],
          );
          continue;
        }

        const parts = repo.full_name.split('/');
        const owner = parts[0] ?? '';
        const repoName = parts[1] ?? repo.name;

        const [readmeResult, languagesResult, fileTreeResult, commitsResult] =
          await Promise.allSettled([
            getRepoReadme(accessToken, owner, repoName, existing?.etag_readme ?? null),
            getRepoLanguages(accessToken, owner, repoName, existing?.etag_languages ?? null),
            getRepoTree(accessToken, owner, repoName, repo.default_branch ?? 'main'),
            getRepoCommits(accessToken, owner, repoName, githubUsername, existing?.etag_commits ?? null),
          ]);

        const readme =
          readmeResult.status === 'fulfilled' ? readmeResult.value : { content: null, etag: null };
        const langs =
          languagesResult.status === 'fulfilled'
            ? languagesResult.value
            : { languages: {}, etag: null };
        const tree = fileTreeResult.status === 'fulfilled' ? fileTreeResult.value : [];
        const commits =
          commitsResult.status === 'fulfilled'
            ? commitsResult.value
            : { userCommitCount: 0, totalRecentCommits: 0, sampleMessages: [], etag: null };

        // Contribution analysis
        const contributionLevel = calculateContributionLevel(
          commits.userCommitCount,
          commits.totalRecentCommits,
          ownerLogin,
          githubUsername,
          repo.fork,
        );
        const contributionSummary = buildContributionSummary(
          contributionLevel,
          commits.userCommitCount,
          commits.totalRecentCommits,
          repo.fork,
        );

        const keyFiles: Record<string, unknown> = {};
        for (const [filePath, keyName] of Object.entries(KEY_FILE_PATHS)) {
          // Skip if we already populated this key (e.g. docker-compose.yml already found)
          if (keyFiles[keyName] !== undefined) continue;
          if (tree.includes(filePath)) {
            const content = await getFileContent(accessToken, owner, repoName, filePath);
            if (content) {
              if (filePath === 'package.json') {
                try {
                  keyFiles[keyName] = JSON.parse(content);
                } catch {
                  keyFiles[keyName] = {};
                }
              } else {
                keyFiles[keyName] = content;
              }
            }
          }
        }

        const metadataHash = hashStableJson({
          fullName: repo.full_name,
          description: repo.description,
          homepage: repo.homepage,
          language: repo.language,
          topics: repo.topics ?? [],
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          archived: repo.archived,
          pushedAt: repo.pushed_at,
        });
        const readmeHash = readme.content ? hashNormalizedText(readme.content) : null;
        const languagesHash = hashStableJson(langs.languages);
        const keyFilesHash = hashStableJson(keyFiles);
        const repoContentHash = hashStableJson({
          metadataHash,
          readmeHash,
          languagesHash,
          keyFilesHash,
        });
        const syncState = existing ? 'updated' : 'new';

        await pool.query(
          `INSERT INTO github_repositories (
            user_id, github_repo_id, full_name, name, description,
            html_url, homepage_url, primary_language, language_breakdown,
            topics, stars_count, forks_count, is_fork, is_archived,
            owner_login, duplicate_group_key, duplicate_of_github_repo_id, duplicate_reason,
            has_readme, readme_content, file_tree_sample, key_files,
            github_created_at, github_pushed_at,
            enrichment_status, filter_reason, etag_readme, etag_languages, last_fetched_at,
            metadata_hash, readme_hash, languages_hash, key_files_hash,
            repo_content_hash, last_seen_at, deleted_or_archived,
            last_sync_state, last_sync_run_id,
            user_commit_count, total_recent_commits, contribution_level,
            contribution_summary, etag_commits, sample_commit_messages
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,NOW(),
            $29,$30,$31,$32,$33,NOW(),$34,$35,$36,
            $37,$38,$39,$40,$41,$42
          )
          ON CONFLICT (user_id, github_repo_id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            description = EXCLUDED.description,
            primary_language = EXCLUDED.primary_language,
            language_breakdown = EXCLUDED.language_breakdown,
            topics = EXCLUDED.topics,
            stars_count = EXCLUDED.stars_count,
            forks_count = EXCLUDED.forks_count,
            is_archived = EXCLUDED.is_archived,
            owner_login = EXCLUDED.owner_login,
            duplicate_group_key = EXCLUDED.duplicate_group_key,
            duplicate_of_github_repo_id = EXCLUDED.duplicate_of_github_repo_id,
            duplicate_reason = EXCLUDED.duplicate_reason,
            has_readme = EXCLUDED.has_readme,
            readme_content = CASE WHEN EXCLUDED.readme_content IS NOT NULL
                             THEN EXCLUDED.readme_content
                             ELSE github_repositories.readme_content END,
            file_tree_sample = EXCLUDED.file_tree_sample,
            key_files = EXCLUDED.key_files,
            github_pushed_at = EXCLUDED.github_pushed_at,
            enrichment_status = EXCLUDED.enrichment_status,
            filter_reason = EXCLUDED.filter_reason,
            enrichment_error = NULL,
            etag_readme = EXCLUDED.etag_readme,
            etag_languages = EXCLUDED.etag_languages,
            metadata_hash = EXCLUDED.metadata_hash,
            readme_hash = COALESCE(EXCLUDED.readme_hash, github_repositories.readme_hash),
            languages_hash = EXCLUDED.languages_hash,
            key_files_hash = EXCLUDED.key_files_hash,
            repo_content_hash = EXCLUDED.repo_content_hash,
            last_seen_at = NOW(),
            deleted_or_archived = EXCLUDED.deleted_or_archived,
            last_sync_state = EXCLUDED.last_sync_state,
            last_sync_run_id = EXCLUDED.last_sync_run_id,
            last_fetched_at = NOW(),
            user_commit_count = EXCLUDED.user_commit_count,
            total_recent_commits = EXCLUDED.total_recent_commits,
            contribution_level = EXCLUDED.contribution_level,
            contribution_summary = EXCLUDED.contribution_summary,
            etag_commits = EXCLUDED.etag_commits,
            sample_commit_messages = EXCLUDED.sample_commit_messages`,
          [
            userId,                          // $1
            repo.id,                         // $2
            repo.full_name,                  // $3
            repo.name,                       // $4
            repo.description,                // $5
            repo.html_url,                   // $6
            repo.homepage,                   // $7
            repo.language,                   // $8
            JSON.stringify(langs.languages), // $9
            repo.topics ?? [],               // $10
            repo.stargazers_count,           // $11
            repo.forks_count,                // $12
            repo.fork,                       // $13
            repo.archived,                   // $14
            ownerLogin,                      // $15
            duplicateInfo.groupKey,          // $16
            duplicateInfo.duplicateOfGithubRepoId, // $17
            duplicateInfo.duplicateReason,   // $18
            readme.content !== null,         // $19
            readme.content,                  // $20
            tree,                            // $21
            JSON.stringify(keyFiles),        // $22
            repo.created_at,                 // $23
            repo.pushed_at,                  // $24
            isDuplicate ? 'filtered_out' : 'pending', // $25
            duplicateInfo.duplicateReason,   // $26
            readme.etag,                     // $27
            langs.etag,                      // $28
            // NOW() is $29 (last_fetched_at) — inline
            metadataHash,                    // $29 (via positional shift after NOW())
            readmeHash,                      // $30
            languagesHash,                   // $31
            keyFilesHash,                    // $32
            repoContentHash,                 // $33
            // NOW() is last_seen_at — inline
            repo.archived,                   // $34
            isDuplicate ? 'filtered' : syncState, // $35
            syncRunId,                       // $36
            commits.userCommitCount,         // $37
            commits.totalRecentCommits,      // $38
            contributionLevel,               // $39
            contributionSummary,             // $40
            commits.etag,                    // $41
            commits.sampleMessages,          // $42
          ],
        );

        if (isDuplicate) {
          filtered++;
        } else {
          willProcess++;
        }
      }

      await pool.query(
        `UPDATE github_profiles SET repos_discovered = $1, repos_processed = 0 WHERE user_id = $2`,
        [repos.length, userId],
      );

      await pool
        .query(
          `UPDATE github_repositories
         SET deleted_or_archived = TRUE,
             last_sync_state = 'deleted',
             last_sync_run_id = $2
         WHERE user_id = $1
           AND $3::uuid IS NULL
           AND last_seen_at < NOW() - INTERVAL '1 minute'
           AND last_sync_run_id IS DISTINCT FROM $2`,
          [userId, syncRunId, githubRepositoryId ?? null],
        )
        .catch(() => undefined);

      emit({
        type: 'github_discovery_complete',
        data: { discovered: repos.length, willProcess, filtered },
      });

      const pendingRepos = await pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM github_repositories
         WHERE user_id = $1 AND enrichment_status = 'pending'
           AND ($2::uuid IS NULL OR id = $2)
         ORDER BY github_pushed_at DESC`,
        [userId, githubRepositoryId ?? null],
      );

      if (pendingRepos.rows.length === 0) {
        await finalizeSync(userId, startedAt, syncRunId);
        return;
      }

      const flowProducer = new FlowProducer({ connection });

      await flowProducer.addBulk(
        pendingRepos.rows.map((repo) => ({
          name: `enrich-${repo.id}`,
          queueName: QUEUE_NAMES.GITHUB_ENRICHMENT,
          data: { userId, githubRepositoryId: repo.id },
          opts: {
            attempts: 3,
            backoff: { type: 'exponential' as const, delay: 5000 },
            removeOnComplete: { age: 86400 },
            removeOnFail: { age: 604800 },
          },
        })),
      );
    } catch (error) {
      if (error instanceof GithubRateLimitError) {
        emit({
          type: 'github_rate_limited',
          data: { resumeAt: error.resetAt.toISOString(), processedSoFar: 0 },
        });
        await pool.query(`UPDATE github_profiles SET sync_error = $1 WHERE user_id = $2`, [
          `Rate limited. Resets at ${error.resetAt.toISOString()}`,
          userId,
        ]);
        throw error;
      }

      if (error instanceof GithubTokenRevokedError) {
        await pool.query(`UPDATE users SET github_sync_status = 'failed' WHERE id = $1`, [userId]);
        await pool.query(
          `UPDATE github_profiles SET sync_error = 'GitHub access token revoked. Please reconnect.' WHERE user_id = $1`,
          [userId],
        );
        emit({
          type: 'github_sync_error',
          data: { error: 'GitHub access revoked. Please reconnect your account.' },
        });
        return;
      }

      await pool.query(`UPDATE users SET github_sync_status = 'failed' WHERE id = $1`, [userId]);

      throw error;
    }
  },
  {
    connection,
    concurrency: 3,
    limiter: {
      max: 80,
      duration: 60_000,
    },
  },
);

const finalizeSync = async (
  userId: string,
  startedAt: number,
  syncRunId: string | null = null,
): Promise<void> => {
  const stats = await pool.query(
    `SELECT
      COUNT(*) FILTER (WHERE last_sync_state = 'new') AS added,
      COUNT(*) FILTER (WHERE last_sync_state = 'updated') AS updated,
      COUNT(*) FILTER (WHERE last_sync_state = 'failed' OR enrichment_status = 'failed') AS failed,
      COUNT(*) FILTER (WHERE last_sync_state = 'filtered') AS filtered,
      COUNT(*) FILTER (WHERE last_sync_state = 'skipped') AS skipped,
      COUNT(*) FILTER (WHERE last_sync_state = 'deleted') AS deleted
     FROM github_repositories
     WHERE user_id = $1
       AND ($2::uuid IS NULL OR last_sync_run_id = $2)`,
    [userId, syncRunId],
  );

  const { added, updated, failed, filtered, skipped, deleted } = stats.rows[0] as {
    added: string;
    updated: string;
    failed: string;
    filtered: string;
    skipped: string;
    deleted: string;
  };

  await pool.query(
    `UPDATE users SET github_sync_status = 'idle', sync_started_at = NULL WHERE id = $1`,
    [userId],
  );

  await pool.query(
    `UPDATE github_profiles
     SET last_synced_at = NOW(),
         next_scheduled_sync = NOW() + INTERVAL '7 days',
         sync_error = NULL,
         repos_processed = (SELECT COUNT(*) FROM github_repositories WHERE user_id = $1 AND enrichment_status = 'completed')
     WHERE user_id = $1`,
    [userId],
  );

  if (syncRunId) {
    await pool
      .query(
        `UPDATE github_sync_runs
       SET status = 'completed',
           imported_count = $2,
           updated_count = $3,
           skipped_count = $4,
           filtered_count = $5,
           failed_count = $6,
           deleted_count = $7,
           completed_at = NOW()
       WHERE id = $1`,
        [
          syncRunId,
          parseInt(added, 10),
          parseInt(updated, 10),
          parseInt(skipped, 10),
          parseInt(filtered, 10),
          parseInt(failed, 10),
          parseInt(deleted, 10),
        ],
      )
      .catch(() => undefined);
  }

  try {
    global.wsEmitToUser?.(userId, {
      type: 'github_sync_complete',
      data: {
        added: parseInt(added, 10),
        updated: parseInt(updated, 10),
        skipped: parseInt(skipped, 10),
        filtered: parseInt(filtered, 10),
        failed: parseInt(failed, 10),
        deleted: parseInt(deleted, 10),
        durationMs: Date.now() - startedAt,
      },
    });
  } catch {
    /* ignore */
  }
};

githubDiscoveryWorker.on('failed', (job, err) => {
  console.error(`[github-discovery] Job ${job?.id} failed:`, err.message);
});
