import { Octokit } from '@octokit/rest';
import { AppError } from '../utils/errors.js';

export class GithubRateLimitError extends AppError {
  public readonly resetAt: Date;
  public readonly remaining: number;

  constructor(resetAt: Date, remaining: number) {
    super(`GitHub API rate limit reached. Resets at ${resetAt.toISOString()}`, 429);
    this.resetAt = resetAt;
    this.remaining = remaining;
  }
}

export class GithubTokenRevokedError extends AppError {
  constructor() {
    super('GitHub access token has been revoked or expired', 401);
  }
}

const RATE_LIMIT_SAFETY_THRESHOLD = 100;

const ACCESSIBLE_REPO_LIST_PARAMS = {
  visibility: 'all',
  affiliation: 'owner,collaborator,organization_member',
  sort: 'pushed',
  direction: 'desc',
  per_page: 100,
} as const;

const createOctokit = (token: string): Octokit => {
  return new Octokit({
    auth: token,
    userAgent: 'ResumeAI-Backend/1.0',
  });
};

const checkRateLimit = (headers: Record<string, string | undefined>): void => {
  const remaining = parseInt(headers['x-ratelimit-remaining'] ?? '5000', 10);
  const resetTimestamp = parseInt(headers['x-ratelimit-reset'] ?? '0', 10);

  if (remaining < RATE_LIMIT_SAFETY_THRESHOLD) {
    const resetAt = new Date(resetTimestamp * 1000);
    throw new GithubRateLimitError(resetAt, remaining);
  }
};

export const getAuthenticatedUser = async (token: string) => {
  const octokit = createOctokit(token);
  try {
    const { data, headers } = await octokit.rest.users.getAuthenticated();
    checkRateLimit(headers as Record<string, string | undefined>);
    return data;
  } catch (error) {
    if ((error as { status?: number }).status === 401) {
      throw new GithubTokenRevokedError();
    }
    throw error;
  }
};

export const listUserRepos = async (
  token: string,
  existingEtag?: string | null,
): Promise<{ repos: unknown[]; newEtag: string | null; notModified: boolean }> => {
  const octokit = createOctokit(token);

  try {
    const firstPageResponse = await octokit.rest.repos.listForAuthenticatedUser({
      ...ACCESSIBLE_REPO_LIST_PARAMS,
      page: 1,
      headers: existingEtag ? { 'If-None-Match': existingEtag } : {},
    });

    if ((firstPageResponse as unknown as { status: number }).status === 304) {
      return { repos: [], newEtag: existingEtag ?? null, notModified: true };
    }

    checkRateLimit(firstPageResponse.headers as Record<string, string | undefined>);

    const newEtag = (firstPageResponse.headers as Record<string, string | undefined>)['etag'] ?? null;
    const allRepos: unknown[] = [...firstPageResponse.data];

    const linkHeader = (firstPageResponse.headers as Record<string, string | undefined>)['link'] ?? '';
    if (linkHeader.includes('rel="next"')) {
      const iterator = octokit.paginate.iterator(
        octokit.rest.repos.listForAuthenticatedUser,
        ACCESSIBLE_REPO_LIST_PARAMS,
      );
      let pageCount = 0;
      for await (const { data: pageRepos, headers } of iterator) {
        if (pageCount === 0) { pageCount++; continue; }
        checkRateLimit(headers as Record<string, string | undefined>);
        allRepos.push(...pageRepos);
        pageCount++;
      }
    }

    return { repos: allRepos, newEtag, notModified: false };
  } catch (error) {
    if ((error as { status?: number }).status === 304) {
      return { repos: [], newEtag: existingEtag ?? null, notModified: true };
    }
    if ((error as { status?: number }).status === 401) {
      throw new GithubTokenRevokedError();
    }
    if (error instanceof GithubRateLimitError) throw error;
    throw new AppError(`Failed to list repositories: ${(error as Error).message}`, 502);
  }
};

export const getRepoReadme = async (
  token: string,
  owner: string,
  repo: string,
  existingEtag?: string | null,
): Promise<{ content: string | null; etag: string | null }> => {
  const octokit = createOctokit(token);

  try {
    const response = await octokit.rest.repos.getReadme({
      owner,
      repo,
      headers: existingEtag ? { 'If-None-Match': existingEtag } : {},
    });

    checkRateLimit(response.headers as Record<string, string | undefined>);

    const etag = (response.headers as Record<string, string | undefined>)['etag'] ?? null;
    const content = Buffer.from(response.data.content, 'base64').toString('utf8');

    return { content: content.slice(0, 8000), etag };
  } catch (error) {
    if ((error as { status?: number }).status === 404) {
      return { content: null, etag: null };
    }
    if ((error as { status?: number }).status === 304) {
      return { content: null, etag: existingEtag ?? null };
    }
    if (error instanceof GithubRateLimitError) throw error;
    return { content: null, etag: null };
  }
};

