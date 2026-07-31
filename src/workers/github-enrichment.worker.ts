import { Worker } from 'bullmq';
import { pool } from '../db/client.js';
import { QUEUE_NAMES } from './queues.js';
import { requestGroqJson } from '../services/groq.service.js';
import { env } from '../config/env.js';
import { upsertGithubPortfolioItem } from '../services/github-portfolio-upsert.service.js';

const connection = { url: env.REDIS_URL };
import { githubRepoEnrichmentPrompt } from '../modules/ai/prompts/github-repo-enrichment.prompt.js';
import type {
  GithubEnrichmentJobData,
  GithubRepositoryRow,
  RepoEnrichmentInput,
  RepoEnrichmentOutput,
  ContributionLevel,
} from '../types/github.types.js';

const CONTRIBUTION_LEVEL_RANK: Record<ContributionLevel, number> = {
  primary_author: 5,
  major_contributor: 4,
  contributor: 3,
  minor_contributor: 2,
  unclear: 1,
};

const normalizeRepositoryName = (name: string): string =>
  name
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const stripMarkdown = (value: string): string =>
  value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractReadmeParagraph = (readme: string): string | null => {
  const paragraphs = readme
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(stripMarkdown)
    .filter(
      (paragraph) =>
        paragraph.length >= 60 &&
        !/^(installation|install|setup|usage|license|contributing|table of contents)\b/i.test(
          paragraph,
        ) &&
        !/^https?:\/\//i.test(paragraph),
    );

  return paragraphs[0]?.slice(0, 420) ?? null;
};

const normalizeTechName = (value: string): string => {
  const normalized = value.trim();
  const known: Record<string, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    react: 'React',
    node: 'Node.js',
    nodejs: 'Node.js',
    nextjs: 'Next.js',
    next: 'Next.js',
    postgresql: 'PostgreSQL',
    postgres: 'PostgreSQL',
    mongodb: 'MongoDB',
    docker: 'Docker',
    kubernetes: 'Kubernetes',
    tailwindcss: 'Tailwind CSS',
    tailwind: 'Tailwind CSS',
    fastify: 'Fastify',
    express: 'Express',
    prisma: 'Prisma',
    drizzle: 'Drizzle ORM',
    supabase: 'Supabase',
    redis: 'Redis',
    graphql: 'GraphQL',
    vue: 'Vue.js',
    angular: 'Angular',
    svelte: 'Svelte',
    rust: 'Rust',
    golang: 'Go',
    java: 'Java',
    kotlin: 'Kotlin',
    swift: 'Swift',
    flutter: 'Flutter',
    dart: 'Dart',
  };
  return known[normalized.toLowerCase().replace(/[\s._-]/g, '')] ?? normalized;
};

const collectFallbackTechStack = (input: RepoEnrichmentInput): string[] => {
  const values = [
    input.primaryLanguage,
    ...Object.keys(input.languageBreakdown),
    ...input.topics,
    ...Object.keys(input.keyFiles.packageJson?.dependencies ?? {}),
    ...Object.keys(input.keyFiles.packageJson?.devDependencies ?? {}),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(values.map(normalizeTechName))]
    .filter((value) => value.length > 1)
    .slice(0, 10);
};

const inferDomainCategory = (
  input: RepoEnrichmentInput,
): RepoEnrichmentOutput['domainCategory'] => {
  const haystack = [
    input.repoName,
    input.repoDescription ?? '',
    input.primaryLanguage ?? '',
    ...input.topics,
    ...input.fileTreeSample,
  ]
    .join(' ')
    .toLowerCase();

  if (/\b(ml|machine-learning|ai|model|notebook|tensorflow|pytorch)\b/.test(haystack))
    return 'Machine Learning';
  if (/\b(android|ios|react-native|flutter|mobile)\b/.test(haystack)) return 'Mobile Development';
  if (/\b(cli|command-line|terminal)\b/.test(haystack)) return 'Developer Tools';
  if (/\b(docker|kubernetes|terraform|ansible|deploy|infra|ci)\b/.test(haystack))
    return 'DevOps & Infrastructure';
  if (/\b(game|unity|phaser)\b/.test(haystack)) return 'Game Development';
  if (/\b(data|etl|pipeline|spark|airflow)\b/.test(haystack)) return 'Data Engineering';
  if (/\b(crate|library|package|sdk)\b/.test(haystack)) return 'Open Source Library';
  if (/\b(api|server|backend|express|fastify)\b/.test(haystack)) return 'Web Development';
  return 'Other';
};

