import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scoreAtsMatch } from '../../services/ats-scorer.service.js';
import type { ExtractedEntities } from '../../types/ai.types.js';

// Inline fixtures (avoids importing outside tsconfig rootDir)
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

// ── Top-level mocks (Vitest hoists vi.mock to the top before variable init) ─

const poolQueryMock = vi.fn();
vi.mock('../../db/client.js', () => ({ pool: { query: poolQueryMock } }));

const geminiJsonMock = vi.fn();
vi.mock('../../services/gemini.service.js', () => ({
  requestGeminiJson: geminiJsonMock,
}));

// ── ATS scorer deterministic tests ────────────────────────────────────────

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

    expect(result.foundKeywords).toEqual(
      expect.arrayContaining(['TypeScript', 'Node.js']),
    );
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

// ── ATS service (DB layer) ─────────────────────────────────────────────────

describe('ats.service (mocked DB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

// ── Gap advisor service (mocked DB + Gemini) ──────────────────────────────

describe('gap-advisor.service (mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    geminiJsonMock.mockResolvedValue({
      missing_skills: [
        { skill: 'Kubernetes', priority: 'high', reason: 'Required for infrastructure work' },
        { skill: 'System Design', priority: 'medium', reason: 'Expected at senior level' },
      ],
      suggested_projects: [
        {
          project_type: 'Microservices',
          description: 'Build a microservices architecture',
          skills_addressed: ['Kubernetes', 'Docker'],
        },
      ],
      learning_resources: [
        { resource: 'Kubernetes Official Docs', url: 'https://kubernetes.io', skill_addressed: 'Kubernetes' },
      ],
    });
  });

  it('runs gap analysis and returns structured result', async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ career_goal: 'Become a senior backend engineer at FAANG' }] })
      .mockResolvedValueOnce({
        rows: [{
          type: 'skill',
          title: 'TypeScript',
          tech_stack: null,
          skill_name: 'TypeScript',
          domain_category: null,
          company_name: null,
          issuing_org: null,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'ga-1',
          user_id: 'user-1',
          career_goal: 'Become a senior backend engineer at FAANG',
          missing_skills: [{ skill: 'Kubernetes', priority: 'high', reason: '...' }],
          suggested_projects: [],
          learning_resources: [],
          generated_at: new Date(),
        }],
      });

    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    const result = await runGapAnalysis('user-1');

    expect(result.career_goal).toBe('Become a senior backend engineer at FAANG');
    expect(Array.isArray(result.missing_skills)).toBe(true);
  });

  it('throws ValidationError when career goal is not set', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ career_goal: null }] });

    const { runGapAnalysis } = await import('./gap-advisor.service.js');
    await expect(runGapAnalysis('user-1')).rejects.toThrow('Career goal must be set');
  });

  it('throws NotFoundError when no analysis exists', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const { getLatestGapAnalysis } = await import('./gap-advisor.service.js');
    await expect(getLatestGapAnalysis('user-1')).rejects.toThrow('No gap analysis found');
  });
});
