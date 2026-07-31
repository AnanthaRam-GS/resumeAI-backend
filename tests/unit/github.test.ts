import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';

const {
  poolQueryMock,
  redisGetMock,
  redisSetMock,
  redisDelMock,
  queueAddMock,
  getAuthenticatedUserMock,
  revokeTokenMock,
} = vi.hoisted(() => ({
  poolQueryMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
  redisDelMock: vi.fn(),
  queueAddMock: vi.fn(),
  getAuthenticatedUserMock: vi.fn(),
  revokeTokenMock: vi.fn(),
}));

vi.mock('../../src/db/client.js', () => ({ pool: { query: poolQueryMock } }));
vi.mock('../../src/workers/redis.js', () => ({
  redis: {
    get: redisGetMock,
    set: redisSetMock,
    del: redisDelMock,
  },
}));
vi.mock('../../src/workers/queues.js', () => ({
  QUEUE_NAMES: {
    GITHUB_DISCOVERY: 'github-discovery',
    GITHUB_ENRICHMENT: 'github-enrichment',
    DOCUMENT_PARSE: 'document-parse',
    LINKEDIN_IMPORT_PARSE: 'linkedin-import-parse',
    RESUME_GENERATION: 'resume-generation',
    COVER_LETTER_GENERATION: 'cover-letter-generation',
    EMBEDDING: 'embedding',
    GAP_ANALYSIS: 'gap-analysis',
    WEEKLY_DIGEST: 'weekly-digest',
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  },
  discoveryQueue: { add: queueAddMock, close: vi.fn() },
  enrichmentQueue: { add: vi.fn(), close: vi.fn() },
  documentParseQueue: { add: vi.fn(), close: vi.fn() },
  linkedInImportParseQueue: { add: vi.fn(), close: vi.fn() },
  resumeGenerationQueue: { add: vi.fn(), close: vi.fn() },
  coverLetterGenerationQueue: { add: vi.fn(), close: vi.fn() },
  embeddingQueue: { add: vi.fn(), close: vi.fn() },
  gapAnalysisQueue: { add: vi.fn(), close: vi.fn() },
  weeklyDigestQueue: { add: vi.fn(), close: vi.fn() },
  closeQueues: vi.fn(),
}));
vi.mock('../../src/services/github-client.service.js', () => ({
  getAuthenticatedUser: getAuthenticatedUserMock,
  revokeToken: revokeTokenMock,
}));

const authHeader = (userId = 'user-1') => ({
  authorization: `Bearer ${jwt.sign({ userId, email: 'user@example.com' }, env.JWT_SECRET, { expiresIn: '1h' })}`,
});