const inferProjectType = (input: RepoEnrichmentInput): RepoEnrichmentOutput['projectType'] => {
  const haystack = [
    input.repoName,
    input.repoDescription ?? '',
    ...input.topics,
    ...input.fileTreeSample,
  ]
    .join(' ')
    .toLowerCase();
  if (/\b(cli|command-line)\b/.test(haystack)) return 'CLI Tool';
  if (/\b(api|server|backend|fastify|express)\b/.test(haystack)) return 'Backend API';
  if (/\b(react|vue|angular|frontend|vite)\b/.test(haystack)) return 'Frontend Application';
  if (/\b(package|library|sdk)\b/.test(haystack)) return 'Library / Package';
  if (/\b(data|etl|pipeline)\b/.test(haystack)) return 'Data Pipeline';
  if (/\b(ml|model|machine-learning)\b/.test(haystack)) return 'ML Model';
  if (/\b(docker|terraform|kubernetes|infra)\b/.test(haystack)) return 'Infrastructure / DevOps';
  return 'Other';
};

const buildContributionSummaryFallback = (input: RepoEnrichmentInput): string => {
  const { contributionLevel, userCommitCount, totalRecentCommits, isFork, sampleCommitMessages } =
    input;
  const commitDetail =
    totalRecentCommits > 0
      ? ` (${userCommitCount} of ${totalRecentCommits} recent commits)`
      : '';
  const msgHint =
    sampleCommitMessages.length > 0
      ? ` Key contributions: ${sampleCommitMessages.slice(0, 3).join('; ')}.`
      : '';

  switch (contributionLevel) {
    case 'primary_author':
      return `Primary author${commitDetail}.${msgHint}`;
    case 'major_contributor':
      return `Major contributor${commitDetail}.${msgHint}`;
    case 'contributor':
      return `Active contributor${commitDetail}.${msgHint}`;
    case 'minor_contributor':
      return isFork
        ? `Extended a fork of this project${commitDetail}.${msgHint}`
        : `Contributor${commitDetail}.${msgHint}`;
    default:
      return 'Contribution level could not be determined from available commit data.';
  }
};

