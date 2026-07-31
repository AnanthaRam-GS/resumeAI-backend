import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedEntities, PortfolioItemRecord } from '../../src/types/ai.types.js';

const groqCreateMock = vi.fn();
const geminiGenerateContentMock = vi.fn();
const nimRequestJsonMock = vi.fn();
const browserCloseMock = vi.fn();
const newPageMock = vi.fn();
const setContentMock = vi.fn();
const pdfMock = vi.fn();

vi.mock('groq-sdk', () => {
  class MockGroq {
    chat = {
      completions: {
        create: groqCreateMock,
      },
    };
  }

  return {
    default: MockGroq,
  };
});

vi.mock('@google/generative-ai', () => {
  class MockGenerativeAI {
    getGenerativeModel() {
      return {
        generateContent: geminiGenerateContentMock,
      };
    }
  }

  return {
    GoogleGenerativeAI: MockGenerativeAI,
  };
});

vi.mock('../../src/services/nvidia-nim.service.js', () => ({
  requestNimJson: nimRequestJsonMock,
}));

vi.mock('puppeteer', () => {
  return {
    default: {
      launch: vi.fn(async () => ({
        newPage: newPageMock,
        close: browserCloseMock,
      })),
    },
  };
});

const loadGroqService = async () => import('../../src/services/groq.service.js');
const loadGeminiService = async () => import('../../src/services/gemini.service.js');
const loadPdfService = async () => import('../../src/services/pdf-renderer.service.js');
const loadAtsService = async () => import('../../src/services/ats-scorer.service.js');
const loadJdAnalyzer = async () => import('../../src/modules/ai/jd-analyzer.service.js');
const loadScorer = async () => import('../../src/modules/ai/portfolio-scorer.service.js');
const loadSelector = async () => import('../../src/modules/ai/item-selector.service.js');

const jd = `
We are hiring a Senior Backend Engineer with TypeScript, Node.js, Fastify, PostgreSQL, and AWS.
Experience with REST APIs, testing, Docker, and system design is preferred.
`;

const resumeText = `
Built TypeScript and Node.js services with Fastify and PostgreSQL.
Used AWS S3, Docker, and Vitest to ship REST APIs with strong testing coverage.
`;

const extractedEntities: ExtractedEntities = {
  requiredSkills: ['TypeScript', 'Node.js', 'Fastify', 'PostgreSQL', 'AWS'],
  preferredSkills: ['REST APIs', 'testing', 'Docker', 'system design'],
  techStack: ['TypeScript', 'Node.js', 'Fastify', 'PostgreSQL', 'AWS'],
  roleSeniority: 'senior',
  roleCategory: 'Backend Engineering',
  summary: 'Backend engineer role',
  responsibilities: ['build services'],
  keywords: ['backend', 'engineer'],
};

const items: PortfolioItemRecord[] = [
  {
    id: 'project-1',
    type: 'project',
    title: 'Scalable Resume Generator',
    description: 'TypeScript and Fastify service with PostgreSQL and AWS S3 integration',
    tech_stack: ['TypeScript', 'Fastify', 'PostgreSQL', 'AWS S3'],
    impact_metrics: 'Reduced generation time by 40%',
    is_current: true,
  },
  {
    id: 'experience-1',
    type: 'experience',
    title: 'Frontend Intern',
    description: 'React dashboard work',
    tech_stack: ['React', 'CSS'],
    impact_metrics: 'Improved UI performance by 15%',
    end_date: '2025-01-01',
  },
  {
    id: 'skill-1',
    type: 'skill',
    title: 'TypeScript',
    skill_name: 'TypeScript',
  },
];

