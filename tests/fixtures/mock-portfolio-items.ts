import type { PortfolioItemRecord } from '../../src/types/ai.types.js';
import { mockUserId } from './mock-user.js';

export const mockProjectItem: PortfolioItemRecord = {
  id: 'item-project-0000-0000-0000-000000000001',
  user_id: mockUserId,
  type: 'project',
  source: 'manual',
  title: 'Scalable Resume Generator',
  description: 'TypeScript and Fastify service with PostgreSQL and AWS S3 integration. Reduced generation time by 40%.',
  tech_stack: ['TypeScript', 'Fastify', 'PostgreSQL', 'AWS S3'],
  impact_metrics: 'Reduced generation time by 40%',
  is_current: true,
  domain_category: 'Backend Engineering',
  project_url: 'https://github.com/test/resume-gen',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

export const mockExperienceItem: PortfolioItemRecord = {
  id: 'item-experience-0000-0000-0000-000000000002',
  user_id: mockUserId,
  type: 'experience',
  source: 'manual',
  title: 'Backend Engineer Intern',
  description: 'Built REST APIs using Node.js and TypeScript. Improved API response time by 30%.',
  tech_stack: ['Node.js', 'TypeScript', 'REST APIs'],
  impact_metrics: 'Improved API response time by 30%',
  company_name: 'Acme Corp',
  employment_type: 'Internship',
  location: 'Remote',
  start_date: '2023-06-01',
  end_date: '2023-12-01',
  is_current: false,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

export const mockEducationItem: PortfolioItemRecord = {
  id: 'item-education-0000-0000-0000-000000000003',
  user_id: mockUserId,
  type: 'education',
  source: 'manual',
  title: 'B.Tech Computer Science',
  description: 'Relevant coursework: Data Structures, Algorithms, DBMS, Operating Systems',
  institution_name: 'Test University',
  degree: 'Bachelor of Technology',
  field_of_study: 'Computer Science',
  gpa: '3.8',
  start_date: '2020-08-01',
  end_date: '2024-05-01',
  is_current: false,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

export const mockSkillItem: PortfolioItemRecord = {
  id: 'item-skill-0000-0000-0000-000000000004',
  user_id: mockUserId,
  type: 'skill',
  source: 'manual',
  title: 'TypeScript',
  skill_name: 'TypeScript',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

export const mockPortfolioItems: PortfolioItemRecord[] = [
  mockProjectItem,
  mockExperienceItem,
  mockEducationItem,
  mockSkillItem,
];
