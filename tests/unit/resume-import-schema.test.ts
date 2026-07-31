import { describe, expect, it } from 'vitest';

describe('resume import schema', () => {
  it('keeps all AI-extracted sections while normalizing common parser variants', async () => {
    const { parsedResumeDataSchema } =
      await import('../../src/modules/resume-import/resume-import.schema.js');

    const parsed = parsedResumeDataSchema.parse({
      contact_info: {
        full_name: 'Ada Lovelace',
        phone: 12345,
        summary: ['Backend engineer', 'AI systems'],
      },
      work_experience: [
        {
          role: 'Software Engineer',
          company: 'Analytical Engines Inc.',
          tech_stack: 'Node.js; PostgreSQL',
          start_date: '2024',
          end_date: 'Present',
        },
      ],
      academic_background: {
        degree: 'Bachelor of Technology',
        field_of_study: 'Computer Science',
        university: 'Example University',
        end_date: null,
      },
      technical_skills: {
        Languages: ['TypeScript', 'Python'],
        Databases: 'PostgreSQL, Redis',
      },
      projects: [
        {
          name: 'Resume Builder',
          description: ['Built a resume parser', 'Added portfolio import'],
          tech_stack: 'TypeScript, Fastify, PostgreSQL',
          url: 'https://github.com/example/resume-builder',
          start_date: '2025-03',
          end_date: 'Present',
          impact_metrics: null,
        },
        {
          project_name: 'Analytics Dashboard',
          tech_stack: ['React', null, 'D3'],
          repository_url: 'https://github.com/example/analytics',
          start_date: null,
          end_date: '2026',
        },
      ],
      publications: [
        {
          paper_title: 'Efficient Edge-Cloud Sepsis Prediction',
          authors: 'Ada Lovelace; Grace Hopper',
          venue: 'IEEE Health AI Conference',
          year: '2025',
          doi: '10.1109/example.2025.1',
          arxiv_url: 'arxiv.org/abs/2501.12345',
          publication_url: 'https://ieeexplore.ieee.org/document/1',
          github_url: 'https://github.com/example/paper-code',
        },
      ],
      certificates: [
        {
          name: 'AWS Cloud Practitioner',
          issuer: 'Amazon Web Services',
          url: 'https://example.com/cert',
        },
      ],
    });

    expect(parsed.personal).toMatchObject({
      full_name: 'Ada Lovelace',
      phone: '12345',
      summary: 'Backend engineer; AI systems',
    });
    expect(parsed.experience).toHaveLength(1);
    expect(parsed.experience?.[0]).toMatchObject({
      title: 'Software Engineer',
      company_name: 'Analytical Engines Inc.',
      tech_stack: ['Node.js', 'PostgreSQL'],
      start_date: '2024-01-01',
    });
    expect(parsed.experience?.[0]?.end_date).toBeUndefined();
    expect(parsed.education).toHaveLength(1);
    expect(parsed.education?.[0]).toMatchObject({
      title: 'Bachelor of Technology',
      degree: 'Bachelor of Technology',
      field_of_study: 'Computer Science',
      institution_name: 'Example University',
    });
    expect(parsed.skills?.map((skill) => skill.title)).toEqual([
      'TypeScript',
      'Python',
      'PostgreSQL',
      'Redis',
    ]);
    expect(parsed.projects).toHaveLength(2);
    expect(parsed.projects?.[0]).toMatchObject({
      title: 'Resume Builder',
      description: 'Built a resume parser; Added portfolio import',
      tech_stack: ['TypeScript', 'Fastify', 'PostgreSQL'],
      project_url: 'https://github.com/example/resume-builder',
      start_date: '2025-03-01',
    });
    expect(parsed.projects?.[0]?.end_date).toBeUndefined();
    expect(parsed.projects?.[1]).toMatchObject({
      title: 'Analytics Dashboard',
      tech_stack: ['React', 'D3'],
      project_url: 'https://github.com/example/analytics',
      end_date: '2026-01-01',
    });
    expect(parsed.researchPapers).toHaveLength(1);
    expect(parsed.researchPapers?.[0]).toMatchObject({
      title: 'Efficient Edge-Cloud Sepsis Prediction',
      authors: ['Ada Lovelace', 'Grace Hopper'],
      venue: 'IEEE Health AI Conference',
      year: '2025',
      doi: '10.1109/example.2025.1',
      arxivUrl: 'https://arxiv.org/abs/2501.12345',
      publicationUrl: 'https://ieeexplore.ieee.org/document/1',
      githubUrl: 'https://github.com/example/paper-code',
    });
    expect(parsed.certifications).toHaveLength(1);
    expect(parsed.certifications?.[0]).toMatchObject({
      title: 'AWS Cloud Practitioner',
      issuing_org: 'Amazon Web Services',
      cert_url: 'https://example.com/cert',
    });
  });
});
