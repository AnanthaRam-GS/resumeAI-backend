import { z } from 'zod';
import { SUPPORTED_OUTPUT_LANGUAGES } from '../../services/language.service.js';

const outputLanguageCodes = SUPPORTED_OUTPUT_LANGUAGES.map((language) => language.code) as [
  string,
  ...string[],
];

export const generateCoverLetterSchema = z.object({
  whyCompany: z.string().trim().min(10, 'Please explain why you are interested in this company'),
  tone: z.enum(['formal', 'balanced', 'conversational']).default('balanced'),
  highlightNote: z.string().trim().optional(),
  outputLanguage: z.enum(outputLanguageCodes).optional(),
});

export const coverLetterResumeParamsSchema = z.object({
  resumeId: z.uuid('Resume ID must be a valid UUID'),
});

export type GenerateCoverLetterInput = z.infer<typeof generateCoverLetterSchema>;
export type CoverLetterResumeParams = z.infer<typeof coverLetterResumeParamsSchema>;
