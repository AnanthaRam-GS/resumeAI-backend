import { z } from 'zod';

export const generateCoverLetterSchema = z.object({
  whyCompany: z.string().trim().min(10, 'Please explain why you are interested in this company'),
  tone: z.enum(['formal', 'balanced', 'conversational']).default('balanced'),
  highlightNote: z.string().trim().optional(),
});

export const coverLetterResumeParamsSchema = z.object({
  resumeId: z.uuid('Resume ID must be a valid UUID'),
});

export type GenerateCoverLetterInput = z.infer<typeof generateCoverLetterSchema>;
export type CoverLetterResumeParams = z.infer<typeof coverLetterResumeParamsSchema>;
