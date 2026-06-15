import { z } from 'zod';

export const generateCoverLetterSchema = z.object({
  whyCompany: z
    .string()
    .trim()
    .min(10, 'Please explain why you want to work at this company (at least 10 characters)'),
  tone: z.enum(['formal', 'balanced', 'conversational']).default('balanced'),
  highlightNote: z.string().trim().max(500).optional(),
});

export type GenerateCoverLetterInput = z.infer<typeof generateCoverLetterSchema>;

export const resumeIdParamSchema = z.object({
  resumeId: z.string().uuid('Invalid resume ID'),
});
