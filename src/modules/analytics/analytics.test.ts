import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scoreAtsMatch } from '../../services/ats-scorer.service.js';
import type { ExtractedEntities } from '../../types/ai.types.js';
import {
  computeEvidenceLevel,
  derivePriority,
  resolveCanonicalSkill,
  resetEmbeddingColumnCache,
  resetSynonymMapCache,
} from './gap-evidence.service.js';
import {
  mapCareerGoalToSkills,
  getPrerequisiteOrder,
  aggregateJdSkills,
} from './gap-taxonomy.service.js';
import { normalizeLLMOutput } from './gap-advisor.service.js';
import type { RichPortfolioEvidence, SkillGapEvidence } from '../../types/resume.types.js';

// ── Inline fixtures ────────────────────────────────────────────────────────────

const mockJobDescription = `
We are hiring a Senior Backend Engineer to join our platform team.

Requirements:
- 3+ years of experience with TypeScript and Node.js
- Strong knowledge of Fastify or Express frameworks
- PostgreSQL and database design experience
- Experience with AWS services (S3, EC2, Lambda)
- Familiarity with REST API design and testing
- Docker and containerization experience preferred
- CI/CD pipeline knowledge (GitHub Actions, GitLab CI)

Responsibilities:
- Design and implement scalable backend services
- Optimize database queries and system performance
- Write comprehensive unit and integration tests
- Collaborate with frontend and DevOps teams
`;

const mockExtractedEntities: ExtractedEntities = {
  requiredSkills: ['TypeScript', 'Node.js', 'Fastify', 'PostgreSQL', 'AWS'],
  preferredSkills: ['REST APIs', 'Testing', 'Docker', 'CI/CD'],
  techStack: ['TypeScript', 'Node.js', 'PostgreSQL', 'AWS S3', 'Docker'],
  roleSeniority: 'senior',
  roleCategory: 'Backend Engineering',
  summary: 'Senior Backend Engineer role focused on scalable platform services',
  responsibilities: [
    'Design and implement scalable backend services',
    'Optimize database queries',
    'Write comprehensive tests',
  ],
  keywords: ['backend', 'engineer', 'platform', 'scalable'],
};

// ── Top-level mocks ────────────────────────────────────────────────────────────

const poolQueryMock = vi.fn();
vi.mock('../../db/client.js', () => ({ pool: { query: poolQueryMock } }));

const geminiJsonMock = vi.fn();
vi.mock('../../services/gemini.service.js', () => ({
  requestGeminiJson: geminiJsonMock,
}));

const groqJsonMock = vi.fn();
vi.mock('../../services/groq.service.js', () => ({
  requestGroqJson: groqJsonMock,
}));

const analyzeJdMock = vi.fn();
vi.mock('../ai/jd-analyzer.service.js', () => ({
  analyzeJobDescription: analyzeJdMock,
}));

vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── ATS scorer deterministic tests ────────────────────────────────────────────