const buildFallbackEnrichment = (input: RepoEnrichmentInput): RepoEnrichmentOutput => {
  const title = normalizeRepositoryName(input.repoName);
  const readmeSummary = extractReadmeParagraph(input.readmeContent);
  const techStack = collectFallbackTechStack(input);
  const technologies = techStack.length > 0 ? ` It uses ${techStack.slice(0, 4).join(', ')}.` : '';
  const sourceSummary =
    input.repoDescription ??
    readmeSummary ??
    'The repository includes project source code and documentation imported directly from GitHub.';

  const verb =
    input.contributionLevel === 'primary_author'
      ? 'Built'
      : input.contributionLevel === 'major_contributor'
        ? 'Co-developed'
        : input.contributionLevel === 'contributor'
          ? 'Contributed to'
          : input.isFork
            ? 'Extended'
            : 'Contributed to';

  const description =
    input.contributionLevel === 'primary_author' || input.contributionLevel === 'major_contributor'
      ? `${verb} ${stripMarkdown(sourceSummary).replace(/[.!?]?$/, '.')}${technologies}`
      : `${verb} a project — ${stripMarkdown(sourceSummary).replace(/[.!?]?$/, '.')}${technologies}`;

  return {
    title,
    description,
    userContributionSummary: buildContributionSummaryFallback(input),
    techStack,
    domainCategory: inferDomainCategory(input),
    projectType: inferProjectType(input),
    impactMetrics:
      input.stars > 0 ? `${input.stars} GitHub star${input.stars === 1 ? '' : 's'}` : null,
    keyAchievements: [stripMarkdown(sourceSummary).replace(/[.!?]?$/, '.')],
    hasTests: input.fileTreeSample.some((path) =>
      /(^|\/)(__tests__|tests?|spec)(\/|$)|\.(test|spec)\./i.test(path),
    ),
    hasCiCd: input.fileTreeSample.some((path) =>
      /^\.github\/workflows\/|\.gitlab-ci\.yml$|Jenkinsfile$/i.test(path),
    ),
    isTeamProject:
      /\b(contributors|collaborators|team)\b/i.test(input.readmeContent) ||
      (input.totalRecentCommits > 0 &&
        input.userCommitCount < input.totalRecentCommits &&
        input.totalRecentCommits - input.userCommitCount >= 3),
    complexitySignal: techStack.length >= 5 || input.fileTreeSample.length >= 25 ? 'medium' : 'low',
  };
};

const getEnrichmentOutput = async (input: RepoEnrichmentInput): Promise<RepoEnrichmentOutput> => {
  try {
    return await requestGroqJson<RepoEnrichmentOutput>({
      systemPrompt: githubRepoEnrichmentPrompt,
      userPrompt: JSON.stringify(input),
      maxTokens: 1200,
      temperature: 0.2,
    });
  } catch (error) {
    console.warn(
      '[github-enrichment] Falling back to deterministic README parsing:',
      (error as Error).message,
    );
    return buildFallbackEnrichment(input);
  }
};

