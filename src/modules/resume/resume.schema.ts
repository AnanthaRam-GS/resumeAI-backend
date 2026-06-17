import { z } from 'zod';

export const generateResumeSchema = z.object({
  jobTitle: z.string().trim().min(1, 'Job title is required'),
  companyName: z.string().trim().min(1, 'Company name is required'),
  jobDescription: z.string().trim().min(50, 'Job description must be at least 50 characters'),
  templateId: z.enum(['modern', 'academic', 'minimal']).optional(),
  pageLength: z.enum(['1-page', '1.5-page']).optional(),
});

export const generationStatusParamsSchema = z.object({
  jobId: z.uuid('Job ID must be a valid UUID'),
});

export const resumeVersionParamsSchema = z.object({
  id: z.uuid('Resume version ID must be a valid UUID'),
});

export const updateResumeStatusSchema = z.object({
  status: z.enum(['draft', 'submitted', 'archived']),
});

export const resumeVersionQuerySchema = z.object({
  status: z.enum(['draft', 'submitted', 'archived']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type GenerateResumeInput = z.infer<typeof generateResumeSchema>;
export type GenerationStatusParams = z.infer<typeof generationStatusParamsSchema>;
export type ResumeVersionParams = z.infer<typeof resumeVersionParamsSchema>;
export type UpdateResumeStatusInput = z.infer<typeof updateResumeStatusSchema>;
export type ResumeVersionQuery = z.infer<typeof resumeVersionQuerySchema>;