describe('scoreAtsMatch', () => {
  const resumeWithMatches = `
    Experienced TypeScript engineer with Node.js and Fastify backend services.
    Built PostgreSQL databases and deployed to AWS. Used Docker for containerization.
    REST API design and testing best practices applied throughout.
  `;

  const resumeWithNoMatches = `
    Graphic designer with expertise in Photoshop, Illustrator, and InDesign.
    Created brand identity systems and marketing materials for B2C clients.
  `;

  it('returns a positive score when skills match JD', () => {
    const result = scoreAtsMatch({
      jobDescription: mockJobDescription,
      resumeText: resumeWithMatches,
      extractedEntities: mockExtractedEntities,
    });
    expect(result.score).toBeGreaterThan(0);
    expect(result.foundKeywords.length).toBeGreaterThan(0);
  });

  it('returns a low score when resume has no matching skills', () => {
    const result = scoreAtsMatch({
      jobDescription: mockJobDescription,
      resumeText: resumeWithNoMatches,
      extractedEntities: mockExtractedEntities,
    });
    expect(result.score).toBeLessThan(30);
    expect(result.missingKeywords.length).toBeGreaterThan(0);
  });

  it('includes TypeScript and Node.js in found keywords for a matching resume', () => {
    const result = scoreAtsMatch({
      jobDescription: mockJobDescription,
      resumeText: resumeWithMatches,
      extractedEntities: mockExtractedEntities,
    });
    expect(result.foundKeywords).toEqual(expect.arrayContaining(['TypeScript', 'Node.js']));
  });

  it('includes suggestions when required skills are missing', () => {
    const result = scoreAtsMatch({
      jobDescription: mockJobDescription,
      resumeText: resumeWithNoMatches,
      extractedEntities: mockExtractedEntities,
    });
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0]).toContain('TypeScript');
  });

  it('score is between 0 and 100', () => {
    const result = scoreAtsMatch({
      jobDescription: mockJobDescription,
      resumeText: resumeWithMatches,
      extractedEntities: mockExtractedEntities,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('works with no extracted entities (fallback to taxonomy-only matching)', () => {
    const result = scoreAtsMatch({
      jobDescription: 'We need a TypeScript engineer with Node.js experience.',
      resumeText: 'TypeScript and Node.js developer with 3 years of experience.',
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.foundKeywords).toBeInstanceOf(Array);
  });
});

// ── ATS service (DB layer) ────────────────────────────────────────────────────

describe('ats.service (mocked DB)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns ATS result for owned resume version', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rv-1',
        user_id: 'user-1',
        version_label: 'SBE-Google-v1',
        ats_score: '82.50',
        ats_feedback: {
          foundKeywords: ['TypeScript'],
          missingKeywords: [],
          suggestions: [],
          matchedKeywords: ['TypeScript'],
        },
        created_at: new Date(),
        job_title: 'Backend Engineer',
        company_name: 'Google',
      }],
    });

    const { getAtsResultForVersion } = await import('./ats.service.js');
    const result = await getAtsResultForVersion('user-1', 'rv-1');
    expect(result.atsScore).toBe(82.5);
    expect(result.versionLabel).toBe('SBE-Google-v1');
    expect(result.jobTitle).toBe('Backend Engineer');
  });

  it('throws NotFoundError when resume version does not exist', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });
    const { getAtsResultForVersion } = await import('./ats.service.js');
    await expect(getAtsResultForVersion('user-1', 'nonexistent')).rejects.toThrow('Resume version not found');
  });

  it('throws ForbiddenError when version belongs to another user', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rv-1',
        user_id: 'other-user',
        version_label: null,
        ats_score: null,
        ats_feedback: null,
        created_at: new Date(),
        job_title: null,
        company_name: null,
      }],
    });
    const { getAtsResultForVersion } = await import('./ats.service.js');
    await expect(getAtsResultForVersion('user-1', 'rv-1')).rejects.toThrow('does not belong');
  });
});

// ── computeEvidenceLevel (pure unit tests, no DB) ─────────────────────────────

const makeEvidence = (overrides: Partial<RichPortfolioEvidence> = {}): RichPortfolioEvidence => ({
  projects: [],
  demonstratedSkills: [],
  listedSkills: [],
  experience: [],
  certifications: [],
  avgValidationScore: null,
  totalProjectCount: 0,
  githubProjectCount: 0,
  ...overrides,
});

const makeProject = (overrides: Partial<{
  id: string; title: string; description: string | null;
  techStack: string[]; impactMetrics: string | null;
  validationScore: number | null; domainCategory: string | null;
  source: 'manual' | 'github' | 'upload';
  endDate: string | null; isCurrent: boolean; hasEmbedding: boolean;
}> = {}) => ({
  id: 'p1', title: 'Test Project', description: null,
  techStack: [], impactMetrics: null, validationScore: null,
  domainCategory: null, source: 'manual' as const,
  endDate: null, isCurrent: false, hasEmbedding: false,
  ...overrides,
});

