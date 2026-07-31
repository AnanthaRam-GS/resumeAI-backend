import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateVersionLabel } from '../../utils/version-label.js';
import type { PortfolioItemRecord } from '../../types/ai.types.js';

// ── All top-level mocks ───────────────────────────────────────────────────

const poolQueryMock = vi.fn();
vi.mock('../../db/client.js', () => ({ pool: { query: poolQueryMock } }));

vi.mock('../ai/jd-analyzer.service.js', () => ({
  analyzeJobDescription: vi.fn(async () => ({
    requiredSkills: ['TypeScript'],
    preferredSkills: ['Docker'],
    techStack: ['TypeScript'],
    roleSeniority: 'mid',
    roleCategory: 'Engineering',
    summary: '',
    responsibilities: [],
    keywords: [],
  })),
}));

vi.mock('../portfolio/portfolio.service.js', () => ({
  listPortfolioItems: vi.fn(async () => []),
}));

vi.mock('../ai/portfolio-scorer.service.js', () => ({
  scorePortfolioItems: vi.fn(() => []),
}));

vi.mock('../ai/item-selector.service.js', () => ({
  selectPortfolioItems: vi.fn(() => []),
}));

vi.mock('../../services/groq.service.js', () => ({
  requestGroqJson: vi.fn(async () => ({
    summary: 'Strong backend engineer.',
    experience: [],
    projects: [],
    skills: {},
    education: [],
    certifications: [],
  })),
}));

vi.mock('../../services/pdf-renderer.service.js', () => ({
  renderHtmlToPdfBuffer: vi.fn(async () => Buffer.from('PDF')),
}));

vi.mock('../../services/storage.service.js', () => ({
  uploadFile: vi.fn(async (key: string) => key),
  getSignedUrl: vi.fn(async (key: string) => `https://s3.example.com/${key}`),
  deleteFile: vi.fn(async () => true),
}));

vi.mock('../../services/ats-scorer.service.js', () => ({
  scoreAtsMatch: vi.fn(() => ({
    score: 75,
    foundKeywords: ['TypeScript'],
    missingKeywords: ['Docker'],
    suggestions: [],
    matchedKeywords: ['TypeScript'],
  })),
}));

// ── version-label unit tests ───────────────────────────────────────────────

describe('generateVersionLabel', () => {
  it('abbreviates a job title and sanitizes company name', () => {
    expect(generateVersionLabel('Senior Backend Engineer', 'Google', 1)).toBe('SBE-Google-v1');
  });

  it('increments version number', () => {
    expect(generateVersionLabel('Senior Backend Engineer', 'Google', 3)).toBe('SBE-Google-v3');
  });

  it('removes spaces from company name', () => {
    expect(generateVersionLabel('Frontend Developer', 'Open AI', 1)).toBe('FD-OpenAI-v1');
  });

  it('handles stop words in job title', () => {
    expect(generateVersionLabel('Head of Engineering', 'Stripe', 2)).toBe('HE-Stripe-v2');
  });

  it('truncates company name at 10 characters', () => {
    const label = generateVersionLabel('Engineer', 'VeryLongCompanyNameThatExceedsLimit', 1);
    expect(label).toMatch(/^E-VeryLongCo-v1$/);
  });

  it('uses fallback JOB when title is all stop words', () => {
    const label = generateVersionLabel('a the and', 'Co', 1);
    expect(label).toBe('JOB-Co-v1');
  });
});

// ── resume schema tests ────────────────────────────────────────────────────

describe('resume.schema', () => {
  it('validates a correct generate input', async () => {
    const { generateResumeSchema } = await import('./resume.schema.js');
    const input = {
      jobTitle: 'Backend Engineer',
      companyName: 'Acme',
      jobDescription: 'Build scalable backend services using Node.js and TypeScript with PostgreSQL.',
    };
    expect(() => generateResumeSchema.parse(input)).not.toThrow();
  });

  it('rejects short job descriptions', async () => {
    const { generateResumeSchema } = await import('./resume.schema.js');
    expect(() =>
      generateResumeSchema.parse({
        jobTitle: 'Engineer',
        companyName: 'Acme',
        jobDescription: 'Too short',
      }),
    ).toThrow();
  });

  it('accepts valid templateId values', async () => {
    const { generateResumeSchema } = await import('./resume.schema.js');
    const parsed = generateResumeSchema.parse({
      jobTitle: 'Backend Engineer',
      companyName: 'Acme',
      jobDescription: 'Build scalable backend services using Node.js and TypeScript with PostgreSQL.',
      templateId: 'technical-modern',
    });
    expect(parsed.templateId).toBe('technical-modern');
  });

  it('accepts project count and manual selected project ids', async () => {
    const { generateResumeSchema } = await import('./resume.schema.js');
    const parsed = generateResumeSchema.parse({
      jobTitle: 'Backend Engineer',
      companyName: 'Acme',
      jobDescription: 'Build scalable backend services using Node.js and TypeScript with PostgreSQL.',
      projectCount: 3,
      selectedProjectIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });

    expect(parsed.projectCount).toBe(3);
    expect(parsed.selectedProjectIds).toHaveLength(1);
  });

  it('rejects invalid project count', async () => {
    const { generateResumeSchema } = await import('./resume.schema.js');
    expect(() =>
      generateResumeSchema.parse({
        jobTitle: 'Engineer',
        companyName: 'Acme',
        jobDescription: 'Build scalable backend services using Node.js and TypeScript with PostgreSQL.',
        projectCount: 0,
      }),
    ).toThrow();
  });

  it('accepts unknown templateId values for renderer fallback', async () => {
    const { generateResumeSchema } = await import('./resume.schema.js');
    const parsed = generateResumeSchema.parse({
      jobTitle: 'Engineer',
      companyName: 'Acme',
      jobDescription: 'Build scalable backend services using Node.js and TypeScript with PostgreSQL.',
      templateId: 'invalid-template',
    });
    expect(parsed.templateId).toBe('invalid-template');
  });
});