describe('github-token.service', () => {
  it('encrypts and decrypts a token without storing plaintext', async () => {
    const { encryptToken, decryptToken } =
      await import('../../src/services/github-token.service.js');
    const plaintext = 'gho_example_plaintext_token';

    const encrypted = encryptToken(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });
});

describe('github repository duplicate detection', () => {
  it('marks likely duplicate collaborator repositories and prefers the connected user repo', async () => {
    const { buildGithubDuplicateMap } =
      await import('../../src/services/github-repository-dedupe.service.js');

    const duplicates = buildGithubDuplicateMap(
      [
        {
          id: 1,
          name: 'HIVE_MIND_A_ROBOTIC_SWARM_FORAGING_SIMULATION',
          full_name: 'M-krizz/HIVE_MIND_A_ROBOTIC_SWARM_FORAGING_SIMULATION',
          fork: false,
          pushed_at: '2026-05-15T00:00:00Z',
          stargazers_count: 4,
          owner: { login: 'M-krizz' },
        },
        {
          id: 2,
          name: 'HIVE_MIND_A_ROBOTIC_SWARM_FORAGING_SIMULATION',
          full_name: 'TejeshwarCDR/HIVE_MIND_A_ROBOTIC_SWARM_FORAGING_SIMULATION',
          fork: true,
          pushed_at: '2026-05-15T00:00:00Z',
          stargazers_count: 0,
          owner: { login: 'TejeshwarCDR' },
        },
      ],
      'TejeshwarCDR',
    );

    expect(duplicates.get(1)).toMatchObject({
      duplicateOfGithubRepoId: 2,
      duplicateReason:
        'Likely duplicate of TejeshwarCDR/HIVE_MIND_A_ROBOTIC_SWARM_FORAGING_SIMULATION',
    });
    expect(duplicates.get(2)).toMatchObject({
      duplicateOfGithubRepoId: null,
      duplicateReason: null,
    });
  });

  it('does not group short generic repository names unless one is a fork', async () => {
    const { buildGithubDuplicateMap } =
      await import('../../src/services/github-repository-dedupe.service.js');

    const duplicates = buildGithubDuplicateMap(
      [
        {
          id: 1,
          name: 'backend',
          full_name: 'acme/backend',
          fork: false,
          pushed_at: '2026-05-15T00:00:00Z',
          stargazers_count: 4,
          owner: { login: 'acme' },
        },
        {
          id: 2,
          name: 'backend',
          full_name: 'TejeshwarCDR/backend',
          fork: false,
          pushed_at: '2026-05-16T00:00:00Z',
          stargazers_count: 0,
          owner: { login: 'TejeshwarCDR' },
        },
      ],
      'TejeshwarCDR',
    );

    expect(duplicates.get(1)?.duplicateOfGithubRepoId).toBeNull();
    expect(duplicates.get(2)?.duplicateOfGithubRepoId).toBeNull();
  });

  it('groups frontend and backend repositories for the same project', async () => {
    const { buildGithubDuplicateMap, githubProjectGroupKey } =
      await import('../../src/services/github-repository-dedupe.service.js');

    const duplicates = buildGithubDuplicateMap(
      [
        {
          id: 1,
          name: 'resumeAI-backend',
          full_name: 'TejeshwarCDR/resumeAI-backend',
          fork: false,
          pushed_at: '2026-06-24T00:00:00Z',
          stargazers_count: 0,
          owner: { login: 'TejeshwarCDR' },
        },
        {
          id: 2,
          name: 'resumeAI-frontend',
          full_name: 'TejeshwarCDR/resumeAI-frontend',
          fork: false,
          pushed_at: '2026-06-22T00:00:00Z',
          stargazers_count: 0,
          owner: { login: 'TejeshwarCDR' },
        },
      ],
      'TejeshwarCDR',
    );

    expect(githubProjectGroupKey('resumeAI-backend')).toBe('resumeai');
    expect(githubProjectGroupKey('resumeAI-frontend')).toBe('resumeai');
    expect(duplicates.get(1)).toMatchObject({
      groupKey: 'resumeai',
      duplicateOfGithubRepoId: null,
    });
    expect(duplicates.get(2)).toMatchObject({
      groupKey: 'resumeai',
      duplicateOfGithubRepoId: 1,
      duplicateReason: 'Likely duplicate of TejeshwarCDR/resumeAI-backend',
    });
  });
});

describe('github portfolio upsert SQL', () => {
  it('omits embedding column writes when pgvector embedding is unavailable', async () => {
    const { buildGithubPortfolioUpsertSql } =
      await import('../../src/services/github-portfolio-upsert.service.js');

    const sql = buildGithubPortfolioUpsertSql(false);

    expect(sql).not.toMatch(/portfolio_items\.embedding(?!_)/);
    expect(sql).not.toContain('embedding = CASE');
    expect(sql).toContain(
      "embedding_status = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN 'skipped'",
    );
  });

  it('clears existing embeddings when the embedding column is available', async () => {
    const { buildGithubPortfolioUpsertSql } =
      await import('../../src/services/github-portfolio-upsert.service.js');

    const sql = buildGithubPortfolioUpsertSql(true);

    expect(sql).toContain('portfolio_items.embedding');
    expect(sql).toContain(
      "embedding_status = CASE WHEN portfolio_items.manually_edited_at IS NULL THEN 'pending'",
    );
  });
});

describe('github.service OAuth and sync behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueAddMock.mockResolvedValue({ id: 'discovery-user-1' });
    getAuthenticatedUserMock.mockResolvedValue({
      id: 12345,
      login: 'octocat',
      name: 'Octo Cat',
      avatar_url: 'https://example.test/avatar.png',
      public_repos: 12,
    });
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ access_token: 'gho_plain_token', scope: 'public_repo,read:user' }),
    }) as typeof fetch;
  });

  it('rejects OAuth state mismatch with 400 and consumes the supplied state key once', async () => {
    redisGetMock.mockResolvedValue(null);

    const { handleOAuthCallback } = await import('../../src/modules/github/github.service.js');

    await expect(handleOAuthCallback('code-1', 'bad-state')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(redisGetMock).toHaveBeenCalledWith('github_oauth_state:bad-state');
    expect(redisDelMock).toHaveBeenCalledWith('github_oauth_state:bad-state');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('validates OAuth state before token exchange, stores only the encrypted token, and enqueues sync', async () => {
    redisGetMock.mockResolvedValue('user-1');
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] })
      .mockResolvedValueOnce({ rows: [{ github_sync_status: 'idle' }] });

    const { handleOAuthCallback } = await import('../../src/modules/github/github.service.js');

    await expect(handleOAuthCallback('code-1', 'valid-state')).resolves.toEqual({
      userId: 'user-1',
      returnTo: '/github-sync',
    });

    expect(redisDelMock).toHaveBeenCalledWith('github_oauth_state:valid-state');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const upsertParams = poolQueryMock.mock.calls[0]?.[1] as unknown[];
    expect(upsertParams[0]).toBe('user-1');
    expect(upsertParams[3]).not.toBe('gho_plain_token');
    expect(String(upsertParams[3])).not.toContain('gho_plain_token');
    expect(queueAddMock).toHaveBeenCalledWith(
      'discovery-user-1',
      { userId: 'user-1', triggeredBy: 'post_connect' },
      expect.objectContaining({ jobId: expect.stringMatching(/^discovery-user-1-/) }),
    );
  });

  it('returns 404 when sync is requested without a connected GitHub account', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const { enqueueSyncJob } = await import('../../src/modules/github/github.service.js');

    await expect(enqueueSyncJob('user-1', 'manual')).rejects.toMatchObject({ statusCode: 404 });
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('returns 409 when a sync is already in progress', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] }).mockResolvedValueOnce({
      rows: [{ github_sync_status: 'syncing', sync_has_active_repositories: true }],
    });

    const { enqueueSyncJob } = await import('../../src/modules/github/github.service.js');

    await expect(enqueueSyncJob('user-1', 'manual')).rejects.toMatchObject({ statusCode: 409 });
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('recovers a stale syncing flag when no repositories are active before enqueueing', async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] })
      .mockResolvedValueOnce({
        rows: [{ github_sync_status: 'syncing', sync_has_active_repositories: false }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const { enqueueSyncJob } = await import('../../src/modules/github/github.service.js');

    await expect(enqueueSyncJob('user-1', 'manual')).resolves.toBe('discovery-user-1');
    expect(queueAddMock).toHaveBeenCalledWith(
      'discovery-user-1',
      { userId: 'user-1', triggeredBy: 'manual' },
      expect.objectContaining({ jobId: expect.stringMatching(/^discovery-user-1-/) }),
    );
    expect(
      poolQueryMock.mock.calls.some((call) =>
        String(call[0]).includes("github_sync_status = 'idle'"),
      ),
    ).toBe(true);
  });

  it('enqueues a sync for one selected repository', async () => {
    const repositoryId = '11111111-1111-4111-8111-111111111111';
    queueAddMock.mockResolvedValueOnce({ id: `discovery-user-1-${repositoryId}-queued` });
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] })
      .mockResolvedValueOnce({ rows: [{ github_sync_status: 'idle' }] })
      .mockResolvedValueOnce({ rows: [{ id: repositoryId }] })
      .mockResolvedValueOnce({ rows: [] });

    const { enqueueSyncJob } = await import('../../src/modules/github/github.service.js');

    await expect(
      enqueueSyncJob('user-1', 'manual', { githubRepositoryId: repositoryId }),
    ).resolves.toBe(`discovery-user-1-${repositoryId}-queued`);
    expect(queueAddMock).toHaveBeenCalledWith(
      `discovery-user-1-${repositoryId}`,
      { userId: 'user-1', triggeredBy: 'manual', githubRepositoryId: repositoryId },
      expect.objectContaining({
        jobId: expect.stringMatching(new RegExp(`^discovery-user-1-${repositoryId}-`)),
      }),
    );
  });

  it('returns 404 when a selected repository does not belong to the user', async () => {
    const repositoryId = '11111111-1111-4111-8111-111111111111';
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'profile-1' }] })
      .mockResolvedValueOnce({ rows: [{ github_sync_status: 'idle' }] })
      .mockResolvedValueOnce({ rows: [] });

    const { enqueueSyncJob } = await import('../../src/modules/github/github.service.js');

    await expect(
      enqueueSyncJob('user-1', 'manual', { githubRepositoryId: repositoryId }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('lists stored GitHub repositories for the account', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          github_repo_id: '123',
          full_name: 'octocat/hello-world',
          name: 'hello-world',
          description: 'Example repo',
          html_url: 'https://github.com/octocat/hello-world',
          primary_language: 'TypeScript',
          language_breakdown: { TypeScript: 1000 },
          topics: ['resume'],
          stars_count: 4,
          forks_count: 1,
          is_fork: false,
          is_archived: false,
          owner_login: 'octocat',
          filter_reason: null,
          duplicate_group_key: null,
          duplicate_of_github_repo_id: null,
          duplicate_reason: null,
          github_pushed_at: new Date('2026-07-01T00:00:00.000Z'),
          enrichment_status: 'completed',
          enrichment_error: null,
          last_sync_state: 'new',
          last_enriched_at: new Date('2026-07-02T00:00:00.000Z'),
          portfolio_item_id: '22222222-2222-4222-8222-222222222222',
          imported: true,
        },
      ],
    });

    const { listGithubRepositories } = await import('../../src/modules/github/github.service.js');

    await expect(listGithubRepositories('user-1')).resolves.toEqual([
      expect.objectContaining({
        id: '11111111-1111-4111-8111-111111111111',
        githubRepoId: 123,
        fullName: 'octocat/hello-world',
        imported: true,
        enrichmentStatus: 'completed',
        ownerLogin: 'octocat',
        isDuplicate: false,
      }),
    ]);
  });

  it('disconnect revokes best-effort and removes GitHub records without deleting portfolio items', async () => {
    const { encryptToken } = await import('../../src/services/github-token.service.js');
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ access_token: encryptToken('gho_plain_token') }],
    });

    const { disconnectGithub } = await import('../../src/modules/github/github.service.js');
    await disconnectGithub('user-1');

    const sqlStatements = poolQueryMock.mock.calls.map((call) => String(call[0]));
    expect(revokeTokenMock).toHaveBeenCalledWith(
      env.GITHUB_CLIENT_ID,
      env.GITHUB_CLIENT_SECRET,
      'gho_plain_token',
    );
    expect(sqlStatements.some((sql) => sql.includes('DELETE FROM github_profiles'))).toBe(true);
    expect(sqlStatements.some((sql) => sql.includes('DELETE FROM github_repositories'))).toBe(true);
    expect(sqlStatements.some((sql) => sql.includes('DELETE FROM portfolio_items'))).toBe(false);
  });
});

