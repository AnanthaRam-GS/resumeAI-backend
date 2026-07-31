import { pool } from '../../db/client.js';
import type {
  RichPortfolioEvidence,
  RichPortfolioProject,
  SkillGapEvidence,
  EvidenceLevel,
} from '../../types/resume.types.js';
import { generateEmbedding } from '../../services/embedding.service.js';
import { env } from '../../config/env.js';
import { loadSkillTaxonomy } from './gap-taxonomy.service.js';

// ─── Layer 1: Fetch rich portfolio evidence ────────────────────────────────────

interface PortfolioItemRow {
  id: string;
  type: string;
  source: string;
  title: string;
  description: string | null;
  tech_stack: string[];
  impact_metrics: string | null;
  validation_score: string | null;
  domain_category: string | null;
  company_name: string | null;
  skill_name: string | null;
  issuing_org: string | null;
  end_date: string | null;
  is_current: boolean;
  extra: Record<string, unknown>;
  has_embedding: boolean;
}

const embeddingColumnExists = async (): Promise<boolean> => {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'portfolio_items' AND column_name = 'embedding'
     ) AS exists`,
  );
  return rows[0]?.exists ?? false;
};

let _embeddingColCache: boolean | null = null;
const hasEmbeddingColumn = async (): Promise<boolean> => {
  if (_embeddingColCache === null) {
    _embeddingColCache = await embeddingColumnExists();
  }
  return _embeddingColCache;
};

export const resetEmbeddingColumnCache = (): void => {
  _embeddingColCache = null;
};

export const fetchRichPortfolioEvidence = async (
  userId: string,
): Promise<RichPortfolioEvidence> => {
  const embeddingExpr = (await hasEmbeddingColumn())
    ? '(embedding IS NOT NULL) AS has_embedding'
    : 'FALSE AS has_embedding';

  const result = await pool.query<PortfolioItemRow>(
    `SELECT
       id, type, source, title, description, tech_stack, impact_metrics,
       validation_score, domain_category, company_name, skill_name, issuing_org,
       end_date, is_current, extra,
       ${embeddingExpr}
     FROM portfolio_items
     WHERE user_id = $1
     ORDER BY
       CASE WHEN is_current THEN 0 ELSE 1 END,
       end_date DESC NULLS LAST,
       created_at DESC`,
    [userId],
  );

  const items = result.rows;

  const projects: RichPortfolioProject[] = items
    .filter(i => i.type === 'project')
    .map(i => ({
      id: i.id,
      title: i.title,
      description: i.description,
      techStack: i.tech_stack ?? [],
      impactMetrics: i.impact_metrics,
      validationScore: i.validation_score ? parseFloat(i.validation_score) : null,
      domainCategory: i.domain_category,
      source: i.source as RichPortfolioProject['source'],
      endDate: i.end_date,
      isCurrent: i.is_current,
      hasEmbedding: i.has_embedding,
    }));

  const projectText = projects.map(p =>
    [p.title, p.description, ...(p.techStack ?? [])].join(' ').toLowerCase(),
  ).join(' ');

  const skillItems = items.filter(i => i.type === 'skill' && i.skill_name);
  const demonstratedSkills: string[] = [];
  const listedSkills: string[] = [];

  for (const s of skillItems) {
    const name = s.skill_name!;
    const isDemonstrated = projectText.includes(name.toLowerCase());
    if (isDemonstrated) {
      demonstratedSkills.push(name);
    } else {
      listedSkills.push(name);
    }
  }

  const techStackSkills = [...new Set(projects.flatMap(p => p.techStack))];
  for (const skill of techStackSkills) {
    if (!demonstratedSkills.includes(skill)) {
      demonstratedSkills.push(skill);
    }
  }

  const validScores = projects
    .map(p => p.validationScore)
    .filter((s): s is number => s !== null);
  const avgValidationScore = validScores.length > 0
    ? validScores.reduce((a, b) => a + b, 0) / validScores.length
    : null;

  return {
    projects,
    demonstratedSkills: [...new Set(demonstratedSkills)],
    listedSkills: [...new Set(listedSkills)],
    experience: items
      .filter(i => i.type === 'experience')
      .map(i => ({
        title: i.title,
        company: i.company_name,
        techStack: i.tech_stack ?? [],
        isCurrent: i.is_current,
      })),
    certifications: items
      .filter(i => i.type === 'certification')
      .map(i => ({
        id: i.id,
        name: i.title,
        issuingOrg: i.issuing_org,
      })),
    avgValidationScore,
    totalProjectCount: projects.length,
    githubProjectCount: projects.filter(p => p.source === 'github').length,
  };
};

// ─── Skill alias / synonym resolution ─────────────────────────────────────────

let _synonymMap: Map<string, string> | null = null;

const getSynonymMap = (): Map<string, string> => {
  if (_synonymMap) return _synonymMap;

  const taxonomy = loadSkillTaxonomy();
  const map = new Map<string, string>();

  for (const group of taxonomy.groups) {
    for (const skillDef of group.skills) {
      const canonical = skillDef.name.toLowerCase();
      map.set(canonical, skillDef.name);
      for (const syn of skillDef.synonyms ?? []) {
        map.set(syn.toLowerCase(), skillDef.name);
      }
    }
  }

  _synonymMap = map;
  return map;
};

export const resetSynonymMapCache = (): void => {
  _synonymMap = null;
};

export const resolveCanonicalSkill = (skill: string): string => {
  const map = getSynonymMap();
  return map.get(skill.toLowerCase().trim()) ?? skill;
};

const skillMatchesText = (skill: string, text: string): boolean => {
  const lowerText = text.toLowerCase();
  const lowerSkill = skill.toLowerCase().trim();
  if (lowerText.includes(lowerSkill)) return true;

  const map = getSynonymMap();
  for (const [synonym, canonical] of map.entries()) {
    if (canonical.toLowerCase() === lowerSkill && lowerText.includes(synonym)) {
      return true;
    }
  }
  return false;
};

// ─── Layer 2: Deterministic gap scoring ───────────────────────────────────────

export const computeEvidenceLevel = (
  skill: string,
  evidence: RichPortfolioEvidence,
): {
  level: EvidenceLevel;
  summary: string;
  supportingProjects: SkillGapEvidence['supportingProjects'];
} => {
  const canonicalSkill = resolveCanonicalSkill(skill);

  const isListedByName =
    evidence.listedSkills.some(s => resolveCanonicalSkill(s).toLowerCase() === canonicalSkill.toLowerCase()) ||
    evidence.demonstratedSkills.some(s => resolveCanonicalSkill(s).toLowerCase() === canonicalSkill.toLowerCase());

  const matchingProjects = evidence.projects.filter(p => {
    const projectText = [p.title, p.description, ...p.techStack].filter(Boolean).join(' ');
    return skillMatchesText(canonicalSkill, projectText);
  });

  const matchingExperience = evidence.experience.filter(exp => {
    const expText = [exp.title, exp.company, ...exp.techStack].filter(Boolean).join(' ');
    return skillMatchesText(canonicalSkill, expText);
  });

  const matchingCertification = evidence.certifications.some(cert => {
    return skillMatchesText(canonicalSkill, [cert.name, cert.issuingOrg ?? ''].join(' '));
  });

  const hasAnyProjectEvidence = matchingProjects.length > 0;
  const hasExperienceEvidence = matchingExperience.length > 0;

  if (!isListedByName && !hasAnyProjectEvidence && !hasExperienceEvidence && !matchingCertification) {
    return {
      level: 0,
      summary: 'Not found anywhere in your portfolio',
      supportingProjects: [],
    };
  }

  const supportingProjects = matchingProjects.slice(0, 3).map(p => ({
    id: p.id,
    title: p.title,
    hasImpact: Boolean(p.impactMetrics?.trim()),
    validationScore: p.validationScore,
  }));

  if (!hasAnyProjectEvidence && !hasExperienceEvidence) {
    const certNote = matchingCertification ? ' (supported by certification)' : '';
    return {
      level: 1,
      summary: `Listed in skills section but not demonstrated in any project${certNote}`,
      supportingProjects: [],
    };
  }

  if (hasAnyProjectEvidence) {
    const projectsWithImpact = matchingProjects.filter(p => p.impactMetrics?.trim());
    const validationScores = matchingProjects
      .map(p => p.validationScore)
      .filter((score): score is number => score !== null);
    const averageValidationScore = validationScores.length > 0
      ? validationScores.reduce((sum, score) => sum + score, 0) / validationScores.length
      : null;

    if (
      (matchingProjects.length >= 2 && projectsWithImpact.length >= 1) ||
      (matchingProjects.length >= 2 && (averageValidationScore ?? 0) >= 80) ||
      validationScores.some(score => score >= 90) ||
      (matchingProjects.length === 1 && projectsWithImpact.length === 1 && (averageValidationScore ?? 0) >= 85)
    ) {
      return {
        level: 3,
        summary: projectsWithImpact.length > 0
          ? `Proven in ${matchingProjects.length} project${matchingProjects.length === 1 ? '' : 's'} with measurable impact`
          : `Proven by high-quality project evidence across ${matchingProjects.length} projects`,
        supportingProjects,
      };
    }

    return {
      level: 2,
      summary: matchingProjects.length === 1
        ? `Demonstrated in 1 project (${matchingProjects[0]!.title})`
        : `Demonstrated in ${matchingProjects.length} projects`,
      supportingProjects,
    };
  }

  // Experience tech stack evidence (no project evidence) → level 2
  return {
    level: 2,
    summary: `Demonstrated in ${matchingExperience.length} work experience record${matchingExperience.length === 1 ? '' : 's'}`,
    supportingProjects: [],
  };
};

export const derivePriority = (
  evidenceLevel: EvidenceLevel,
  jdFrequency: number,
  avgProjectQuality: number | null,
): 'high' | 'medium' | 'low' => {
  if (evidenceLevel === 0 && jdFrequency >= 0.5) return 'high';
  if (evidenceLevel === 0 && jdFrequency >= 0.3) return 'high';
  if (evidenceLevel === 1 && jdFrequency >= 0.6) return 'high';
  if (evidenceLevel >= 3) return 'low';
  if (evidenceLevel >= 2 && (avgProjectQuality ?? 0) > 60) return 'low';
  return 'medium';
};

export const scoreRequiredSkills = (
  requiredSkills: { skill: string; frequency: number }[],
  evidence: RichPortfolioEvidence,
): Array<{
  skill: string;
  jdFrequency: number;
  evidenceLevel: EvidenceLevel;
  evidenceSummary: string;
  supportingProjects: SkillGapEvidence['supportingProjects'];
  avgProjectQuality: number | null;
  priority: 'high' | 'medium' | 'low';
}> => {
  return requiredSkills.map(({ skill, frequency }) => {
    const { level, summary, supportingProjects } = computeEvidenceLevel(skill, evidence);

    const avgQuality = supportingProjects.length > 0
      ? supportingProjects
        .map(p => p.validationScore)
        .filter((s): s is number => s !== null)
        .reduce((a, b, _, arr) => a + b / arr.length, 0)
      : null;

    return {
      skill,
      jdFrequency: frequency,
      evidenceLevel: level,
      evidenceSummary: summary,
      supportingProjects,
      avgProjectQuality: avgQuality,
      priority: derivePriority(level, frequency, avgQuality),
    };
  });
};

// ─── Layer 3: Semantic similarity via pgvector ────────────────────────────────

const generateSkillEmbedding = async (skillPhrase: string): Promise<number[] | null> => {
  if (env.NODE_ENV === 'test' || !env.GEMINI_API_KEY) {
    return null;
  }

  try {
    return await generateEmbedding(skillPhrase, 'gap_skill_embedding');
  } catch {
    return null;
  }
};

interface SemanticMatchResult {
  semanticScore: number;
  closestProjectTitle: string | null;
}

export const computeSemanticSimilarity = async (
  userId: string,
  skill: string,
): Promise<SemanticMatchResult> => {
  const embedding = await generateSkillEmbedding(skill);

  if (!embedding) {
    return { semanticScore: 0, closestProjectTitle: null };
  }

  try {
    const result = await pool.query<{ title: string; similarity: number }>(
      `SELECT title, 1 - (embedding <=> $1::vector) AS similarity
       FROM portfolio_items
       WHERE user_id = $2
         AND embedding IS NOT NULL
         AND type = 'project'
       ORDER BY embedding <=> $1::vector
       LIMIT 1`,
      [`[${embedding.join(',')}]`, userId],
    );

    if (result.rows.length === 0) {
      return { semanticScore: 0, closestProjectTitle: null };
    }

    const { title, similarity } = result.rows[0]!;
    return {
      semanticScore: Math.max(0, Math.min(1, similarity)),
      closestProjectTitle: similarity > 0.6 ? title : null,
    };
  } catch {
    return { semanticScore: 0, closestProjectTitle: null };
  }
};

export const enrichWithSemanticSimilarity = async (
  userId: string,
  scoredSkills: ReturnType<typeof scoreRequiredSkills>,
): Promise<Array<ReturnType<typeof scoreRequiredSkills>[0] & SemanticMatchResult>> => {
  const results = await Promise.allSettled(
    scoredSkills.map(async (s) => {
      if (s.evidenceLevel >= 2) {
        return { ...s, semanticScore: 1.0, closestProjectTitle: null };
      }
      const semantic = await computeSemanticSimilarity(userId, s.skill);
      return { ...s, ...semantic };
    }),
  );

  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { ...scoredSkills[i]!, semanticScore: 0, closestProjectTitle: null },
  );
};
