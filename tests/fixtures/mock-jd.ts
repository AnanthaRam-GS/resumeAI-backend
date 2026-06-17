import type { ExtractedEntities } from '../../src/types/ai.types.js';

export const mockJobDescription = `
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

export const mockExtractedEntities: ExtractedEntities = {
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
