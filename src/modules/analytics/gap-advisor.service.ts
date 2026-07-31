import { pool } from '../../db/client.js';
import { randomUUID } from 'crypto';
import { NotFoundError, ValidationError, AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { requestGeminiJson } from '../../services/gemini.service.js';
import { requestGroqJson } from '../../services/groq.service.js';
import { gapAdvisorPrompt } from '../ai/prompts/gap-advisor.prompt.js';
import { analyzeJobDescription } from '../ai/jd-analyzer.service.js';
import {
  fetchRichPortfolioEvidence,
  scoreRequiredSkills,
  enrichWithSemanticSimilarity,
} from './gap-evidence.service.js';
import {
  mapCareerGoalToSkills,
  aggregateJdSkills,
  getPrerequisiteOrder,
  resolveSkillCluster,
} from './gap-taxonomy.service.js';
import {
  DEFAULT_PROJECT_COUNT,
  matchCategoryForScore,
  rankCertifications,
  rankProjects,
  toRankableProject,
} from './project-ranking.service.js';
import type { ExtractedEntities } from '../../types/ai.types.js';
import type {
  GapAnalysisOptions,
  EnhancedGapAnalysisRow,
  SkillGapEvidence,
  GapAdvisorLLMOutput,
  EnrichedMissingSkill,
  RichPortfolioEvidence,
  GapRecommendation,
  RankedProject,
  SkillMatch,
  StrengthMapping,
} from '../../types/resume.types.js';

const MAX_JD_CHARS = 20_000;

// ─── Extract required skills from job targets ──────────────────────────────────

const extractSkillsFromJobTargets = async (
  userId: string,
  jobTargetIds?: string[],
): Promise<{ skill: string; frequency: number }[]> => {
  let query: string;
  let params: unknown[];

  if (jobTargetIds && jobTargetIds.length > 0) {
    query = `SELECT job_description FROM job_targets WHERE user_id = $1 AND id = ANY($2::uuid[])`;
    params = [userId, jobTargetIds];
  } else {
    query = `SELECT job_description FROM job_targets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`;
    params = [userId];
  }

  const result = await pool.query<{ job_description: string }>(query, params);
  if (result.rows.length === 0) return [];

  const skillSets = await Promise.allSettled(
    result.rows.map(async (row) => {
      try {
        const entities = await analyzeJobDescription(row.job_description);
        return [
          ...(entities?.requiredSkills ?? []),
          ...(entities?.techStack ?? []),
        ];
      } catch {
        return [];
      }
    }),
  );

  const allSkillSets = skillSets
    .filter((r): r is PromiseFulfilledResult<string[]> => r.status === 'fulfilled')
    .map(r => r.value);

  return aggregateJdSkills(allSkillSets);
};

// ─── Build LLM payload ─────────────────────────────────────────────────────────

const buildLLMPayload = (
  careerGoal: string,
  portfolioEvidence: RichPortfolioEvidence,
  gapEvidence: SkillGapEvidence[],
  jobDescription?: string,
): string => {
  const truncatedProjects = portfolioEvidence.projects.slice(0, 10).map(p => ({
    title: p.title,
    description: p.description
      ? p.description.slice(0, 300) + (p.description.length > 300 ? '...' : '')
      : null,
    techStack: p.techStack.slice(0, 10),
    hasImpactMetrics: p.impactMetrics !== null,
    validationScore: p.validationScore,
    source: p.source,
  }));

  const topGaps = gapEvidence
    .filter(g => g.evidenceLevel < 3)
    .sort((a, b) => {
      const priorityScore = { high: 3, medium: 2, low: 1 };
      return (priorityScore[b.priority] - priorityScore[a.priority]) ||
        (a.evidenceLevel - b.evidenceLevel);
    })
    .slice(0, 8);

  const payload = {
    careerGoal,
    ...(jobDescription ? { targetJobDescription: jobDescription.slice(0, 1000) } : {}),
    portfolioSummary: {
      projects: truncatedProjects,
      demonstratedSkills: portfolioEvidence.demonstratedSkills.slice(0, 20),
      listedOnlySkills: portfolioEvidence.listedSkills.slice(0, 10),
      experience: portfolioEvidence.experience.slice(0, 5),
      certifications: portfolioEvidence.certifications.slice(0, 5),
      avgValidationScore: portfolioEvidence.avgValidationScore,
      totalProjects: portfolioEvidence.totalProjectCount,
      githubProjects: portfolioEvidence.githubProjectCount,
    },
    preComputedGaps: topGaps.map(g => ({
      skill: g.skill,
      priority: g.priority,
      evidence_level: g.evidenceLevel,
      evidence_summary: g.evidenceSummary,
      supporting_projects: g.supportingProjects.map(p => p.title),
      semantic_similarity_score: g.semanticSimilarityScore,
      semantically_similar_project: g.semanticallySimilarProject,
      jd_frequency: g.jdFrequency,
      learning_path_order: g.learningPathOrder,
      cluster_name: g.clusterName,
    })),
    allowedSkills: topGaps.map(g => g.skill),
  };

  return JSON.stringify(payload);
};

// ─── Deterministic fallback when LLM is unavailable ───────────────────────────

const buildDeterministicFallback = (
  gapEvidence: SkillGapEvidence[],
): GapAdvisorLLMOutput => {
  const topGaps = gapEvidence
    .filter(g => g.evidenceLevel < 3)
    .sort((a, b) => {
      const score = { high: 3, medium: 2, low: 1 };
      return (score[b.priority] - score[a.priority]) || (a.evidenceLevel - b.evidenceLevel);
    })
    .slice(0, 8);

  const missing_skills: EnrichedMissingSkill[] = topGaps.map(g => ({
    skill: g.skill,
    priority: g.priority,
    reason: g.evidenceSummary,
    evidence_level: g.evidenceLevel,
    supporting_projects: g.supportingProjects.map(p => p.title),
    learning_path_order: g.learningPathOrder,
    cluster_name: g.clusterName,
    semantic_similarity_score: g.semanticSimilarityScore,
  }));

  const highPrioritySkills = topGaps.filter(g => g.priority === 'high').slice(0, 3);

  const suggested_projects = highPrioritySkills.length > 0 ? [{
    project_type: 'Portfolio Project',
    description: `Build a project that demonstrates your ability with: ${highPrioritySkills.map(g => g.skill).join(', ')}. Focus on measurable outcomes and document your approach.`,
    skills_addressed: highPrioritySkills.map(g => g.skill),
  }] : [];

  const learning_resources = topGaps.slice(0, 5).map(g => ({
    resource: `Official ${g.skill} Documentation`,
    url: undefined,
    skill_addressed: g.skill,
  }));

  const gapCount = missing_skills.length;
  const highCount = missing_skills.filter(s => s.priority === 'high').length;

  const overall_assessment = gapCount === 0
    ? 'Your portfolio demonstrates strong alignment with your target role. Keep building on your existing strengths.'
    : `Your portfolio has ${gapCount} skill gap${gapCount === 1 ? '' : 's'} to address, ${highCount} of which ${highCount === 1 ? 'is' : 'are'} high priority. Focus on the high-priority items first to maximise your readiness.`;

  return { overall_assessment, missing_skills, suggested_projects, learning_resources };
};

// ─── Normalize and validate LLM output ────────────────────────────────────────

const ALLOWED_PRIORITIES = new Set(['high', 'medium', 'low']);

const mergeRequiredSkills = (
  primary: { skill: string; frequency: number }[],
  secondary: { skill: string; frequency: number }[] = [],
): { skill: string; frequency: number }[] => {
  const skillMap = new Map<string, { skill: string; frequency: number }>();

  for (const { skill, frequency } of [...secondary, ...primary]) {
    const key = skill.toLowerCase();
    const existing = skillMap.get(key);
    if (!existing || frequency > existing.frequency) {
      skillMap.set(key, { skill, frequency });
    }
  }

  return Array.from(skillMap.values()).slice(0, 20);
};

const buildEntitiesFromSkills = (
  skills: { skill: string; frequency: number }[],
  careerGoal: string,
): ExtractedEntities => ({
  requiredSkills: skills.filter((skill) => skill.frequency >= 0.5).map((skill) => skill.skill),
  preferredSkills: skills.filter((skill) => skill.frequency < 0.5).map((skill) => skill.skill),
  techStack: skills.map((skill) => skill.skill),
  roleSeniority: 'unknown',
  roleCategory: careerGoal,
  summary: careerGoal,
  responsibilities: [],
  keywords: skills.map((skill) => skill.skill),
});

const priorityFromGap = (gap: SkillGapEvidence): GapRecommendation['priority'] => {
  if (gap.priority === 'high' && gap.evidenceLevel === 0) return 'critical';
  return gap.priority;
};

const buildSkillMatches = (gapEvidence: SkillGapEvidence[]): SkillMatch[] =>
  gapEvidence.map((gap) => {
    const evidence = [
      gap.evidenceSummary,
      ...gap.supportingProjects.map((project) => `Supported by ${project.title}`),
    ];
    if (gap.evidenceLevel >= 3) {
      return { skill: gap.skill, status: 'strong_match', evidence, priority: 'low' };
    }
    if (gap.evidenceLevel === 2) {
      return { skill: gap.skill, status: 'explicit_match', evidence, priority: 'medium' };
    }
    if (gap.evidenceLevel === 1) {
      return { skill: gap.skill, status: 'weak_support', evidence, priority: gap.priority };
    }
    return {
      skill: gap.skill,
      status: 'missing',
      evidence,
      priority: gap.priority === 'high' ? 'critical' : gap.priority,
    };
  });

const buildGapRecommendations = (
  gapEvidence: SkillGapEvidence[],
  rankedProjects: RankedProject[],
): GapRecommendation[] => {
  const skillGaps = gapEvidence
    .filter((gap) => gap.evidenceLevel < 3)
    .map<GapRecommendation>((gap) => ({
      title: `${gap.skill} evidence gap`,
      category: 'skill',
      priority: priorityFromGap(gap),
      severity: Math.max(1, 4 - gap.evidenceLevel),
      whyItMatters: `${gap.skill} is relevant to the target role and currently has ${gap.evidenceSummary.toLowerCase()}.`,
      evidence: [
        gap.evidenceSummary,
        gap.semanticallySimilarProject ? `Closest related project: ${gap.semanticallySimilarProject}` : '',
      ].filter(Boolean),
      suggestedAction: gap.evidenceLevel === 0
        ? `Add a project, certification, or experience bullet that demonstrates ${gap.skill}.`
        : `Strengthen existing ${gap.skill} evidence with clearer resume-ready bullets and measurable impact.`,
      suggestedProjectIdea: `Build or update a project that uses ${gap.skill} in a realistic ${gap.clusterName ?? 'role-aligned'} workflow.`,
      suggestedSkill: gap.skill,
      estimatedImpact: gap.priority === 'high' ? 'high' : 'medium',
    }));

  const documentationGaps = rankedProjects
    .filter((project) => project.componentScores.projectQuality < 55)
    .slice(0, 3)
    .map<GapRecommendation>((project) => ({
      title: `${project.title} needs stronger project evidence`,
      category: 'documentation',
      priority: project.selectedForResume ? 'high' : 'medium',
      severity: project.selectedForResume ? 3 : 2,
      whyItMatters: 'Resume generation performs better when projects include clear descriptions, technologies, and quantified outcomes.',
      evidence: [`Project quality score: ${project.componentScores.projectQuality}`],
      suggestedAction: 'Add a concise README-style description, tech stack, deployment link, and impact metrics.',
      estimatedImpact: project.selectedForResume ? 'high' : 'medium',
    }));

  const impactGaps = rankedProjects
    .filter((project) => project.selectedForResume && project.componentScores.impact < 50)
    .slice(0, 2)
    .map<GapRecommendation>((project) => ({
      title: `${project.title} is missing impact metrics`,
      category: 'impact',
      priority: 'medium',
      severity: 2,
      whyItMatters: 'Quantified outcomes make selected resume projects more credible and ATS-friendly.',
      evidence: ['No measurable impact was found for this selected project.'],
      suggestedAction: 'Add metrics such as users served, latency reduced, accuracy improved, cost saved, or scope delivered.',
      estimatedImpact: 'medium',
    }));

  return [...skillGaps, ...documentationGaps, ...impactGaps]
    .sort((left, right) => {
      const weights = { critical: 4, high: 3, medium: 2, low: 1 };
      return weights[right.priority] - weights[left.priority] || right.severity - left.severity;
    })
    .slice(0, 15);
};

const buildStrengths = (
  rankedProjects: RankedProject[],
  rankedCertifications: ReturnType<typeof rankCertifications>,
  skillMatches: SkillMatch[],
  portfolioEvidence: RichPortfolioEvidence,
): StrengthMapping[] => {
  const projectStrengths = rankedProjects
    .filter((project) => project.relevanceScore >= 60)
    .slice(0, 5)
    .map<StrengthMapping>((project) => ({
      assetId: project.projectId,
      assetType: 'project',
      title: project.title,
      relevanceScore: project.relevanceScore,
      priorityScore: project.priorityScore,
      matchedRequirements: project.matchedRequirements,
      matchedKeywords: project.matchedKeywords,
      missingRelatedKeywords: project.missingRelatedKeywords,
      strengthCategory: project.matchCategory,
      reasoning: project.reasoning,
      recommendedUsage: project.recommendedUsage,
      evidence: project.matchedSkills,
    }));

  const certStrengths = rankedCertifications
    .filter((cert) => cert.relevanceScore >= 55)
    .slice(0, 3)
    .map<StrengthMapping>((cert) => ({
      assetId: cert.certificationId,
      assetType: 'certification',
      title: cert.name,
      relevanceScore: cert.relevanceScore,
      priorityScore: cert.relevanceScore,
      matchedRequirements: cert.matchedRequirements,
      matchedKeywords: cert.matchedSkills,
      missingRelatedKeywords: [],
      strengthCategory: matchCategoryForScore(cert.relevanceScore),
      reasoning: cert.reasoning,
      recommendedUsage: cert.recommendedUsage,
      evidence: cert.issuer ? [`Issued by ${cert.issuer}`] : [],
    }));

  const skillStrengths = skillMatches
    .filter((skill) => skill.status === 'strong_match' || skill.status === 'explicit_match')
    .slice(0, 5)
    .map<StrengthMapping>((skill) => ({
      assetType: 'skill',
      title: skill.skill,
      relevanceScore: skill.status === 'strong_match' ? 95 : 75,
      priorityScore: skill.status === 'strong_match' ? 95 : 75,
      matchedRequirements: [skill.skill],
      matchedKeywords: [skill.skill],
      missingRelatedKeywords: [],
      strengthCategory: skill.status === 'strong_match' ? 'excellent' : 'strong',
      reasoning: `${skill.skill} is supported by existing portfolio evidence.`,
      recommendedUsage: 'Use naturally in skills, summary, and relevant bullets.',
      evidence: skill.evidence,
    }));

  const experienceStrengths = portfolioEvidence.experience
    .filter((exp) => exp.techStack.length > 0)
    .slice(0, 3)
    .map<StrengthMapping>((exp) => ({
      assetType: 'experience',
      title: exp.company ? `${exp.title} at ${exp.company}` : exp.title,
      relevanceScore: 70,
      priorityScore: 70,
      matchedRequirements: exp.techStack,
      matchedKeywords: exp.techStack,
      missingRelatedKeywords: [],
      strengthCategory: 'moderate',
      reasoning: 'This experience provides supporting role evidence through its technology stack.',
      recommendedUsage: 'Use as supporting experience in the resume.',
      evidence: exp.techStack,
    }));

  return [...projectStrengths, ...certStrengths, ...skillStrengths, ...experienceStrengths]
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 12);
};