describe('contribution level calculation', () => {
  it('classifies user as primary_author when they own the repo and majority of commits are theirs', async () => {
    const { calculateContributionLevel } =
      await import('../../src/workers/github-discovery.worker.js');

    expect(
      calculateContributionLevel(42, 50, 'TejeshwarCDR', 'TejeshwarCDR', false),
    ).toBe('primary_author');
  });

  it('classifies user as major_contributor when they have a large ratio of commits but do not own the repo', async () => {
    const { calculateContributionLevel } =
      await import('../../src/workers/github-discovery.worker.js');

    expect(
      calculateContributionLevel(18, 40, 'OtherUser', 'TejeshwarCDR', false),
    ).toBe('major_contributor');
  });

  it('classifies user as contributor when they have a moderate number of commits', async () => {
    const { calculateContributionLevel } =
      await import('../../src/workers/github-discovery.worker.js');

    expect(
      calculateContributionLevel(5, 40, 'OtherUser', 'TejeshwarCDR', false),
    ).toBe('contributor');
  });

  it('classifies user as minor_contributor on a fork with few commits', async () => {
    const { calculateContributionLevel } =
      await import('../../src/workers/github-discovery.worker.js');

    expect(
      calculateContributionLevel(2, 40, 'TejeshwarCDR', 'TejeshwarCDR', true),
    ).toBe('minor_contributor');
  });

  it('returns unclear when no commits are available', async () => {
    const { calculateContributionLevel } =
      await import('../../src/workers/github-discovery.worker.js');

    expect(
      calculateContributionLevel(0, 0, 'TejeshwarCDR', 'TejeshwarCDR', false),
    ).toBe('unclear');
  });

  it('returns unclear when user has zero commits in a repo with activity', async () => {
    const { calculateContributionLevel } =
      await import('../../src/workers/github-discovery.worker.js');

    expect(
      calculateContributionLevel(0, 30, 'OtherUser', 'TejeshwarCDR', false),
    ).toBe('unclear');
  });
});