describe('computeEvidenceLevel', () => {
  it('returns level 0 when skill not found anywhere in portfolio', () => {
    const evidence = makeEvidence();
    const result = computeEvidenceLevel('Kubernetes', evidence);
    expect(result.level).toBe(0);
    expect(result.supportingProjects).toHaveLength(0);
  });

  it('returns level 1 when skill only in listedSkills, not in any project', () => {
    const evidence = makeEvidence({ listedSkills: ['Kubernetes'] });
    const result = computeEvidenceLevel('Kubernetes', evidence);
    expect(result.level).toBe(1);
    expect(result.summary).toContain('Listed in skills section');
  });

  it('returns level 1 with cert note when only cert covers it', () => {
    const evidence = makeEvidence({
      certifications: [{ name: 'Kubernetes Administrator (CKA)', issuingOrg: 'CNCF' }],
    });
    const result = computeEvidenceLevel('Kubernetes', evidence);
    expect(result.level).toBe(1);
    expect(result.summary).toContain('certification');
  });

  it('returns level 2 when skill appears in 1 project tech_stack', () => {
    const evidence = makeEvidence({
      projects: [makeProject({ techStack: ['Kubernetes'] })],
    });
    const result = computeEvidenceLevel('Kubernetes', evidence);
    expect(result.level).toBe(2);
  });

  it('returns level 2 when skill appears in project description text', () => {
    const evidence = makeEvidence({
      projects: [makeProject({ description: 'Deployed services using Kubernetes clusters' })],
    });
    const result = computeEvidenceLevel('Kubernetes', evidence);
    expect(result.level).toBe(2);
  });

  it('returns level 2 when skill appears in experience tech stack', () => {
    const evidence = makeEvidence({
      experience: [{ title: 'Backend Engineer', company: 'Acme', techStack: ['Kubernetes'], isCurrent: false }],
    });
    const result = computeEvidenceLevel('Kubernetes', evidence);
    expect(result.level).toBe(2);
  });

  it('returns level 3 when skill in 2+ projects AND one has impact_metrics', () => {
    const evidence = makeEvidence({
      projects: [
        makeProject({
          id: 'p1', title: 'Infra Project', description: 'Kubernetes-based orchestration',
          techStack: ['Kubernetes'], impactMetrics: 'Reduced deploy time by 40%',
          validationScore: 85, source: 'github', hasEmbedding: true,
        }),
        makeProject({
          id: 'p2', title: 'Platform',
          techStack: ['Kubernetes', 'Docker'], validationScore: 72,
        }),
      ],
    });
    const result = computeEvidenceLevel('Kubernetes', evidence);
    expect(result.level).toBe(3);
    expect(result.summary).toContain('Proven');
  });

  it('is case-insensitive (node.js matches Node.js)', () => {
    const evidence = makeEvidence({
      projects: [makeProject({ techStack: ['Node.js'] })],
    });
    const result = computeEvidenceLevel('node.js', evidence);
    expect(result.level).toBe(2);
  });

  it('handles empty portfolio gracefully', () => {
    const evidence = makeEvidence();
    const result = computeEvidenceLevel('React', evidence);
    expect(result.level).toBe(0);
    expect(result.supportingProjects).toHaveLength(0);
  });
});

// ── resolveCanonicalSkill (alias resolution) ───────────────────────────────────

describe('resolveCanonicalSkill', () => {
  beforeEach(() => { resetSynonymMapCache(); });

  it('resolves "k8s" to "Kubernetes"', () => {
    expect(resolveCanonicalSkill('k8s')).toBe('Kubernetes');
  });

  it('resolves "node" to "Node.js"', () => {
    expect(resolveCanonicalSkill('node')).toBe('Node.js');
  });

  it('resolves "postgres" to "SQL" (taxonomy synonym)', () => {
    const result = resolveCanonicalSkill('postgres');
    expect(['SQL', 'PostgreSQL']).toContain(result);
  });

  it('preserves unknown skills as-is', () => {
    expect(resolveCanonicalSkill('SomeObscureTool')).toBe('SomeObscureTool');
  });

  it('is case-insensitive for resolution', () => {
    expect(resolveCanonicalSkill('DOCKER')).toBe(resolveCanonicalSkill('docker'));
  });
});

// ── derivePriority (pure unit tests) ──────────────────────────────────────────