describe('resume template registry', () => {
  const completeContent = {
    summary: 'Backend engineer focused on TypeScript APIs and measurable product impact.',
    skills: {
      Programming: ['TypeScript', 'Python'],
      Backend: ['Node.js', 'PostgreSQL'],
    },
    experience: [
      {
        role: 'Software Engineer',
        company: 'Acme',
        period: '2024 - Present',
        bullets: ['Built APIs for 20k monthly users.', 'Built APIs for 20k monthly users.'],
      },
    ],
    projects: [
      {
        name: 'Resume Builder',
        description: 'AI resume generation workflow.',
        tech_stack: ['React', 'Fastify'],
        bullets: ['Rendered ATS-safe PDFs with selectable text.'],
      },
    ],
    researchPapers: [
      {
        title: 'Efficient Edge-Cloud Sepsis Prediction',
        authors: ['Ada Lovelace', 'Grace Hopper'],
        venue: 'IEEE Health AI Conference',
        year: '2025',
        doi: '10.1109/example.2025.1',
        arxivUrl: 'https://arxiv.org/abs/2501.12345',
        publicationUrl: 'https://ieeexplore.ieee.org/document/1',
        githubUrl: 'https://github.com/example/paper-code',
        description: 'Preserved abstract text.',
        keywords: ['LSTM', 'GRU'],
        status: 'published',
      },
    ],
    education: [{ degree: 'B.Tech Computer Science', institution: 'State University', period: '2020 - 2024' }],
    certifications: [{ name: 'AWS Cloud Practitioner', issuer: 'AWS', date: '2024' }],
    achievements: ['Won campus hackathon.'],
  };

  it('contains unique template IDs and the three additional templates', async () => {
    const { resumeTemplates } = await import('./templates/index.js');
    const ids = resumeTemplates.map((template) => template.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'primary',
        'classic-professional',
        'technical-modern',
        'executive-minimal',
      ]),
    );
  });

  it('falls back to primary for unknown template IDs', async () => {
    const { normalizeResumeTemplateId } = await import('./templates/index.js');

    expect(normalizeResumeTemplateId('unknown')).toBe('primary');
    expect(normalizeResumeTemplateId('academic')).toBe('primary');
  });

  it('renders each template with complete resume data', async () => {
    const { renderResumeHtml, resumeTemplates } = await import('./templates/index.js');

    for (const template of resumeTemplates) {
      const html = renderResumeHtml({
        templateId: template.id,
        content: completeContent,
        user: {
          full_name: 'Ada Lovelace',
          email: 'ada@example.com',
          phone_number: '+1 555 0100',
          location: 'New York, NY',
          github_url: 'https://github.com/ada',
          linkedin_url: 'https://linkedin.com/in/ada',
          portfolio_url: 'https://ada.dev',
        },
        jobTitle: 'Backend Engineer',
        companyName: 'Acme',
      });

      expect(html).toContain(`template-${template.id}`);
      expect(html).toContain('Ada Lovelace');
      expect(html).toContain('TypeScript');
      expect(html).toContain('Resume Builder');
      expect(html).toContain('Research Papers');
      expect(html).toContain('Efficient Edge-Cloud Sepsis Prediction');
      expect(html).toContain('IEEE Health AI Conference');
      expect(html).toContain('10.1109/example.2025.1');
      expect(html).not.toContain('<table');
    }
  });

  it('renders minimal data without empty separators or optional sections', async () => {
    const { renderResumeHtml } = await import('./templates/index.js');
    const html = renderResumeHtml({
      templateId: 'classic-professional',
      content: { summary: 'Early-career engineer.', skills: {} },
      user: { full_name: 'Ada Lovelace', email: 'ada@example.com' },
    });

    expect(html).toContain('Early-career engineer.');
    expect(html).not.toContain('Experience</h2>');
    expect(html).not.toContain('contact-separator');
    expect(html).not.toContain('<script');
  });

  it('escapes HTML content', async () => {
    const { renderResumeHtml } = await import('./templates/index.js');
    const html = renderResumeHtml({
      templateId: 'technical-modern',
      content: {
        summary: '<script>alert("x")</script>',
        projects: [{ name: '<b>Project</b>', bullets: ['Used <img src=x> safely.'] }],
      },
      user: { full_name: '<Ada>' },
    });

    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;Ada&gt;');
    expect(html).not.toContain('<script>alert');
  });
});