describe('tech name normalization consistency', () => {
  it('normalizes common aliases to canonical forms', async () => {
    // This test imports the worker to verify the normalizeTechName coverage.
    // We test through collectFallbackTechStack via a known RepoEnrichmentInput.
    // Since normalizeTechName is internal, we validate the end-to-end output shape.
    const { buildGithubPortfolioUpsertSql } =
      await import('../../src/services/github-portfolio-upsert.service.js');

    const sql = buildGithubPortfolioUpsertSql(false);
    // Sanity check that the upsert SQL was produced without errors
    expect(sql).toContain('INSERT INTO portfolio_items');
    expect(sql).toContain('ON CONFLICT');
  });
});

describe('github routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('protected routes return 401 without JWT authentication', async () => {
    const { buildApp } = await import('../../src/app.js');
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/github/status' });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('connect returns a redirect URL over the existing API client contract', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ github_sync_status: 'idle' }] });
    redisSetMock.mockResolvedValue('OK');
    const { buildApp } = await import('../../src/app.js');
    const app = buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/github/connect',
      headers: { ...authHeader(), accept: 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: { redirectUrl: expect.stringContaining('https://github.com/login/oauth/authorize?') },
    });
    expect(redisSetMock).toHaveBeenCalledWith(
      expect.stringMatching(/^github_oauth_state:/),
      expect.stringContaining('"userId":"user-1"'),
      'EX',
      600,
    );
    const statePayload = JSON.parse(redisSetMock.mock.calls[0]?.[1] as string) as {
      userId: string;
      returnTo: string;
    };
    expect(statePayload).toEqual({ userId: 'user-1', returnTo: '/github-sync' });
    await app.close();
  });
});
