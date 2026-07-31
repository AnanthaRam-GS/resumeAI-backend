export interface GithubApiRepo {
  id: number;
  full_name: string;
  name: string;
  owner?: {
    login?: string | null;
  } | null;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  archived: boolean;
  size: number;
  pushed_at: string;
  created_at: string;
  default_branch: string;
  has_readme?: boolean;
}

export interface GithubApiUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  public_repos: number;
}

export interface GithubProfileRow {
  id: string;
  user_id: string;
  github_user_id: number | null;
  github_username: string;
  access_token: string;
  token_scopes: string[];
  last_synced_at: Date | null;
  repos_discovered: number;
  repos_processed: number;
  next_scheduled_sync: Date | null;
  etag_repos_list: string | null;
  sync_error: string | null;
  raw_data: Record<string, unknown> | null;
}

export type EnrichmentStatus =
  | 'pending'
  | 'filtered_out'
  | 'processing'
  | 'completed'
  | 'failed';

export type ContributionLevel =
  | 'primary_author'
  | 'major_contributor'
  | 'contributor'
  | 'minor_contributor'
  | 'unclear';

export interface GithubRepositoryRow {
  id: string;
  user_id: string;
  github_repo_id: number;
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  homepage_url: string | null;
  primary_language: string | null;
  language_breakdown: Record<string, number>;
  topics: string[];
  stars_count: number;
  forks_count: number;
  is_fork: boolean;
  is_archived: boolean;
  owner_login: string | null;
  duplicate_group_key: string | null;
  duplicate_of_github_repo_id: number | null;
  duplicate_reason: string | null;
  has_readme: boolean;
  readme_content: string | null;
  file_tree_sample: string[] | null;
  key_files: Record<string, unknown>;
  github_created_at: Date | null;
  github_pushed_at: Date;
  commit_count_estimate: number;
  user_commit_count: number;
  total_recent_commits: number;
  contribution_level: ContributionLevel | null;
  contribution_summary: string | null;
  etag_commits: string | null;
  sample_commit_messages: string[] | null;
  enrichment_status: EnrichmentStatus;
  filter_reason: string | null;
  enrichment_error: string | null;
  enrichment_attempts: number;
  last_enriched_at: Date | null;
  portfolio_item_id: string | null;
  etag_readme: string | null;
  etag_languages: string | null;
  repo_content_hash: string | null;
  metadata_hash: string | null;
  readme_hash: string | null;
  languages_hash: string | null;
  key_files_hash: string | null;
  commits_hash: string | null;
  last_seen_at: Date | null;
  deleted_or_archived: boolean;
  last_sync_state: 'new' | 'updated' | 'skipped' | 'filtered' | 'failed' | 'deleted' | null;
  last_sync_run_id: string | null;
  last_fetched_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface GithubDiscoveryJobData {
  userId: string;
  triggeredBy: 'manual' | 'post_connect' | 'periodic';
  githubRepositoryId?: string;
}

export interface GithubEnrichmentJobData {
  userId: string;
  githubRepositoryId: string;
}

export interface RepoEnrichmentOutput {
  title: string;
  description: string;
  userContributionSummary: string;
  techStack: string[];
  domainCategory: string;
  projectType: string;
  impactMetrics: string | null;
  keyAchievements: string[];
  hasTests: boolean;
  hasCiCd: boolean;
  isTeamProject: boolean;
  complexitySignal: 'low' | 'medium' | 'high';
}

export interface RepoEnrichmentInput {
  repoName: string;
  repoDescription: string | null;
  primaryLanguage: string | null;
  languageBreakdown: Record<string, number>;
  topics: string[];
  readmeContent: string;
  keyFiles: {
    packageJson?: {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    requirementsTxt?: string;
    cargoToml?: string;
    goMod?: string;
    dockerCompose?: string;
    dockerfile?: string;
    tsconfig?: string;
    prismaSchema?: string;
  };
  fileTreeSample: string[];
  stars: number;
  pushedAt: string;
  isFork: boolean;
  ownerLogin: string | null;
  githubUsername: string;
  userCommitCount: number;
  totalRecentCommits: number;
  contributionLevel: ContributionLevel;
  sampleCommitMessages: string[];
}

export type GithubSyncWebSocketEvent =
  | { type: 'github_discovery_complete'; data: { discovered: number; willProcess: number; filtered: number } }
  | { type: 'github_repo_processed'; data: { processed: number; total: number; repoName: string; status: 'completed' | 'filtered_out' } }
  | { type: 'github_repo_failed'; data: { processed: number; total: number; repoName: string; error: string } }
  | { type: 'github_sync_complete'; data: { added: number; updated: number; skipped: number; failed: number; durationMs: number } }
  | { type: 'github_rate_limited'; data: { resumeAt: string; processedSoFar: number } }
  | { type: 'github_sync_error'; data: { error: string } };