const normalizedGithubUrlAliases = (htmlUrl: string): string[] => {
  const withoutTrailingSlash = htmlUrl.replace(/\/+$/, '');
  const withoutGit = withoutTrailingSlash.replace(/\.git$/i, '');
  const variants = [withoutGit, withoutGit.replace(/^https:\/\//i, 'http://')];

  return [...new Set(variants.map((value) => value.toLowerCase()))];
};

const COMPONENT_SUFFIXES = new Set(['api', 'backend', 'client', 'frontend', 'server', 'web']);

const normalizedProjectGroupName = (name: string): string => {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const parts = normalized.split('-').filter(Boolean);
  const suffix = parts.at(-1);
  return suffix && COMPONENT_SUFFIXES.has(suffix) && parts.length > 1
    ? parts.slice(0, -1).join('-')
    : normalized;
};

const mergeLanguageBreakdowns = (repos: GithubRepositoryRow[]): Record<string, number> => {
  const merged: Record<string, number> = {};
  for (const repo of repos) {
    const languages = (repo.language_breakdown as Record<string, number>) ?? {};
    for (const [language, bytes] of Object.entries(languages)) {
      merged[language] = (merged[language] ?? 0) + bytes;
    }
  }
  return merged;
};

const mergePackageJson = (
  repos: GithubRepositoryRow[],
): RepoEnrichmentInput['keyFiles']['packageJson'] | undefined => {
  const merged: NonNullable<RepoEnrichmentInput['keyFiles']['packageJson']> = {
    dependencies: {},
    devDependencies: {},
    scripts: {},
  };

  for (const repo of repos) {
    const packageJson = (repo.key_files as RepoEnrichmentInput['keyFiles'])?.packageJson;
    merged.dependencies = { ...(merged.dependencies ?? {}), ...(packageJson?.dependencies ?? {}) };
    merged.devDependencies = {
      ...(merged.devDependencies ?? {}),
      ...(packageJson?.devDependencies ?? {}),
    };
    merged.scripts = { ...(merged.scripts ?? {}), ...(packageJson?.scripts ?? {}) };
  }

  return Object.keys(merged.dependencies ?? {}).length > 0 ||
    Object.keys(merged.devDependencies ?? {}).length > 0 ||
    Object.keys(merged.scripts ?? {}).length > 0
    ? merged
    : undefined;
};

const mergeStringKeyFile = (
  repos: GithubRepositoryRow[],
  key: keyof Omit<RepoEnrichmentInput['keyFiles'], 'packageJson'>,
): string | undefined => {
  for (const repo of repos) {
    const content = (repo.key_files as Record<string, unknown>)?.[key];
    if (typeof content === 'string' && content.trim()) return content;
  }
  return undefined;
};

const mergeContributionData = (
  repos: GithubRepositoryRow[],
): {
  userCommitCount: number;
  totalRecentCommits: number;
  contributionLevel: ContributionLevel;
  sampleCommitMessages: string[];
  isFork: boolean;
} => {
  const userCommitCount = repos.reduce((sum, r) => sum + (r.user_commit_count ?? 0), 0);
  const totalRecentCommits = repos.reduce((sum, r) => sum + (r.total_recent_commits ?? 0), 0);

  const contributionLevel = repos.reduce<ContributionLevel>((best, r) => {
    const level = (r.contribution_level ?? 'unclear') as ContributionLevel;
    return CONTRIBUTION_LEVEL_RANK[level] > CONTRIBUTION_LEVEL_RANK[best] ? level : best;
  }, 'unclear');

  const sampleCommitMessages = [
    ...new Set(repos.flatMap((r) => r.sample_commit_messages ?? [])),
  ].slice(0, 10);

  const isFork = repos.some((r) => r.is_fork);

  return { userCommitCount, totalRecentCommits, contributionLevel, sampleCommitMessages, isFork };
};

const buildEnrichmentInput = (
  repos: GithubRepositoryRow[],
  githubUsername: string,
): RepoEnrichmentInput => {
  const sortedRepos = [...repos].sort((a, b) => a.name.localeCompare(b.name));
  const canonical = sortedRepos[0]!;
  const groupName = normalizedProjectGroupName(canonical.name);
  const languageBreakdown = mergeLanguageBreakdowns(sortedRepos);
  const topLanguage =
    Object.entries(languageBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    canonical.primary_language;
  const descriptions = sortedRepos
    .map((repo) => [repo.full_name, repo.description].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('\n');
  const readmes = sortedRepos
    .map((repo) => `## ${repo.full_name}\n${repo.readme_content ?? 'No README available.'}`)
    .join('\n\n');
  const packageJson = mergePackageJson(sortedRepos);

  const contributionData = mergeContributionData(sortedRepos);

  const keyFiles: RepoEnrichmentInput['keyFiles'] = {};
  if (packageJson) keyFiles.packageJson = packageJson;

  const requirementsTxt = mergeStringKeyFile(sortedRepos, 'requirementsTxt');
  if (requirementsTxt) keyFiles.requirementsTxt = requirementsTxt;

  const cargoToml = mergeStringKeyFile(sortedRepos, 'cargoToml');
  if (cargoToml) keyFiles.cargoToml = cargoToml;

  const goMod = mergeStringKeyFile(sortedRepos, 'goMod');
  if (goMod) keyFiles.goMod = goMod;

  const dockerCompose = mergeStringKeyFile(sortedRepos, 'dockerCompose');
  if (dockerCompose) keyFiles.dockerCompose = dockerCompose;

  const dockerfile = mergeStringKeyFile(sortedRepos, 'dockerfile');
  if (dockerfile) keyFiles.dockerfile = dockerfile;

  const tsconfig = mergeStringKeyFile(sortedRepos, 'tsconfig');
  if (tsconfig) keyFiles.tsconfig = tsconfig;

  const prismaSchema = mergeStringKeyFile(sortedRepos, 'prismaSchema');
  if (prismaSchema) keyFiles.prismaSchema = prismaSchema;

  return {
    repoName: groupName || canonical.name,
    repoDescription: descriptions || canonical.description,
    primaryLanguage: topLanguage,
    languageBreakdown,
    topics: [...new Set(sortedRepos.flatMap((repo) => repo.topics ?? []))],
    readmeContent: readmes,
    keyFiles,
    fileTreeSample: sortedRepos
      .flatMap((repo) => (repo.file_tree_sample ?? []).map((path) => `${repo.name}/${path}`))
      .slice(0, 80),
    stars: sortedRepos.reduce((sum, repo) => sum + repo.stars_count, 0),
    pushedAt: new Date(
      Math.max(...sortedRepos.map((repo) => new Date(repo.github_pushed_at).getTime())),
    ).toISOString(),
    isFork: contributionData.isFork,
    ownerLogin: canonical.owner_login,
    githubUsername,
    userCommitCount: contributionData.userCommitCount,
    totalRecentCommits: contributionData.totalRecentCommits,
    contributionLevel: contributionData.contributionLevel,
    sampleCommitMessages: contributionData.sampleCommitMessages,
  };
};

const fetchProjectGroupRepos = async (
  repo: GithubRepositoryRow,
): Promise<GithubRepositoryRow[]> => {
  const canonicalRepoId = repo.duplicate_of_github_repo_id ?? repo.github_repo_id;
  if (!repo.duplicate_group_key) return [repo];

  const groupResult = await pool.query<GithubRepositoryRow>(
    `SELECT *
     FROM github_repositories
     WHERE user_id = $1
       AND duplicate_group_key = $2
       AND deleted_or_archived = FALSE
       AND (
         github_repo_id = $3
         OR duplicate_of_github_repo_id = $3
       )
     ORDER BY github_pushed_at DESC`,
    [repo.user_id, repo.duplicate_group_key, canonicalRepoId],
  );

  return groupResult.rows.length > 0 ? groupResult.rows : [repo];
};

const finalizeUserSyncIfNoPending = async (
  userId: string,
  syncRunId: string | null,
): Promise<void> => {
  const pendingResult = await pool.query(
    `SELECT COUNT(*) FROM github_repositories
     WHERE user_id = $1
       AND enrichment_status IN ('pending', 'processing')
       AND ($2::uuid IS NULL OR last_sync_run_id = $2)`,
    [userId, syncRunId],
  );

  if (parseInt((pendingResult.rows[0] as { count: string }).count, 10) !== 0) {
    return;
  }

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
        durationMs: 0,
      },
    });
  } catch {
    /* ignore */
  }
};

