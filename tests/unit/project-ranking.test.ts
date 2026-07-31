import { describe, expect, it, vi } from 'vitest';
import type { ExtractedEntities } from '../../src/types/ai.types.js';

vi.mock('../../src/services/semantic-search.service.js', () => ({
  scorePortfolioBySemanticSimilarity: vi.fn(async () => [
    { id: 'project-1', semanticScore: 0.92 },
    { id: 'project-2', semanticScore: 0.2 },
  ]),
}));

const entities: ExtractedEntities = {
  requiredSkills: ['React', 'TypeScript', 'Node.js'],
  preferredSkills: ['PostgreSQL', 'Testing'],
  techStack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
  roleSeniority: 'mid',
  roleCategory: 'Full Stack Engineering',
  summary: 'Build full-stack web applications.',
  responsibilities: ['Build APIs', 'Develop React interfaces'],
  keywords: ['API', 'Database', 'Testing'],
};

describe('project ranking service', () => {
  it('ranks relevant projects ahead of weak projects and selects top N', async () => {
    const { rankProjects } = await import('../../src/modules/analytics/project-ranking.service.js');
    const ranking = await rankProjects(
      'user-1',
      [
        {
          id: 'project-2',
          title: 'Calculator',
          description: 'Small HTML calculator',
          techStack: ['HTML'],
          impactMetrics: null,
          validationScore: 40,
          domainCategory: null,
          isCurrent: false,
        },
        {
          id: 'project-1',
          title: 'AI Resume Builder',
          description: 'React and TypeScript full-stack app with Node.js APIs and PostgreSQL.',
          techStack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
          impactMetrics: 'Generated 500 resumes',
          validationScore: 92,
          domainCategory: 'Full Stack Engineering',
          isCurrent: true,
        },
      ],
      entities,
      'Full-stack React TypeScript Node.js PostgreSQL role.',
      1,
    );

    expect(ranking.selectedProjectIds).toEqual(['project-1']);
    expect(ranking.rankedProjects[0]?.title).toBe('AI Resume Builder');
    expect(ranking.rankedProjects[0]?.relevanceScore).toBeGreaterThan(ranking.rankedProjects[1]!.relevanceScore);
    expect(ranking.excludedProjects[0]?.projectId).toBe('project-2');
  });

  it('caps requested count to available projects with a notice', async () => {
    const { rankProjects } = await import('../../src/modules/analytics/project-ranking.service.js');
    const ranking = await rankProjects(
      'user-1',
      [{
        id: 'project-1',
        title: 'API',
        description: 'Node.js API',
        techStack: ['Node.js'],
        impactMetrics: null,
        validationScore: null,
        domainCategory: null,
      }],
      entities,
      'Node.js API role.',
      4,
    );

    expect(ranking.selectedProjectIds).toEqual(['project-1']);
    expect(ranking.notice).toContain('Only 1 project');
  });

  it('rejects invalid project counts', async () => {
    const { normalizeProjectCount } = await import('../../src/modules/analytics/project-ranking.service.js');
    expect(() => normalizeProjectCount(0, 3)).toThrow('at least 1');
    expect(() => normalizeProjectCount(1.5, 3)).toThrow('whole number');
  });
});