describe('AI services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserCloseMock.mockReset();
    newPageMock.mockReset();
    setContentMock.mockReset();
    pdfMock.mockReset();
  });

  it('parses Groq JSON responses', async () => {
    groqCreateMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ hello: 'world' }) } }],
    });
    const { requestGroqJson } = await loadGroqService();

    await expect(
      requestGroqJson<{ hello: string }>({ userPrompt: 'return json' }),
    ).resolves.toEqual({
      hello: 'world',
    });
  });

  it('parses Gemini JSON responses', async () => {
    geminiGenerateContentMock.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ hello: 'gemini' }) },
    });
    const { requestGeminiJson } = await loadGeminiService();

    await expect(
      requestGeminiJson<{ hello: string }>({ userPrompt: 'return json' }),
    ).resolves.toEqual({
      hello: 'gemini',
    });
  });

  it('renders PDFs to a buffer', async () => {
    pdfMock.mockResolvedValueOnce(Buffer.from('pdf-buffer'));
    newPageMock.mockResolvedValueOnce({
      setContent: setContentMock,
      pdf: pdfMock,
    });
    const { renderHtmlToPdfBuffer } = await loadPdfService();

    await expect(renderHtmlToPdfBuffer('<html><body>hello</body></html>')).resolves.toEqual(
      Buffer.from('pdf-buffer'),
    );
    expect(setContentMock).toHaveBeenCalledTimes(1);
    expect(pdfMock).toHaveBeenCalledTimes(1);
    expect(browserCloseMock).toHaveBeenCalledTimes(1);
  });

  it('scores ATS matches deterministically', async () => {
    const { scoreAtsMatch } = await loadAtsService();
    const result = scoreAtsMatch({
      jobDescription: jd,
      resumeText,
      extractedEntities,
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.foundKeywords).toEqual(expect.arrayContaining(['TypeScript', 'Node.js']));
    expect(result.missingKeywords).toEqual(expect.arrayContaining(['system design']));
  });

  it('analyzes job descriptions with the NVIDIA NIM helper', async () => {
    nimRequestJsonMock.mockResolvedValueOnce(extractedEntities);
    const { analyzeJobDescription } = await loadJdAnalyzer();

    await expect(analyzeJobDescription(jd)).resolves.toMatchObject({
      requiredSkills: expect.arrayContaining(['TypeScript', 'Node.js']),
      roleSeniority: 'senior',
    });
    expect(nimRequestJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ userPrompt: jd, temperature: 0.1 }),
    );
  });

  it('falls back to deterministic job description extraction when providers fail', async () => {
    nimRequestJsonMock.mockRejectedValueOnce(new Error('NIM unavailable'));
    geminiGenerateContentMock.mockRejectedValueOnce(new Error('Gemini unavailable'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { analyzeJobDescription } = await loadJdAnalyzer();

    try {
      await expect(analyzeJobDescription(jd)).resolves.toMatchObject({
        requiredSkills: expect.arrayContaining(['TypeScript', 'Node.js']),
        preferredSkills: expect.arrayContaining(['REST APIs', 'Testing', 'Docker']),
        roleSeniority: 'senior',
        roleCategory: 'Backend Engineering',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Falling back to deterministic extraction'),
      );
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('ranks relevant portfolio items above unrelated items', async () => {
    const { scorePortfolioItems } = await loadScorer();
    const scored = scorePortfolioItems(items, extractedEntities, jd);

    expect(scored[0]?.item.id).toBe('project-1');
    expect(scored[0]?.score).toBeGreaterThan(scored[1]?.score ?? 0);
  });

  it('selects items under per-type caps', async () => {
    const { selectPortfolioItems } = await loadSelector();
    const selected = selectPortfolioItems([
      { item: items[0], score: 95, reasons: ['match'], matchedSkills: ['TypeScript'] },
      { item: items[1], score: 70, reasons: ['match'], matchedSkills: ['React'] },
      { item: items[2], score: 60, reasons: ['match'], matchedSkills: ['TypeScript'] },
    ]);

    expect(selected).toHaveLength(3);
    expect(selected[0]?.selectionRank).toBe(1);
    expect(selected[1]?.selectionRank).toBe(2);
  });
});