export const normalizeLLMOutput = (
  raw: GapAdvisorLLMOutput,
  preComputedGaps: SkillGapEvidence[],
): GapAdvisorLLMOutput => {
  const validSkillNames = new Set(preComputedGaps.map(g => g.skill.toLowerCase()));

  const normalizedSkills: EnrichedMissingSkill[] = (raw.missing_skills ?? [])
    .filter(s => validSkillNames.has(s.skill?.toLowerCase()))
    .slice(0, 8)
    .map(s => {
      const preComputed = preComputedGaps.find(
        g => g.skill.toLowerCase() === s.skill.toLowerCase(),
      );
      return {
        skill: preComputed?.skill ?? s.skill,
        priority: preComputed?.priority ?? (ALLOWED_PRIORITIES.has(s.priority)
          ? (s.priority as 'high' | 'medium' | 'low')
          : 'medium'),
        reason: typeof s.reason === 'string' && s.reason.length > 10
          ? s.reason
          : `${s.skill} is required for your target role but not yet demonstrated in your portfolio.`,
        evidence_level: preComputed?.evidenceLevel ?? s.evidence_level ?? 0,
        supporting_projects: preComputed?.supportingProjects.map(p => p.title) ?? s.supporting_projects ?? [],
        learning_path_order: preComputed?.learningPathOrder ?? s.learning_path_order ?? 1,
        cluster_name: preComputed?.clusterName ?? s.cluster_name ?? null,
        semantic_similarity_score: preComputed?.semanticSimilarityScore ?? 0,
      };
    });

  const resourceSkillNames = new Set(preComputedGaps.map(g => g.skill));
  const firstSkill = resourceSkillNames.values().next().value ?? '';

  return {
    overall_assessment: typeof raw.overall_assessment === 'string' && raw.overall_assessment.length > 10
      ? raw.overall_assessment
      : 'Your portfolio shows solid foundational skills with key gaps to address for your target role.',
    missing_skills: normalizedSkills,
    suggested_projects: (raw.suggested_projects ?? []).slice(0, 5).map(p => ({
      project_type: p.project_type ?? 'Project',
      description: p.description ?? '',
      skills_addressed: Array.isArray(p.skills_addressed)
        ? p.skills_addressed.filter(skill => validSkillNames.has(skill.toLowerCase())).slice(0, 5)
        : [],
    })),
    learning_resources: (raw.learning_resources ?? [])
      .filter(r => !r.skill_addressed || validSkillNames.has(r.skill_addressed.toLowerCase()))
      .slice(0, 8)
      .map(r => ({
        resource: r.resource ?? '',
        url: typeof r.url === 'string' && r.url.startsWith('http') ? r.url : undefined,
        skill_addressed: r.skill_addressed && validSkillNames.has(r.skill_addressed.toLowerCase())
          ? r.skill_addressed
          : firstSkill,
      })),
  };
};

