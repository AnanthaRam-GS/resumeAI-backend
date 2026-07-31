import type { GithubApiRepo } from '../types/github.types.js';

export interface GithubDuplicateInfo {
  groupKey: string | null;
  duplicateOfGithubRepoId: number | null;
  duplicateReason: string | null;
}

type RepoWithDuplicateFields = Pick<
  GithubApiRepo,
  'id' | 'name' | 'full_name' | 'fork' | 'pushed_at' | 'stargazers_count'
> & {
  owner?: { login?: string | null } | null;
};

const normalizeRepositoryName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const COMPONENT_SUFFIXES = new Set(['api', 'backend', 'client', 'frontend', 'server', 'web']);

export const githubProjectGroupKey = (name: string): string => {
  const normalized = normalizeRepositoryName(name);
  const parts = normalized.split('-').filter(Boolean);
  const suffix = parts.at(-1);

  if (!suffix || !COMPONENT_SUFFIXES.has(suffix) || parts.length < 2) {
    return normalized;
  }

  const base = parts.slice(0, -1).join('-');
  return isSpecificComponentBase(base) ? base : normalized;
};

const isSpecificProjectName = (key: string): boolean => {
  if (key.length >= 16) return true;
  return key.split('-').filter(Boolean).length >= 3 && key.length >= 10;
};

const isSpecificComponentBase = (key: string): boolean =>
  isSpecificProjectName(key) || key.length >= 6;

const repoOwner = (repo: RepoWithDuplicateFields): string =>
  repo.owner?.login ?? repo.full_name.split('/')[0] ?? '';

const canonicalScore = (repo: RepoWithDuplicateFields, githubUsername: string): number => {
  let score = 0;
  if (repoOwner(repo).toLowerCase() === githubUsername.toLowerCase()) score += 1_000_000;
  if (!repo.fork) score += 100_000;
  score += Math.min(repo.stargazers_count ?? 0, 10_000);
  score += Math.floor(new Date(repo.pushed_at).getTime() / 86_400_000);
  return score;
};

const chooseCanonicalRepo = (
  repos: RepoWithDuplicateFields[],
  githubUsername: string,
): RepoWithDuplicateFields => {
  const canonical = [...repos].sort((a, b) => {
    const scoreDiff = canonicalScore(b, githubUsername) - canonicalScore(a, githubUsername);
    if (scoreDiff !== 0) return scoreDiff;
    return a.id - b.id;
  })[0];

  if (!canonical) {
    throw new Error('Cannot choose canonical repository from an empty duplicate group');
  }

  return canonical;
};

export const buildGithubDuplicateMap = (
  repos: RepoWithDuplicateFields[],
  githubUsername: string,
): Map<number, GithubDuplicateInfo> => {
  const result = new Map<number, GithubDuplicateInfo>();
  const groups = new Map<string, RepoWithDuplicateFields[]>();

  for (const repo of repos) {
    const groupKey = githubProjectGroupKey(repo.name);
    result.set(repo.id, {
      groupKey: groupKey || null,
      duplicateOfGithubRepoId: null,
      duplicateReason: null,
    });

    if (!groupKey) continue;
    const currentGroup = groups.get(groupKey) ?? [];
    currentGroup.push(repo);
    groups.set(groupKey, currentGroup);
  }

  for (const [groupKey, group] of groups.entries()) {
    const hasFork = group.some((repo) => repo.fork);
    const hasComponentSuffixPair =
      group.filter(
        (repo) => githubProjectGroupKey(repo.name) !== normalizeRepositoryName(repo.name),
      ).length >= 2;

    if (
      group.length < 2 ||
      (!hasFork && !hasComponentSuffixPair && !isSpecificProjectName(groupKey))
    ) {
      continue;
    }

    const canonical = chooseCanonicalRepo(group, githubUsername);
    for (const repo of group) {
      if (repo.id === canonical.id) continue;
      result.set(repo.id, {
        groupKey,
        duplicateOfGithubRepoId: canonical.id,
        duplicateReason: `Likely duplicate of ${canonical.full_name}`,
      });
    }
  }

  return result;
};
