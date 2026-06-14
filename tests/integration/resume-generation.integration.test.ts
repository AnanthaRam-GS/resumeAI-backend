import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { pool } from '../../src/db/client.js';

// Mock external services
vi.mock('../../src/modules/ai/jd-analyzer.service.js', () => ({
  analyzeJobDescription: async (jd: string) => ({
    requiredSkills: ['javascript'],
    preferredSkills: ['nodejs'],
    techStack: ['typescript'],
    roleSeniority: 'mid',
    roleCategory: 'Engineering',
    summary: 'Test role',
    responsibilities: [],
    keywords: [],
  }),
}));

vi.mock('../../src/modules/ai/portfolio-scorer.service.js', () => ({
  scorePortfolioItems: (items: any[]) => items.map((item, idx) => ({ item, score: 50 - idx })),
}));

vi.mock('../../src/modules/ai/item-selector.service.js', () => ({
  selectPortfolioItems: (scored: any[]) => scored.slice(0, 3).map((s, i) => ({ ...s, selectionRank: i + 1 })),
}));

vi.mock('../../src/services/gemini.service.js', () => ({
  requestGeminiJson: async () => ({ sections: [{ heading: 'Summary', bullets: ['Built cool stuff'] }] }),
}));

vi.mock('../../src/services/pdf-renderer.service.js', () => ({
  renderHtmlToPdfBuffer: async () => Buffer.from('PDF'),
}));

vi.mock('../../src/services/storage.service.js', () => ({
  uploadFile: async (key: string) => key,
}));

vi.mock('../../src/services/ats-scorer.service.js', async () => ({
  scoreAtsMatch: ({ jobDescription, resumeText }: any) => ({ score: 80, foundKeywords: [], missingKeywords: [], suggestions: [], matchedKeywords: [] }),
}));

describe('resume orchestrator integration (mocked)', () => {
  let originalQuery: any;

  beforeEach(() => {
    originalQuery = pool.query;

    // Simple mock for pool.query that returns objects for inserts/updates
    pool.query = vi.fn(async (text: string) => {
      if (text.includes('INSERT INTO job_targets')) {
        return { rows: [{ id: 'job-target-id' }] };
      }

      if (text.includes('INSERT INTO resume_generation_jobs')) {
        return { rows: [{ id: 'generation-job-id' }] };
      }

      if (text.includes('INSERT INTO resume_versions')) {
        return { rows: [{ id: 'resume-version-id', pdf_s3_key: 'resumes/test.pdf' }] };
      }

      return { rows: [] };
    });
  });

  afterEach(() => {
    pool.query = originalQuery;
    vi.restoreAllMocks();
  });

  it('runs end-to-end and returns resume version metadata', async () => {
    const { generateResumeForJob } = await import('../../src/modules/resume/orchestrator.service.js');

    const result = await generateResumeForJob('user-1', {
      jobTitle: 'Backend Engineer',
      companyName: 'Acme',
      jobDescription: 'Build backend services using Node and TypeScript',
      templateId: 'modern',
      pageLength: '1-page',
    });

    expect(result).toBeDefined();
    expect(result.resumeVersion).toBeDefined();
    expect(result.resumeVersion.id).toBe('resume-version-id');
  });
});
