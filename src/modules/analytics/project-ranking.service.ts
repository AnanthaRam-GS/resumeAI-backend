import type { ExtractedEntities } from '../../types/ai.types.js';
import type {
  MatchCategory,
  ProjectRankingResult,
  RankedCertification,
  RankedProject,
  RichPortfolioProject,
} from '../../types/resume.types.js';
import { scorePortfolioBySemanticSimilarity } from '../../services/semantic-search.service.js';
import { ValidationError } from '../../utils/errors.js';
import { env } from '../../config/env.js';

export const DEFAULT_PROJECT_COUNT = 3;
export const MAX_PROJECT_COUNT = 8;

export interface RankableProject {
  id: string;
  title: string;
  description: string | null;
  techStack: string[];
  impactMetrics: string | null;
  validationScore: number | null;
  domainCategory: string | null;
  source?: string | null;
  endDate?: string | Date | null;
  isCurrent?: boolean | null;
}

export interface RankableCertification {
  id?: string;
  name: string;
  issuingOrg: string | null;
  issueDate?: string | Date | null;
}

interface PortfolioProjectLike {
  id: string;
  title: string;
  description?: string | null;
  tech_stack?: string[] | null;
  impact_metrics?: string | null;
  validation_score?: number | string | null;
  domain_category?: string | null;
  source?: string | null;
  end_date?: string | Date | null;
  is_current?: boolean | null;
}

const unique = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const textIncludesKeyword = (text: string, keyword: string): boolean => {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);
  return Boolean(normalizedText && normalizedKeyword && normalizedText.includes(normalizedKeyword));
};

const findMatchingKeywords = (text: string, keywords: string[]): string[] =>
  unique(keywords.filter((keyword) => textIncludesKeyword(text, keyword)));

export const matchCategoryForScore = (score: number): MatchCategory => {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'strong';
  if (score >= 60) return 'moderate';
  if (score >= 40) return 'weak';
  return 'low';
};

const displayMatchCategory = (category: MatchCategory): string => {
  switch (category) {
    case 'excellent':
      return 'Excellent match';
    case 'strong':
      return 'Strong match';
    case 'moderate':
      return 'Moderate match';
    case 'weak':
      return 'Weak match';
    case 'low':
      return 'Low relevance';
  }
};

const projectText = (project: RankableProject): string =>
  [
    project.title,
    project.description,
    project.domainCategory,
    project.impactMetrics,
    ...(project.techStack ?? []),
  ].filter(Boolean).join(' ');

const requirementKeywords = (entities: ExtractedEntities): string[] =>
  unique([
    ...entities.requiredSkills,
    ...entities.preferredSkills,
    ...entities.techStack,
    ...(entities.keywords ?? []),
  ]);

const scoreKeywordOverlap = (text: string, keywords: string[]): { score: number; matched: string[]; missing: string[] } => {
  const matched = findMatchingKeywords(text, keywords);
  const missing = keywords.filter(
    (keyword) => !matched.some((match) => match.toLowerCase() === keyword.toLowerCase()),
  );
  const score = keywords.length === 0 ? 0 : (matched.length / keywords.length) * 100;
  return { score: clampScore(score), matched, missing };
};

const scoreTechStackOverlap = (project: RankableProject, entities: ExtractedEntities): { score: number; matched: string[] } => {
  const techKeywords = unique([...entities.requiredSkills, ...entities.preferredSkills, ...entities.techStack]);
  const projectTech = project.techStack ?? [];
  const matched = techKeywords.filter((keyword) =>
    projectTech.some((tech) => textIncludesKeyword(tech, keyword) || textIncludesKeyword(keyword, tech)),
  );
  const score = techKeywords.length === 0 ? 0 : (matched.length / techKeywords.length) * 100;
  return { score: clampScore(score), matched: unique(matched) };
};

const scoreQuality = (project: RankableProject): number => {
  if (typeof project.validationScore === 'number') {
    return clampScore(project.validationScore);
  }

  const descriptionLength = project.description?.trim().length ?? 0;
  const techCount = project.techStack.length;
  let score = 25;
  if (descriptionLength >= 120) score += 30;
  else if (descriptionLength >= 50) score += 18;
  if (techCount >= 4) score += 25;
  else if (techCount >= 2) score += 15;
  if (project.impactMetrics?.trim()) score += 20;
  return clampScore(score);
};

