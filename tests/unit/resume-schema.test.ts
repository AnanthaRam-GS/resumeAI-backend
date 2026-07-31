import { describe, expect, it } from 'vitest';

describe('resume generate schema', () => {
  it('accepts project count and manual selected project ids', async () => {
    const { generateResumeSchema } = await import('../../src/modules/resume/resume.schema.js');
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
    const { generateResumeSchema } = await import('../../src/modules/resume/resume.schema.js');
    expect(() =>
      generateResumeSchema.parse({
        jobTitle: 'Engineer',
        companyName: 'Acme',
        jobDescription: 'Build scalable backend services using Node.js and TypeScript with PostgreSQL.',
        projectCount: 0,
      }),
    ).toThrow();
  });
});