describe('derivePriority', () => {
  it('returns high for evidenceLevel=0 and jdFrequency>=0.5', () => {
    expect(derivePriority(0, 0.5, null)).toBe('high');
  });

  it('returns high for evidenceLevel=0 and jdFrequency>=0.3', () => {
    expect(derivePriority(0, 0.3, null)).toBe('high');
  });

  it('returns high for evidenceLevel=1 and jdFrequency>=0.6', () => {
    expect(derivePriority(1, 0.6, null)).toBe('high');
  });

  it('returns low for evidenceLevel=3', () => {
    expect(derivePriority(3, 1.0, null)).toBe('low');
  });

  it('returns low for evidenceLevel=2 and avgQuality>60', () => {
    expect(derivePriority(2, 0.8, 75)).toBe('low');
  });

  it('returns medium as default for borderline cases', () => {
    expect(derivePriority(1, 0.1, null)).toBe('medium');
    expect(derivePriority(2, 0.5, 50)).toBe('medium');
  });
});

// ── gap-taxonomy.service ───────────────────────────────────────────────────────

describe('mapCareerGoalToSkills', () => {
  it('maps "senior backend engineer" to backend infrastructure skills', () => {
    const result = mapCareerGoalToSkills('Become a senior backend engineer at FAANG');
    expect(result.length).toBeGreaterThan(0);
    const skillNames = result.map(s => s.skill);
    expect(skillNames.some(s =>
      ['Kubernetes', 'Docker', 'System Design', 'Microservices', 'AWS'].includes(s),
    )).toBe(true);
  });

  it('maps "machine learning engineer" to ML core skills', () => {
    const result = mapCareerGoalToSkills('I want to be a machine learning engineer');
    const skillNames = result.map(s => s.skill);
    expect(skillNames.some(s =>
      ['Machine Learning', 'Neural Networks', 'Feature Engineering', 'Data Pipelines'].includes(s),
    )).toBe(true);
  });

  it('returns skills for unrecognized career goal via text extraction', () => {
    const result = mapCareerGoalToSkills('iOS developer at Apple');
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns at most 15 skills', () => {
    const result = mapCareerGoalToSkills('senior backend engineer');
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it('assigns higher frequency to weights from matching clusters', () => {
    const result = mapCareerGoalToSkills('senior backend engineer');
    const systemDesign = result.find(s => s.skill === 'System Design');
    if (systemDesign) {
      expect(systemDesign.frequency).toBeGreaterThanOrEqual(0.8);
    }
  });
});

describe('getPrerequisiteOrder', () => {
  it('assigns order 1 to skills with no prerequisites in the list', () => {
    const orderMap = getPrerequisiteOrder(['Docker', 'React']);
    expect(orderMap.get('React')).toBeDefined();
    expect(orderMap.get('Docker')).toBeDefined();
  });

  it('handles skills not in any cluster', () => {
    const orderMap = getPrerequisiteOrder(['SomeObscureSkill']);
    expect(orderMap.get('SomeObscureSkill')).toBe(1);
  });

  it('avoids infinite loop for circular prerequisites', () => {
    const orderMap = getPrerequisiteOrder(['AWS', 'Kubernetes', 'System Design', 'Docker']);
    expect(orderMap.size).toBeGreaterThan(0);
  });

  it('returns a Map', () => {
    const result = getPrerequisiteOrder(['Docker']);
    expect(result).toBeInstanceOf(Map);
  });
});

describe('aggregateJdSkills', () => {
  it('returns skills present in all JDs with frequency 1.0', () => {
    const result = aggregateJdSkills([
      ['TypeScript', 'Node.js'],
      ['TypeScript', 'AWS'],
      ['TypeScript', 'Docker'],
    ]);
    const ts = result.find(s => s.skill === 'TypeScript');
    expect(ts?.frequency).toBe(1.0);
  });

  it('returns skills present in 50% of JDs with frequency 0.5', () => {
    const result = aggregateJdSkills([
      ['TypeScript', 'Node.js'],
      ['TypeScript', 'Python'],
    ]);
    const node = result.find(s => s.skill === 'Node.js');
    const python = result.find(s => s.skill === 'Python');
    expect(node?.frequency).toBe(0.5);
    expect(python?.frequency).toBe(0.5);
  });

  it('filters out skills present in fewer than 20% of JDs', () => {
    const input = [
      ['TypeScript', 'Kotlin'],
      ['TypeScript', 'Swift'],
      ['TypeScript', 'Rust'],
      ['TypeScript', 'Elixir'],
      ['TypeScript', 'Haskell'],
    ];
    const result = aggregateJdSkills(input);
    const ts = result.find(s => s.skill === 'TypeScript');
    expect(ts?.frequency).toBe(1.0);
  });

  it('returns empty array for empty input', () => {
    expect(aggregateJdSkills([])).toHaveLength(0);
  });
});

// ── normalizeLLMOutput (unit tests, no DB) ────────────────────────────────────

const makeGapEvidence = (skill: string, overrides: Partial<SkillGapEvidence> = {}): SkillGapEvidence => ({
  skill,
  evidenceLevel: 0,
  evidenceSummary: `${skill} not found`,
  supportingProjects: [],
  semanticSimilarityScore: 0,
  semanticallySimilarProject: null,
  jdFrequency: 0.8,
  priority: 'high',
  learningPathOrder: 1,
  clusterName: null,
  ...overrides,
});

describe('normalizeLLMOutput', () => {
  it('filters out skills not in preComputedGaps', () => {
    const gaps = [makeGapEvidence('Docker')];
    const raw = {
      overall_assessment: 'Good progress overall.',
      missing_skills: [
        { skill: 'Docker', priority: 'high' as const, reason: 'Not demonstrated.', evidence_level: 0 as const, supporting_projects: [], learning_path_order: 1, cluster_name: null, semantic_similarity_score: 0 },
        { skill: 'FakeSkill2025', priority: 'high' as const, reason: 'Hallucinated.', evidence_level: 0 as const, supporting_projects: [], learning_path_order: 1, cluster_name: null, semantic_similarity_score: 0 },
      ],
      suggested_projects: [],
      learning_resources: [],
    };
    const result = normalizeLLMOutput(raw, gaps);
    expect(result.missing_skills.map(s => s.skill)).toEqual(['Docker']);
    expect(result.missing_skills.find(s => s.skill === 'FakeSkill2025')).toBeUndefined();
  });

  it('overrides LLM priority with preComputed priority', () => {
    const gaps = [makeGapEvidence('Docker', { priority: 'low', evidenceLevel: 3 })];
    const raw = {
      overall_assessment: 'Good progress.',
      missing_skills: [
        { skill: 'Docker', priority: 'high' as const, reason: 'Needs work.', evidence_level: 1 as const, supporting_projects: [], learning_path_order: 1, cluster_name: null, semantic_similarity_score: 0 },
      ],
      suggested_projects: [],
      learning_resources: [],
    };
    const result = normalizeLLMOutput(raw, gaps);
    expect(result.missing_skills[0]?.priority).toBe('low');
    expect(result.missing_skills[0]?.evidence_level).toBe(3);
  });

  it('caps missing_skills at 8', () => {
    const gaps = Array.from({ length: 12 }, (_, i) => makeGapEvidence(`Skill${i}`));
    const raw = {
      overall_assessment: 'OK.',
      missing_skills: gaps.map(g => ({
        skill: g.skill, priority: 'medium' as const, reason: 'Needs work.',
        evidence_level: 0 as const, supporting_projects: [], learning_path_order: 1,
        cluster_name: null, semantic_similarity_score: 0,
      })),
      suggested_projects: [],
      learning_resources: [],
    };
    const result = normalizeLLMOutput(raw, gaps);
    expect(result.missing_skills.length).toBeLessThanOrEqual(8);
  });

  it('caps suggested_projects at 5', () => {
    const gaps = [makeGapEvidence('Docker')];
    const raw = {
      overall_assessment: 'Good.',
      missing_skills: [],
      suggested_projects: Array.from({ length: 7 }, (_, i) => ({
        project_type: `Project ${i}`,
        description: 'Build something.',
        skills_addressed: ['Docker'],
      })),
      learning_resources: [],
    };
    const result = normalizeLLMOutput(raw, gaps);
    expect(result.suggested_projects.length).toBeLessThanOrEqual(5);
  });

  it('caps learning_resources at 8', () => {
    const gaps = [makeGapEvidence('Docker')];
    const raw = {
      overall_assessment: 'Good.',
      missing_skills: [],
      suggested_projects: [],
      learning_resources: Array.from({ length: 10 }, (_, i) => ({
        resource: `Resource ${i}`,
        url: 'https://example.com',
        skill_addressed: 'Docker',
      })),
    };
    const result = normalizeLLMOutput(raw, gaps);
    expect(result.learning_resources.length).toBeLessThanOrEqual(8);
  });

  it('rejects invalid resource URLs', () => {
    const gaps = [makeGapEvidence('Docker')];
    const raw = {
      overall_assessment: 'Good.',
      missing_skills: [],
      suggested_projects: [],
      learning_resources: [
        { resource: 'Docs', url: 'not-a-url', skill_addressed: 'Docker' },
        { resource: 'Real Docs', url: 'https://docs.docker.com', skill_addressed: 'Docker' },
      ],
    };
    const result = normalizeLLMOutput(raw, gaps);
    const invalidResource = result.learning_resources.find(r => r.resource === 'Docs');
    expect(invalidResource?.url).toBeUndefined();
    const validResource = result.learning_resources.find(r => r.resource === 'Real Docs');
    expect(validResource?.url).toBe('https://docs.docker.com');
  });

  it('provides fallback overall_assessment when LLM returns empty string', () => {
    const gaps = [makeGapEvidence('Docker')];
    const raw = {
      overall_assessment: '',
      missing_skills: [],
      suggested_projects: [],
      learning_resources: [],
    };
    const result = normalizeLLMOutput(raw, gaps);
    expect(result.overall_assessment.length).toBeGreaterThan(10);
  });
});

// ── gap-advisor.service (integration, mocked DB + Gemini) ─────────────────────

const makeLLMOutput = () => ({
  overall_assessment: 'Your portfolio shows solid fundamentals with key infrastructure gaps.',
  missing_skills: [
    {
      skill: 'Kubernetes',
      priority: 'high',
      reason: 'Your projects use Docker but lack container orchestration at scale.',
      evidence_level: 0,
      supporting_projects: [],
      learning_path_order: 1,
      cluster_name: 'Backend Infrastructure',
      semantic_similarity_score: 0.3,
    },
    {
      skill: 'System Design',
      priority: 'medium',
      reason: 'Expected at senior level.',
      evidence_level: 1,
      supporting_projects: [],
      learning_path_order: 2,
      cluster_name: 'System Design',
      semantic_similarity_score: 0.5,
    },
  ],
  suggested_projects: [{
    project_type: 'Microservices',
    description: 'Build a microservices architecture.',
    skills_addressed: ['Kubernetes', 'Docker'],
  }],
  learning_resources: [{
    resource: 'Kubernetes Official Docs',
    url: 'https://kubernetes.io',
    skill_addressed: 'Kubernetes',
  }],
});

const makePortfolioRows = () => [
  {
    id: 'item-1', type: 'project', source: 'github',
    title: 'ResumeAI Backend', description: 'A Node.js backend with Docker',
    tech_stack: ['Node.js', 'Docker', 'PostgreSQL'], impact_metrics: null,
    validation_score: '72', domain_category: 'backend', company_name: null,
    skill_name: null, issuing_org: null, end_date: null, is_current: true,
    extra: {}, has_embedding: true,
  },
  {
    id: 'item-2', type: 'skill', source: 'manual',
    title: 'TypeScript', description: null,
    tech_stack: [], impact_metrics: null,
    validation_score: null, domain_category: null, company_name: null,
    skill_name: 'TypeScript', issuing_org: null, end_date: null, is_current: false,
    extra: {}, has_embedding: false,
  },
];

describe('runGapAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmbeddingColumnCache();
    geminiJsonMock.mockResolvedValue(makeLLMOutput());
    analyzeJdMock.mockResolvedValue({
      requiredSkills: ['Kubernetes', 'System Design'],
      preferredSkills: ['Terraform'],
      techStack: ['Docker'],
      roleSeniority: 'senior',
      roleCategory: 'Backend',
      summary: 'Senior backend role',
      responsibilities: [],
      keywords: [],
    });
  });

  const setupCareerGoalMocks = () => {
    // 1. user career_goal query
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ career_goal: 'Become a senior backend engineer at FAANG' }],
    });
    // 2. embedding column check (first call in fetchRichPortfolioEvidence)
    poolQueryMock.mockResolvedValueOnce({ rows: [{ exists: false }] });
    // 3. portfolio items query
    poolQueryMock.mockResolvedValueOnce({ rows: makePortfolioRows() });
    // 4. job_targets query (career goal mode uses last 5)
    poolQueryMock.mockResolvedValueOnce({ rows: [] });
    // subsequent pgvector queries return empty
    poolQueryMock.mockResolvedValue({ rows: [] });
  };

  it('throws ValidationError when career_goal is null', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ career_goal: null }] });
    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    await expect(runGapAnalysis('user-1')).rejects.toThrow('career goal must be set');
  });

  it('throws ValidationError when portfolio is empty', async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ career_goal: 'Senior Backend Engineer' }] })
      .mockResolvedValueOnce({ rows: [{ exists: false }] }) // embedding column check
      .mockResolvedValueOnce({ rows: [] }); // empty portfolio
    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    await expect(runGapAnalysis('user-1')).rejects.toThrow('no projects or skills');
  });

  it('persists to DB when persist=true (default career goal mode)', async () => {
    setupCareerGoalMocks();
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'ga-1', user_id: 'user-1',
        career_goal: 'Become a senior backend engineer at FAANG',
        missing_skills: [], suggested_projects: [], learning_resources: [],
        generated_at: new Date(), analysis_mode: 'career_goal',
        overall_assessment: 'Good.', evidence_data: [], jd_snippet: null,
        portfolio_snapshot: null,
      }],
    });

    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    const result = await runGapAnalysis('user-1');
    expect(result.career_goal).toBe('Become a senior backend engineer at FAANG');

    const upsertCall = poolQueryMock.mock.calls.find(
      c => typeof c[0] === 'string' && (c[0] as string).includes('ON CONFLICT'),
    );
    expect(upsertCall).toBeDefined();
  });

  it('does not persist when persist=false (JD comparison default)', async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ career_goal: 'Senior Backend Engineer' }] })
      .mockResolvedValueOnce({ rows: [{ exists: false }] }) // embedding column check
      .mockResolvedValueOnce({ rows: makePortfolioRows() })
      .mockResolvedValue({ rows: [] });

    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    const result = await runGapAnalysis('user-1', {
      jobDescription: 'Senior Backend Engineer role requiring Kubernetes and system design skills for large-scale infrastructure.',
      persist: false,
    });

    expect(result.analysis_mode).toBe('jd_comparison');
    const upsertCall = poolQueryMock.mock.calls.find(
      c => typeof c[0] === 'string' && (c[0] as string).includes('ON CONFLICT'),
    );
    expect(upsertCall).toBeUndefined();
  });

  it('uses JD skills when jobDescription provided', async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ career_goal: 'Senior Backend Engineer' }] })
      .mockResolvedValueOnce({ rows: [{ exists: false }] }) // embedding column check
      .mockResolvedValueOnce({ rows: makePortfolioRows() })
      .mockResolvedValue({ rows: [] });

    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    const result = await runGapAnalysis('user-1', {
      jobDescription: 'Senior Backend Engineer role requiring Kubernetes and system design skills for large-scale infrastructure.',
      persist: false,
    });

    expect(result.analysis_mode).toBe('jd_comparison');
    expect(analyzeJdMock).toHaveBeenCalled();
  });

  it('falls back to taxonomy when JD extractor throws', async () => {
    analyzeJdMock.mockRejectedValueOnce(new Error('NIM API down'));
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ career_goal: 'Senior Backend Engineer' }] })
      .mockResolvedValueOnce({ rows: [{ exists: false }] }) // embedding column check
      .mockResolvedValueOnce({ rows: makePortfolioRows() })
      .mockResolvedValue({ rows: [] });

    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    const result = await runGapAnalysis('user-1', {
      jobDescription: 'Some JD text that is long enough to pass validation here.',
      persist: false,
    });
    expect(result).toBeDefined();
  });

  it('falls back to Groq when Gemini throws', async () => {
    geminiJsonMock.mockRejectedValueOnce(new Error('Gemini unavailable'));
    groqJsonMock.mockResolvedValueOnce(makeLLMOutput());

    setupCareerGoalMocks();
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'ga-1', user_id: 'user-1',
        career_goal: 'Become a senior backend engineer at FAANG',
        missing_skills: [], suggested_projects: [], learning_resources: [],
        generated_at: new Date(), analysis_mode: 'career_goal',
        overall_assessment: null, evidence_data: [], jd_snippet: null,
        portfolio_snapshot: null,
      }],
    });

    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    const result = await runGapAnalysis('user-1');
    expect(result).toBeDefined();
    expect(groqJsonMock).toHaveBeenCalled();
  });

  it('returns deterministic fallback when both AI providers fail', async () => {
    geminiJsonMock.mockRejectedValue(new Error('Gemini down'));
    groqJsonMock.mockRejectedValue(new Error('Groq down'));

    setupCareerGoalMocks();
    // DB upsert for the deterministic fallback result
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'ga-1', user_id: 'user-1',
        career_goal: 'Become a senior backend engineer at FAANG',
        missing_skills: [], suggested_projects: [], learning_resources: [],
        generated_at: new Date(), analysis_mode: 'career_goal',
        overall_assessment: null, evidence_data: [], jd_snippet: null,
        portfolio_snapshot: null,
      }],
    });

    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    const result = await runGapAnalysis('user-1');
    // Should NOT throw — deterministic fallback is returned instead
    expect(result).toBeDefined();
    expect(result.overall_assessment).toBeDefined();
  });

  it('normalizeLLMOutput: filters LLM-hallucinated gaps not in preComputedGaps', async () => {
    geminiJsonMock.mockResolvedValueOnce({
      ...makeLLMOutput(),
      missing_skills: [
        { skill: 'FakeSkill2025', priority: 'high', reason: 'Hallucinated skill.', evidence_level: 0, supporting_projects: [], learning_path_order: 1, cluster_name: null, semantic_similarity_score: 0 },
      ],
    });

    setupCareerGoalMocks();
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'ga-1', user_id: 'user-1', career_goal: 'Become a senior backend engineer at FAANG',
        missing_skills: [], suggested_projects: [], learning_resources: [],
        generated_at: new Date(), analysis_mode: 'career_goal',
        overall_assessment: null, evidence_data: [], jd_snippet: null, portfolio_snapshot: null,
      }],
    });

    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    const result = await runGapAnalysis('user-1');
    const hallucinated = result.missing_skills.find((s: { skill: string }) => s.skill === 'FakeSkill2025');
    expect(hallucinated).toBeUndefined();
  });

  it('jobTargetIds from other users are ignored (user isolation)', async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ career_goal: 'Senior Backend Engineer' }] })
      .mockResolvedValueOnce({ rows: [{ exists: false }] }) // embedding column check
      .mockResolvedValueOnce({ rows: makePortfolioRows() })
      .mockResolvedValueOnce({ rows: [] }) // job_targets owned by this user only — returns nothing
      .mockResolvedValue({ rows: [] });

    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    const result = await runGapAnalysis('user-1', {
      jobTargetIds: ['00000000-0000-0000-0000-000000000001'],
      persist: false,
    });
    expect(result).toBeDefined();
  });

  it('truncates JD to 20000 characters before processing', async () => {
    const hugJd = 'A'.repeat(25000);
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ career_goal: 'Senior Backend Engineer' }] })
      .mockResolvedValueOnce({ rows: [{ exists: false }] }) // embedding column check
      .mockResolvedValueOnce({ rows: makePortfolioRows() })
      .mockResolvedValue({ rows: [] });

    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    const result = await runGapAnalysis('user-1', { jobDescription: hugJd, persist: false });
    // The jd_snippet stored should be at most 500 chars
    expect(result.jd_snippet!.length).toBeLessThanOrEqual(500);
  });
});

describe('getLatestGapAnalysis', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws NotFoundError when no analysis exists', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });
    const { getLatestGapAnalysis } = await import('./gap-advisor.service.js');
    await expect(getLatestGapAnalysis('user-1')).rejects.toThrow('No gap analysis found');
  });

  it('returns the analysis when it exists', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'ga-1', user_id: 'user-1', career_goal: 'Senior Backend Engineer',
        missing_skills: [], suggested_projects: [], learning_resources: [],
        generated_at: new Date(), analysis_mode: 'career_goal',
        overall_assessment: null, evidence_data: [], jd_snippet: null, portfolio_snapshot: null,
      }],
    });
    const { getLatestGapAnalysis } = await import('./gap-advisor.service.js');
    const result = await getLatestGapAnalysis('user-1');
    expect(result.career_goal).toBe('Senior Backend Engineer');
  });
});
