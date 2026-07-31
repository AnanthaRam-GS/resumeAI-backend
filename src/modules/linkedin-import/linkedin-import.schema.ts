import { z } from 'zod';

export const linkedinBatchParamsSchema = z.object({
  id: z.uuid('LinkedIn import batch ID must be a valid UUID'),
});

export const applyLinkedinImportSchema = z.object({
  recordIds: z.array(z.string().uuid()).min(1).max(200),
});

export type LinkedInBatchParams = z.infer<typeof linkedinBatchParamsSchema>;
export type ApplyLinkedInImportInput = z.infer<typeof applyLinkedinImportSchema>;