// ─── Main: runGapAnalysis ──────────────────────────────────────────────────────

export const runGapAnalysis = async (
  userId: string,
  options: GapAnalysisOptions = {},
): Promise<EnhancedGapAnalysisRow> => {
  const startTime = Date.now();
  const { jobDescription: rawJd, jobTargetIds, persist = !rawJd, projectCount } = options;

  const jobDescription = rawJd ? rawJd.slice(0, MAX_JD_CHARS) : undefined;

  logger.info({ userId, hasJd: Boolean(jobDescription), hasJobTargets: Boolean(jobTargetIds?.length) },
    'gap_analysis.started');

  // Validate prerequisites
  const userResult = await pool.query<{ career_goal: string | null }>(
    `SELECT career_goal FROM users WHERE id = $1`,
    [userId],
  );
  const user = userResult.rows[0];
  if (!user) throw new NotFoundError('User not found');

  const careerGoal = user.career_goal?.trim();
  if (!careerGoal) {
    throw new ValidationError(
      'A career goal must be set before running gap analysis. ' +
      'Update your career goal in profile settings.',
    );
  }

  // Layer 1: Rich portfolio evidence
  const portfolioEvidence = await fetchRichPortfolioEvidence(userId);

  logger.info({
    userId,
    projectCount: portfolioEvidence.totalProjectCount,
    skillCount: portfolioEvidence.listedSkills.length + portfolioEvidence.demonstratedSkills.length,
    certCount: portfolioEvidence.certifications.length,
    expCount: portfolioEvidence.experience.length,
  }, 'gap_analysis.evidence_collected');

  if (portfolioEvidence.totalProjectCount === 0 && portfolioEvidence.listedSkills.length === 0) {
    throw new ValidationError(
      'Your portfolio has no projects or skills. ' +
      'Add projects or connect your GitHub account before running gap analysis.',
    );
  }

  // Determine required skills
  let requiredSkills: { skill: string; frequency: number }[];
  let extractedEntities: ExtractedEntities | null = null;
  const analysisMode: 'career_goal' | 'jd_comparison' = jobDescription ? 'jd_comparison' : 'career_goal';

  if (jobDescription) {
    try {
      const entities = await analyzeJobDescription(jobDescription);
      extractedEntities = entities;
      const jdSkills = [
        ...(entities?.requiredSkills ?? []).map(s => ({ skill: s, frequency: 1.0 })),
        ...(entities?.preferredSkills ?? []).map(s => ({ skill: s, frequency: 0.7 })),
        ...(entities?.techStack ?? []).map(s => ({ skill: s, frequency: 0.8 })),
      ];
      const seen = new Set<string>();
      requiredSkills = jdSkills.filter(({ skill }) => {
        const lower = skill.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      }).slice(0, 20);
      logger.info({ userId, skillCount: requiredSkills.length }, 'gap_analysis.jd_skills_extracted');
    } catch (err) {
      logger.warn({ userId, err }, 'gap_analysis.jd_extraction_failed_fallback_to_taxonomy');
      requiredSkills = mapCareerGoalToSkills(careerGoal);
    }
  } else if (jobTargetIds && jobTargetIds.length > 0) {
    const jobTargetSkills = await extractSkillsFromJobTargets(userId, jobTargetIds);
    const careerGoalSkills = mapCareerGoalToSkills(careerGoal);

    requiredSkills = mergeRequiredSkills(
      jobTargetSkills,
      careerGoalSkills.map(({ skill, frequency }) => ({ skill, frequency: frequency * 0.6 })),
    );
  } else {
    const careerGoalSkills = mapCareerGoalToSkills(careerGoal);
    const recentJdSkills = await extractSkillsFromJobTargets(userId);

    requiredSkills = mergeRequiredSkills(
      recentJdSkills.map(({ skill, frequency }) => ({ skill, frequency: frequency * 0.8 })),
      careerGoalSkills,
    );
  }

  if (requiredSkills.length === 0) {
    throw new AppError(
      'Could not determine required skills for your career goal. ' +
      'Try providing a specific job description instead.',
      422,
    );
  }

  if (!extractedEntities) {
    extractedEntities = buildEntitiesFromSkills(requiredSkills, careerGoal);
  }

  logger.info({ userId, requiredSkillCount: requiredSkills.length, analysisMode }, 'gap_analysis.scoring_started');

  // Layer 2: Deterministic gap scoring
  const scoredSkills = scoreRequiredSkills(requiredSkills, portfolioEvidence);

  // Layer 3: Semantic similarity enrichment
  type EnrichedSkill = ReturnType<typeof scoreRequiredSkills>[0] & {
    semanticScore: number;
    closestProjectTitle: string | null;
  };
  let enrichedSkills: EnrichedSkill[];
  try {
    enrichedSkills = await enrichWithSemanticSimilarity(userId, scoredSkills);
    logger.info({ userId }, 'gap_analysis.semantic_enrichment_complete');
  } catch (err) {
    logger.warn({ userId, err }, 'gap_analysis.semantic_enrichment_failed_continuing');
    enrichedSkills = scoredSkills.map(s => ({ ...s, semanticScore: 0, closestProjectTitle: null }));
  }

  // Layer 4: Prerequisite ordering
  const gapSkillNames = enrichedSkills
    .filter(s => s.evidenceLevel < 3)
    .map(s => s.skill);

  const prerequisiteOrder = getPrerequisiteOrder(gapSkillNames);

  const gapEvidence: SkillGapEvidence[] = enrichedSkills.map(s => ({
    skill: s.skill,
    evidenceLevel: s.evidenceLevel,
    evidenceSummary: s.evidenceSummary,
    supportingProjects: s.supportingProjects,
    semanticSimilarityScore: s.semanticScore,
    semanticallySimilarProject: s.closestProjectTitle ?? null,
    jdFrequency: s.jdFrequency,
    priority: s.priority,
    learningPathOrder: prerequisiteOrder.get(s.skill) ?? 1,
    clusterName: resolveSkillCluster(s.skill)?.name ?? null,
  }));

  // Layer 5: LLM synthesis with deterministic fallback
  const userPrompt = buildLLMPayload(careerGoal, portfolioEvidence, gapEvidence, jobDescription);

  let rawLLMOutput: GapAdvisorLLMOutput;
  let llmProvider = 'gemini';

  try {
    rawLLMOutput = await requestGeminiJson<GapAdvisorLLMOutput>({
      systemPrompt: gapAdvisorPrompt,
      userPrompt,
      maxOutputTokens: 2048,
      temperature: 0.2,
    });
  } catch (geminiErr) {
    logger.warn({ userId, err: geminiErr }, 'gap_analysis.gemini_failed_trying_groq');
    try {
      llmProvider = 'groq';
      rawLLMOutput = await requestGroqJson<GapAdvisorLLMOutput>({
        systemPrompt: gapAdvisorPrompt,
        userPrompt,
        maxTokens: 2000,
        temperature: 0.2,
      });
    } catch (groqErr) {
      logger.error({ userId, err: groqErr }, 'gap_analysis.all_llm_providers_failed_using_deterministic_fallback');
      rawLLMOutput = buildDeterministicFallback(gapEvidence);
      llmProvider = 'deterministic';
    }
  }

  logger.info({ userId, llmProvider }, 'gap_analysis.llm_synthesis_complete');

  const normalizedOutput = normalizeLLMOutput(rawLLMOutput, gapEvidence);
  const ranking = await rankProjects(
    userId,
    portfolioEvidence.projects.map(toRankableProject),
    extractedEntities,
    jobDescription ?? careerGoal,
    projectCount,
  );
  const rankedCertifications = rankCertifications(
    portfolioEvidence.certifications.map((cert) => ({
      id: cert.id,
      name: cert.name,
      issuingOrg: cert.issuingOrg,
    })),
    extractedEntities,
  );
  const skillMatches = buildSkillMatches(gapEvidence);
  const gaps = buildGapRecommendations(gapEvidence, ranking.rankedProjects);
  const strengths = buildStrengths(ranking.rankedProjects, rankedCertifications, skillMatches, portfolioEvidence);
  const overallMatchScore = Math.round(
    Math.min(100, Math.max(0,
      (ranking.selectedProjects.length > 0
        ? ranking.selectedProjects.reduce((sum, project) => sum + project.relevanceScore, 0) / ranking.selectedProjects.length
        : 40) * 0.45 +
      (skillMatches.length > 0
        ? (skillMatches.filter((skill) => skill.status === 'strong_match' || skill.status === 'explicit_match').length / skillMatches.length) * 100
        : 50) * 0.40 +
      Math.max(0, 100 - gaps.filter((gap) => gap.priority === 'critical').length * 18 - gaps.filter((gap) => gap.priority === 'high').length * 8) * 0.15,
    )),
  );

  const portfolioSnapshot = {
    totalItems: portfolioEvidence.totalProjectCount +
      portfolioEvidence.listedSkills.length +
      portfolioEvidence.experience.length,
    projectCount: portfolioEvidence.totalProjectCount,
    skillCount: portfolioEvidence.listedSkills.length + portfolioEvidence.demonstratedSkills.length,
    hasGithubProjects: portfolioEvidence.githubProjectCount > 0,
    avgValidationScore: portfolioEvidence.avgValidationScore,
  };

  const durationMs = Date.now() - startTime;
  logger.info({
    userId,
    analysisMode,
    llmProvider,
    durationMs,
    rankedProjectCount: ranking.rankedProjects.length,
    selectedProjectIds: ranking.selectedProjectIds,
  }, 'gap_analysis.complete');

  if (!persist) {
    return {
      id: randomUUID(),
      user_id: userId,
      career_goal: careerGoal,
      missing_skills: normalizedOutput.missing_skills,
      suggested_projects: normalizedOutput.suggested_projects,
      learning_resources: normalizedOutput.learning_resources,
      generated_at: new Date(),
      analysis_mode: analysisMode,
      overall_assessment: normalizedOutput.overall_assessment,
      evidence_data: gapEvidence,
      jd_snippet: jobDescription ? jobDescription.slice(0, 500) : null,
      portfolio_snapshot: portfolioSnapshot,
      overall_match_score: overallMatchScore,
      strengths,
      ranked_projects: ranking.rankedProjects,
      ranked_certifications: rankedCertifications,
      skill_matches: skillMatches,
      gaps,
      selected_project_ids: ranking.selectedProjectIds,
      recommended_project_count: projectCount ?? DEFAULT_PROJECT_COUNT,
    };
  }

  const result = await pool.query<EnhancedGapAnalysisRow>(
    `INSERT INTO gap_analyses (
       user_id, career_goal, missing_skills, suggested_projects, learning_resources,
       generated_at, analysis_mode, overall_assessment, evidence_data,
       jd_snippet, portfolio_snapshot, overall_match_score, strengths,
       ranked_projects, ranked_certifications, skill_matches, gaps,
       selected_project_ids, recommended_project_count
     )
     VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     ON CONFLICT (user_id)
     DO UPDATE SET
       career_goal = EXCLUDED.career_goal,
       missing_skills = EXCLUDED.missing_skills,
       suggested_projects = EXCLUDED.suggested_projects,
       learning_resources = EXCLUDED.learning_resources,
       generated_at = NOW(),
       analysis_mode = EXCLUDED.analysis_mode,
       overall_assessment = EXCLUDED.overall_assessment,
       evidence_data = EXCLUDED.evidence_data,
       jd_snippet = EXCLUDED.jd_snippet,
       portfolio_snapshot = EXCLUDED.portfolio_snapshot,
       overall_match_score = EXCLUDED.overall_match_score,
       strengths = EXCLUDED.strengths,
       ranked_projects = EXCLUDED.ranked_projects,
       ranked_certifications = EXCLUDED.ranked_certifications,
       skill_matches = EXCLUDED.skill_matches,
       gaps = EXCLUDED.gaps,
       selected_project_ids = EXCLUDED.selected_project_ids,
       recommended_project_count = EXCLUDED.recommended_project_count
     RETURNING *`,
    [
      userId,
      careerGoal,
      JSON.stringify(normalizedOutput.missing_skills),
      JSON.stringify(normalizedOutput.suggested_projects),
      JSON.stringify(normalizedOutput.learning_resources),
      analysisMode,
      normalizedOutput.overall_assessment,
      JSON.stringify(gapEvidence),
      jobDescription ? jobDescription.slice(0, 500) : null,
      JSON.stringify(portfolioSnapshot),
      overallMatchScore,
      JSON.stringify(strengths),
      JSON.stringify(ranking.rankedProjects),
      JSON.stringify(rankedCertifications),
      JSON.stringify(skillMatches),
      JSON.stringify(gaps),
      ranking.selectedProjectIds,
      projectCount ?? DEFAULT_PROJECT_COUNT,
    ],
  );

  const saved = result.rows[0]!;
  logger.info({ userId, analysisId: saved.id }, 'gap_analysis.persisted');
  return saved;
};

// ─── getLatestGapAnalysis ──────────────────────────────────────────────────────

export const getLatestGapAnalysis = async (
  userId: string,
): Promise<EnhancedGapAnalysisRow> => {
  const result = await pool.query<EnhancedGapAnalysisRow>(
    `SELECT * FROM gap_analyses WHERE user_id = $1`,
    [userId],
  );

  const analysis = result.rows[0];
  if (!analysis) {
    throw new NotFoundError(
      'No gap analysis found. Run POST /analytics/gap-analysis first.',
    );
  }

  return analysis;
};