// ─── Validation score calculation (deterministic) ─────────────────────────────

const scoreReadme = (content: string | null): number => {
  if (!content) return 0;

  let score = 0;
  const wordCount = content.split(/\s+/).length;

  if (wordCount > 500) score += 8;
  else if (wordCount > 200) score += 5;
  else if (wordCount > 50) score += 2;

  if (/#{1,3}\s*(install|setup|getting started)/i.test(content)) score += 3;
  if (/#{1,3}\s*(usage|how to use|example)/i.test(content)) score += 3;
  if (/#{1,3}\s*(feature|what it does|overview)/i.test(content)) score += 2;
  if (/#{1,3}\s*(tech|stack|built with|dependencies)/i.test(content)) score += 2;

  const codeBlockCount = (content.match(/```/g) ?? []).length / 2;
  score += Math.min(4, codeBlockCount);

  if (/!\[.*?\]\(.*?\)/.test(content)) score += 3;

  return Math.min(25, score);
};

const scoreRecency = (pushedAt: Date): number => {
  const monthsAgo = (Date.now() - pushedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
  return Math.max(0, 15 - Math.floor(monthsAgo / 4));
};

const calculateValidationScore = (
  repo: GithubRepositoryRow,
  enrichment: RepoEnrichmentOutput,
): number => {
  const readmeScore = scoreReadme(repo.readme_content);
  const impactScore = enrichment.impactMetrics ? 30 : 0;
  const recencyScore = scoreRecency(new Date(repo.github_pushed_at));
  const complexityScore: Record<string, number> = { high: 20, medium: 12, low: 5 };
  const complexity = complexityScore[enrichment.complexitySignal] ?? 5;
  const professionalismScore = (enrichment.hasTests ? 5 : 0) + (enrichment.hasCiCd ? 5 : 0);

  return Math.min(
    100,
    readmeScore + impactScore + recencyScore + complexity + professionalismScore,
  );
};

// ─── Worker ────────────────────────────────────────────────────────────────────

export const githubEnrichmentWorker = new Worker<GithubEnrichmentJobData>(
  QUEUE_NAMES.GITHUB_ENRICHMENT,
  async (job) => {
    const { userId, githubRepositoryId } = job.data;

    const repoResult = await pool.query<GithubRepositoryRow>(
      `SELECT * FROM github_repositories WHERE id = $1 AND user_id = $2`,
      [githubRepositoryId, userId],
    );

    const repo = repoResult.rows[0];
    if (!repo) throw new Error(`Repository ${githubRepositoryId} not found`);

    await pool.query(
      `UPDATE github_repositories
       SET enrichment_status = 'processing', enrichment_attempts = enrichment_attempts + 1
       WHERE id = $1`,
      [githubRepositoryId],
    );

    // Get the authenticated user's GitHub username for contribution context
    const profileResult = await pool.query<{ github_username: string }>(
      `SELECT github_username FROM github_profiles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const githubUsername = profileResult.rows[0]?.github_username ?? '';

    try {
      const groupRepos = await fetchProjectGroupRepos(repo);
      const canonicalRepoId = repo.duplicate_of_github_repo_id ?? repo.github_repo_id;
      const canonicalRepo =
        groupRepos.find((item) => item.github_repo_id === canonicalRepoId) ?? repo;
      const enrichmentInput = buildEnrichmentInput(groupRepos, githubUsername);

      const enrichmentOutput = await getEnrichmentOutput(enrichmentInput);

      const validationScore = Math.max(
        ...groupRepos.map((groupRepo) => calculateValidationScore(groupRepo, enrichmentOutput)),
      );
      const githubRepoIds = groupRepos.map((groupRepo) => String(groupRepo.github_repo_id));
      const githubRepoUrls = groupRepos.map((groupRepo) => groupRepo.html_url);
      const githubRepoNames = groupRepos.map((groupRepo) => groupRepo.full_name);
      const contentHashes = groupRepos
        .map((groupRepo) => groupRepo.repo_content_hash)
        .filter(Boolean);

      const contributionData = mergeContributionData(groupRepos);

      const githubExtra = {
        github_repo_id: String(canonicalRepo.github_repo_id),
        github_repo_ids: githubRepoIds,
        github_full_name: canonicalRepo.full_name,
        github_full_names: githubRepoNames,
        github_project_group_key:
          canonicalRepo.duplicate_group_key ?? normalizedProjectGroupName(canonicalRepo.name),
        github_component_repos: groupRepos.map((groupRepo) => ({
          github_repo_id: String(groupRepo.github_repo_id),
          full_name: groupRepo.full_name,
          html_url: groupRepo.html_url,
          role:
            normalizedProjectGroupName(groupRepo.name) === groupRepo.name
              ? 'primary'
              : groupRepo.name.split(/[-_.]/).at(-1)?.toLowerCase(),
        })),
        github_verified: true,
        github_source: 'github_api',
        github_synced_at: new Date().toISOString(),
        github_readme_hash: canonicalRepo.readme_hash,
        github_content_hash:
          contentHashes.length > 0 ? contentHashes.join(':') : canonicalRepo.repo_content_hash,
        github_enrichment: {
          title: enrichmentOutput.title,
          description: enrichmentOutput.description,
          tech_stack: enrichmentOutput.techStack,
          impact_metrics: enrichmentOutput.impactMetrics,
          domain_category: enrichmentOutput.domainCategory,
          user_contribution_summary: enrichmentOutput.userContributionSummary,
        },
        contribution_level: contributionData.contributionLevel,
        user_contribution_summary: enrichmentOutput.userContributionSummary,
        user_commit_count: contributionData.userCommitCount,
        total_recent_commits: contributionData.totalRecentCommits,
        is_fork: contributionData.isFork,
        has_tests: enrichmentOutput.hasTests,
        has_ci_cd: enrichmentOutput.hasCiCd,
        is_team_project: enrichmentOutput.isTeamProject,
        complexity_signal: enrichmentOutput.complexitySignal,
        project_type: enrichmentOutput.projectType,
        key_achievements: enrichmentOutput.keyAchievements,
        stars: groupRepos.reduce((sum, groupRepo) => sum + groupRepo.stars_count, 0),
      };

      const portfolioItemId = await upsertGithubPortfolioItem({
        userId,
        title: enrichmentOutput.title,
        description: enrichmentOutput.description,
        techStack: enrichmentOutput.techStack,
        projectUrl: canonicalRepo.html_url,
        impactMetrics: enrichmentOutput.impactMetrics,
        domainCategory: enrichmentOutput.domainCategory,
        validationScore,
        githubExtra,
        githubRepoId: String(canonicalRepo.github_repo_id),
        normalizedUrlAliases: githubRepoUrls.flatMap(normalizedGithubUrlAliases),
        contentHash: contentHashes.join(':') || canonicalRepo.repo_content_hash,
      });

      await pool.query(
        `UPDATE github_repositories SET
          enrichment_status = 'completed',
          enrichment_error = NULL,
          last_enriched_at = NOW(),
          portfolio_item_id = $1
         WHERE user_id = $2
           AND github_repo_id = ANY($3::bigint[])`,
        [portfolioItemId, userId, groupRepos.map((groupRepo) => groupRepo.github_repo_id)],
      );

      await pool.query(
        `UPDATE github_profiles SET repos_processed = repos_processed + 1 WHERE user_id = $1`,
        [userId],
      );

      const progressResult = await pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE enrichment_status IN ('completed','failed','filtered_out')) AS done,
          COUNT(*) FILTER (WHERE enrichment_status NOT IN ('filtered_out')) AS total
         FROM github_repositories
         WHERE user_id = $1
           AND ($2::uuid IS NULL OR last_sync_run_id = $2)`,
        [userId, repo.last_sync_run_id],
      );

      const { done, total } = progressResult.rows[0] as { done: string; total: string };

      try {
        global.wsEmitToUser?.(userId, {
          type: 'github_repo_processed',
          data: {
            processed: parseInt(done, 10),
            total: parseInt(total, 10),
            repoName: repo.name,
            status: 'completed',
          },
        });
      } catch {
        /* ignore */
      }

      await finalizeUserSyncIfNoPending(userId, repo.last_sync_run_id);
    } catch (error) {
      const errorMessage = (error as Error).message;
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      await pool.query(
        `UPDATE github_repositories SET
          enrichment_status = 'failed',
          enrichment_error = $1,
          last_sync_state = 'failed'
         WHERE id = $2`,
        [errorMessage.slice(0, 500), githubRepositoryId],
      );

      try {
        global.wsEmitToUser?.(userId, {
          type: 'github_repo_failed',
          data: { processed: 0, total: 1, repoName: repo.name, error: errorMessage },
        });
      } catch {
        /* ignore */
      }

      if (isFinalAttempt) {
        await finalizeUserSyncIfNoPending(userId, repo.last_sync_run_id);
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 14,
      duration: 60_000,
    },
  },
);

githubEnrichmentWorker.on('failed', (job, err) => {
  console.error(`[github-enrichment] Job ${job?.id} failed after all retries:`, err.message);
});
