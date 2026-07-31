import { describe, expect, it } from 'vitest';
import { parseResumeTextDeterministically } from '../../src/modules/resume-import/resume-text-parser.service.js';

describe('parseResumeTextDeterministically', () => {
  it('extracts common resume fields without an AI provider', () => {
    const parsed = parseResumeTextDeterministically(`
      Jane Doe
      jane.doe@example.com | +1 555 123 4567 | San Francisco, CA
      linkedin.com/in/janedoe | github.com/janedoe | janedoe.dev

      Summary
      Full-stack engineer focused on TypeScript, React, Node.js, and PostgreSQL.

      Experience
      Senior Software Engineer | Acme Inc
      Jan 2022 - Present
      Built React and Node.js services backed by PostgreSQL and Redis.

      Education
      Bachelor of Science in Computer Science
      Stanford University
      2016 - 2020
      GPA: 3.8/4.0

      Skills
      Languages: TypeScript, Python, SQL
      Frameworks: React, Node.js

      Projects
      Resume Importer
      Built a Fastify service with PostgreSQL.
      https://github.com/janedoe/resume-importer
    `);

    expect(parsed.personal).toMatchObject({
      full_name: 'Jane Doe',
      email: 'jane.doe@example.com',
      linkedin_url: 'https://linkedin.com/in/janedoe',
      github_url: 'https://github.com/janedoe',
    });
    expect(parsed.experience?.[0]).toMatchObject({
      title: 'Senior Software Engineer',
      company_name: 'Acme Inc',
      start_date: '2022-01-01',
      is_current: true,
    });
    expect(parsed.education?.[0]).toMatchObject({
      degree: 'Bachelor of Science in Computer Science',
      institution_name: 'Stanford University',
      gpa: '3.8/4.0',
    });
    expect(parsed.skills?.map((skill) => skill.skill_name)).toEqual(
      expect.arrayContaining(['TypeScript', 'Python', 'SQL', 'React', 'Node.js']),
    );
    expect(parsed.projects?.[0]).toMatchObject({
      title: 'Resume Importer',
      project_url: 'https://github.com/janedoe/resume-importer',
    });
  });
});