export const getRepoLanguages = async (
  token: string,
  owner: string,
  repo: string,
  existingEtag?: string | null,
): Promise<{ languages: Record<string, number>; etag: string | null }> => {
  const octokit = createOctokit(token);

  try {
    const response = await octokit.rest.repos.listLanguages({
      owner,
      repo,
      headers: existingEtag ? { 'If-None-Match': existingEtag } : {},
    });

    checkRateLimit(response.headers as Record<string, string | undefined>);

    const etag = (response.headers as Record<string, string | undefined>)['etag'] ?? null;
    return { languages: response.data as Record<string, number>, etag };
  } catch (error) {
    if ((error as { status?: number }).status === 304) {
      return { languages: {}, etag: existingEtag ?? null };
    }
    if (error instanceof GithubRateLimitError) throw error;
    return { languages: {}, etag: null };
  }
};

export const getRepoTree = async (
  token: string,
  owner: string,
  repo: string,
  defaultBranch: string,
): Promise<string[]> => {
  const octokit = createOctokit(token);

  try {
    const response = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: defaultBranch,
      recursive: '1',
    });

    checkRateLimit(response.headers as Record<string, string | undefined>);

    return response.data.tree
      .map(item => item.path ?? '')
      .filter(Boolean)
      .slice(0, 200);
  } catch (error) {
    if (error instanceof GithubRateLimitError) throw error;
    return [];
  }
};

export const getFileContent = async (
  token: string,
  owner: string,
  repo: string,
  path: string,
): Promise<string | null> => {
  const octokit = createOctokit(token);

  try {
    const response = await octokit.rest.repos.getContent({ owner, repo, path });

    checkRateLimit(response.headers as Record<string, string | undefined>);

    const data = response.data as { type?: string; content?: string; encoding?: string };
    if (data.type !== 'file' || !data.content) return null;

    const decoded = Buffer.from(data.content, 'base64').toString('utf8');
    return decoded.slice(0, 3000);
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    if (error instanceof GithubRateLimitError) throw error;
    return null;
  }
};

export const getRepoCommits = async (
  token: string,
  owner: string,
  repo: string,
  githubUsername: string,
  existingEtag?: string | null,
): Promise<{
  userCommitCount: number;
  totalRecentCommits: number;
  sampleMessages: string[];
  etag: string | null;
}> => {
  const octokit = createOctokit(token);

  try {
    const response = await octokit.rest.repos.listCommits({
      owner,
      repo,
      per_page: 50,
      headers: existingEtag ? { 'If-None-Match': existingEtag } : {},
    });

    checkRateLimit(response.headers as Record<string, string | undefined>);

    const etag = (response.headers as Record<string, string | undefined>)['etag'] ?? null;
    const commits = response.data;
    const totalRecentCommits = commits.length;
    const username = githubUsername.toLowerCase();

    const userCommits = commits.filter((commit) => {
      const authorLogin = (commit.author?.login ?? '').toLowerCase();
      const committerLogin = (commit.committer?.login ?? '').toLowerCase();
      return authorLogin === username || (committerLogin === username && authorLogin === '');
    });

    const sampleMessages = userCommits
      .slice(0, 8)
      .map((commit) => commit.commit.message.split('\n')[0]?.slice(0, 120) ?? '')
      .filter(Boolean);

    return { userCommitCount: userCommits.length, totalRecentCommits, sampleMessages, etag };
  } catch (error) {
    if ((error as { status?: number }).status === 304) {
      return { userCommitCount: 0, totalRecentCommits: 0, sampleMessages: [], etag: existingEtag ?? null };
    }
    if ((error as { status?: number }).status === 409) {
      // Empty repository — no commits yet
      return { userCommitCount: 0, totalRecentCommits: 0, sampleMessages: [], etag: null };
    }
    if (error instanceof GithubRateLimitError) throw error;
    return { userCommitCount: 0, totalRecentCommits: 0, sampleMessages: [], etag: null };
  }
};

export const revokeToken = async (
  clientId: string,
  clientSecret: string,
  token: string,
): Promise<void> => {
  try {
    await fetch(`https://api.github.com/applications/${clientId}/token`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({ access_token: token }),
    });
  } catch {
    // Swallow errors — token may already be revoked
  }
};