const scoreRecency = (project: RankableProject): number => {
  if (project.isCurrent) return 100;
  if (!project.endDate) return 55;

  const endDate = project.endDate instanceof Date ? project.endDate : new Date(project.endDate);
  if (Number.isNaN(endDate.getTime())) return 55;

  const monthsAgo = Math.max(0, (Date.now() - endDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
  if (monthsAgo <= 12) return 100;
  if (monthsAgo <= 24) return 80;
  if (monthsAgo <= 48) return 55;
  return 35;
};

const scoreImpact = (project: RankableProject): number => {
  const impact = project.impactMetrics?.trim();
  if (!impact) return 25;
  return /\d/.test(impact) ? 100 : 70;
};

const scoreRoleAlignment = (project: RankableProject, entities: ExtractedEntities): number => {
  const text = projectText(project);
  const roleTerms = unique([
    entities.roleCategory,
    entities.roleSeniority === 'unknown' ? '' : entities.roleSeniority,
    ...(entities.responsibilities ?? []),
  ]);
  const matched = findMatchingKeywords(text, roleTerms);
  if (matched.length === 0) return 30;
  return clampScore(50 + matched.length * 15);
};

const fallbackSemanticScore = (project: RankableProject, jobDescription: string, entities: ExtractedEntities): number => {
  const text = projectText(project);
  const jdKeywords = unique([
    ...requirementKeywords(entities),
    ...jobDescription.split(/[^a-zA-Z0-9.+#-]+/).filter((token) => token.length > 3).slice(0, 60),
  ]);
  return scoreKeywordOverlap(text, jdKeywords).score;
};

const usageForProject = (score: number): RankedProject['recommendedUsage'] => {
  if (score >= 70) return 'use_in_resume';
  if (score >= 55) return 'supporting_project';
  if (score >= 40) return 'improve_before_using';
  return 'not_recommended';
};

const reasonForProject = (
  project: RankableProject,
  score: number,
  matchedSkills: string[],
  missing: string[],
): string => {
  if (matchedSkills.length > 0) {
    return `${project.title} is a ${displayMatchCategory(matchCategoryForScore(score)).toLowerCase()} because it demonstrates ${matchedSkills.slice(0, 4).join(', ')}${project.impactMetrics ? ' with impact evidence' : ''}.`;
  }
  if (missing.length > 0) {
    return `${project.title} has limited relevance because it does not clearly demonstrate ${missing.slice(0, 3).join(', ')}.`;
  }
  return `${project.title} was ranked from project quality, recency, and role-alignment signals.`;
};

export const normalizeProjectCount = (
  projectCount: number | undefined,
  availableProjectCount: number,
): { count: number; notice?: string } => {
  const requested = projectCount ?? Math.min(DEFAULT_PROJECT_COUNT, Math.max(availableProjectCount, 1));

  if (!Number.isFinite(requested) || !Number.isInteger(requested)) {
    throw new ValidationError('Project count must be a whole number.');
  }

  if (requested < 1) {
    throw new ValidationError('Project count must be at least 1.');
  }

  const cappedBySystem = Math.min(requested, MAX_PROJECT_COUNT);
  const count = Math.min(cappedBySystem, availableProjectCount);
  const notices: string[] = [];

  if (requested > MAX_PROJECT_COUNT) {
    notices.push(`Project count was capped at ${MAX_PROJECT_COUNT}.`);
  }
  if (availableProjectCount > 0 && requested > availableProjectCount) {
    notices.push(`Only ${availableProjectCount} project${availableProjectCount === 1 ? '' : 's'} are available, so all available projects will be used.`);
  }

  return {
    count,
    notice: notices.length > 0 ? notices.join(' ') : undefined,
  };
};

export const toRankableProject = (project: RichPortfolioProject): RankableProject => ({
  id: project.id,
  title: project.title,
  description: project.description,
  techStack: project.techStack,
  impactMetrics: project.impactMetrics,
  validationScore: project.validationScore,
  domainCategory: project.domainCategory,
  source: project.source,
  endDate: project.endDate,
  isCurrent: project.isCurrent,
});

export const toRankableProjectFromPortfolioItem = (item: PortfolioProjectLike): RankableProject => ({
  id: item.id,
  title: item.title,
  description: item.description ?? null,
  techStack: item.tech_stack ?? [],
  impactMetrics: item.impact_metrics ?? null,
  validationScore: item.validation_score == null ? null : Number(item.validation_score),
  domainCategory: item.domain_category ?? null,
  source: item.source,
  endDate: item.end_date ?? null,
  isCurrent: item.is_current ?? false,
});

export const scoreProjectRelevance = (
  project: RankableProject,
  entities: ExtractedEntities,
  jobDescription: string,
  semanticSimilarityScore?: number,
): Omit<RankedProject, 'rank' | 'selectedForResume'> => {
  const text = projectText(project);
  const keywords = requirementKeywords(entities);
  const skillKeyword = scoreKeywordOverlap(text, unique([...entities.requiredSkills, ...entities.preferredSkills]));
  const techStack = scoreTechStackOverlap(project, entities);
  const semantic = semanticSimilarityScore == null || semanticSimilarityScore <= 0
    ? fallbackSemanticScore(project, jobDescription, entities)
    : clampScore(semanticSimilarityScore * 100);
  const quality = scoreQuality(project);
  const recency = scoreRecency(project);
  const impact = scoreImpact(project);
  const roleAlignment = scoreRoleAlignment(project, entities);

  const relevanceScore = clampScore(
    semantic * 0.30 +
    skillKeyword.score * 0.25 +
    techStack.score * 0.20 +
    quality * 0.10 +
    recency * 0.05 +
    impact * 0.05 +
    roleAlignment * 0.05,
  );
  const matchedKeywords = scoreKeywordOverlap(text, keywords).matched;
  const matchedSkills = unique([...skillKeyword.matched, ...techStack.matched]);
  const missingRelatedKeywords = unique([
    ...skillKeyword.missing,
    ...keywords.filter((keyword) => !matchedKeywords.some((matched) => matched.toLowerCase() === keyword.toLowerCase())),
  ]).slice(0, 8);
  const category = matchCategoryForScore(relevanceScore);

  return {
    projectId: project.id,
    title: project.title,
    relevanceScore,
    priorityScore: relevanceScore,
    matchCategory: category,
    matchedSkills,
    matchedRequirements: matchedKeywords.slice(0, 8),
    matchedKeywords: matchedKeywords.slice(0, 10),
    missingRelatedKeywords,
    strengthCategory: displayMatchCategory(category),
    reasoning: reasonForProject(project, relevanceScore, matchedSkills, missingRelatedKeywords),
    recommendedUsage: usageForProject(relevanceScore),
    componentScores: {
      semanticSimilarity: semantic,
      skillKeywordMatch: skillKeyword.score,
      techStackMatch: techStack.score,
      projectQuality: quality,
      recency,
      impact,
      roleAlignment,
    },
  };
};

export const rankProjects = async (
  userId: string,
  projects: RankableProject[],
  entities: ExtractedEntities,
  jobDescription: string,
  projectCount?: number,
): Promise<ProjectRankingResult> => {
  const deduped = Array.from(
    new Map(projects.map((project) => [project.id, project])).values(),
  );
  const { count, notice } = normalizeProjectCount(projectCount, deduped.length);
  const semanticScores = env.NODE_ENV === 'test'
    ? []
    : await scorePortfolioBySemanticSimilarity(userId, jobDescription);
  const semanticById = new Map(semanticScores.map((item) => [item.id, item.semanticScore]));

  const ranked = deduped
    .map((project) => scoreProjectRelevance(project, entities, jobDescription, semanticById.get(project.id)))
    .sort((left, right) => right.relevanceScore - left.relevanceScore || left.title.localeCompare(right.title))
    .map<RankedProject>((project, index) => ({
      ...project,
      rank: index + 1,
      selectedForResume: index < count,
    }));

  return {
    rankedProjects: ranked,
    selectedProjects: ranked.filter((project) => project.selectedForResume),
    excludedProjects: ranked.filter((project) => !project.selectedForResume),
    selectedProjectIds: ranked.filter((project) => project.selectedForResume).map((project) => project.projectId),
    requestedProjectCount: projectCount ?? DEFAULT_PROJECT_COUNT,
    availableProjectCount: deduped.length,
    notice,
  };
};

const certText = (cert: RankableCertification): string => [cert.name, cert.issuingOrg].filter(Boolean).join(' ');

export const rankCertifications = (
  certifications: RankableCertification[],
  entities: ExtractedEntities,
): RankedCertification[] => {
  const keywords = requirementKeywords(entities);
  return certifications
    .map((cert) => {
      const text = certText(cert);
      const direct = scoreKeywordOverlap(text, unique([...entities.requiredSkills, ...entities.techStack]));
      const domain = scoreKeywordOverlap(text, keywords);
      const issuer = cert.issuingOrg ? 70 : 40;
      const recency = cert.issueDate ? 80 : 55;
      const role = textIncludesKeyword(text, entities.roleCategory) ? 90 : 45;
      const score = clampScore(
        direct.score * 0.35 +
        domain.score * 0.30 +
        issuer * 0.10 +
        recency * 0.10 +
        role * 0.15,
      );

      return {
        certificationId: cert.id,
        name: cert.name,
        issuer: cert.issuingOrg,
        rank: 0,
        relevanceScore: score,
        matchedRequirements: unique([...direct.matched, ...domain.matched]).slice(0, 8),
        matchedSkills: unique([...direct.matched, ...domain.matched]).slice(0, 6),
        reasoning: score >= 60
          ? `${cert.name} supports this role through ${unique([...direct.matched, ...domain.matched]).slice(0, 3).join(', ') || 'domain alignment'}.`
          : `${cert.name} is not a direct requirement match for this role.`,
        recommendedUsage: score >= 70 ? 'include' : score >= 45 ? 'supporting' : 'not_recommended',
      } satisfies RankedCertification;
    })
    .sort((left, right) => right.relevanceScore - left.relevanceScore || left.name.localeCompare(right.name))
    .map((cert, index) => ({ ...cert, rank: index + 1 }));
};
