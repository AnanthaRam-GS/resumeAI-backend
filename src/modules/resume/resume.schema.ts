import { z } from 'zod';

export const generateResumeSchema = z.object({
  jobTitle: z.string().trim().min(1, 'Job title is required'),
  companyName: z.string().trim().min(1, 'Company name is required'),
  jobDescription: z
    .string()
    .trim()
    .min(50, 'Job description must be at least 50 characters'),
  templateId: z.enum(['modern', 'academic', 'minimal']).default('modern'),
  pageLength: z.enum(['1-page', '1.5-page']).default('1-page'),
});

export type GenerateResumeInput = z.infer<typeof generateResumeSchema>;

export const updateVersionStatusSchema = z.object({
  status: z.enum(['draft', 'submitted', 'archived']),
});

export type UpdateVersionStatusInput = z.infer<typeof updateVersionStatusSchema>;

export const jobIdParamSchema = z.object({
  jobId: z.string().uuid('Invalid job ID'),
});

export const versionIdParamSchema = z.object({
  id: z.string().uuid('Invalid version ID'),
});