// ── updateResumeStatusSchema ──────────────────────────────────────────────

describe('updateResumeStatusSchema', () => {
  it('accepts all valid status values', async () => {
    const { updateResumeStatusSchema } = await import('./resume.schema.js');
    for (const status of ['draft', 'submitted', 'archived']) {
      expect(() => updateResumeStatusSchema.parse({ status })).not.toThrow();
    }
  });

  it('rejects invalid status', async () => {
    const { updateResumeStatusSchema } = await import('./resume.schema.js');
    expect(() => updateResumeStatusSchema.parse({ status: 'pending' })).toThrow();
  });
});

// ── portfolio scoring + selection ─────────────────────────────────────────

describe('portfolio scoring and selection', () => {
  const entities = {
    requiredSkills: ['TypeScript', 'Fastify', 'PostgreSQL'],
    preferredSkills: ['Docker', 'Testing'],
    techStack: ['TypeScript', 'Node.js'],
    roleSeniority: 'mid' as const,
    roleCategory: 'Backend Engineering',
    summary: '',
    responsibilities: [],
    keywords: [],
  };

  const items: PortfolioItemRecord[] = [
    {
      id: '1',
      type: 'project',
      title: 'API Service',
      description: 'TypeScript and Fastify REST API with PostgreSQL',
      tech_stack: ['TypeScript', 'Fastify', 'PostgreSQL'],
      impact_metrics: 'Served 10k requests/day',
      is_current: true,
    },
    {
      id: '2',
      type: 'experience',
      title: 'Frontend Intern',
      description: 'React UI work',
      tech_stack: ['React'],
      end_date: '2020-01-01',
    },
    {
      id: '3',
      type: 'skill',
      title: 'TypeScript',
      skill_name: 'TypeScript',
    },
  ];

  it('ranks TypeScript+Fastify project above unrelated experience', async () => {
    const { scorePortfolioItems: realScorer } = await import('../ai/portfolio-scorer.service.js');
    // Unmock for this test (restore to actual implementation)
    vi.restoreAllMocks();
    const { scorePortfolioItems } = await import('../ai/portfolio-scorer.service.js');
    const scored = scorePortfolioItems(items, entities, 'Backend Engineer role');
    expect(scored[0]?.item.id).toBe('1');
    expect(scored[0]!.score).toBeGreaterThan(scored[1]!.score);
    void realScorer;
  });

  it('selects items up to per-type caps', async () => {
    const { selectPortfolioItems } = await import('../ai/item-selector.service.js');
    const { scorePortfolioItems } = await import('../ai/portfolio-scorer.service.js');
    const scored = scorePortfolioItems(items, entities);
    const selected = selectPortfolioItems(scored, { project: 1, experience: 1, skill: 1 });
    expect(selected.length).toBeLessThanOrEqual(3);
    expect(selected.every((s) => s.selectionRank > 0)).toBe(true);
  });
});

// ── orchestrator integration (mocked DB + services) ──────────────────────

describe('orchestrator (mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO job_targets')) {
        return { rows: [{ id: 'jt-1', job_title: 'Backend Engineer', company_name: 'Acme' }] };
      }
      if (sql.includes('INSERT INTO resume_generation_jobs')) {
        return { rows: [{ id: 'job-1' }] };
      }
      if (sql.includes('UPDATE resume_generation_jobs') || sql.includes('UPDATE job_targets')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT COUNT')) {
        return { rows: [{ count: '0' }] };
      }
      if (sql.includes('INSERT INTO resume_versions')) {
        return {
          rows: [{
            id: 'rv-1',
            version_label: 'BE-Acme-v1',
            pdf_s3_key: 'users/u1/resumes/job-1.pdf',
            ats_score: '75',
          }],
        };
      }
      return { rows: [] };
    });
  });

  it('returns generationJobId, jobTarget, and resumeVersion', async () => {
    const { generateResumeForJob } = await import('./orchestrator.service.js');
    const result = await generateResumeForJob('user-1', {
      jobTitle: 'Backend Engineer',
      companyName: 'Acme',
      jobDescription: 'Build services with TypeScript and Node.js',
      templateId: 'technical-modern',
      pageLength: '1-page',
    });

    expect(result.generationJobId).toBe('job-1');
    expect(result.resumeVersion.id).toBe('rv-1');
    expect(result.resumeVersion.version_label).toBe('BE-Acme-v1');
  });
});
