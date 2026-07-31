import { z } from 'zod';

const safeUrl = z
  .string()
  .trim()
  .url('Source URL must be a valid URL')
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'Source URL must use http or https',
  });

export const importJobTargetSchema = z.object({
  roleTitle: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(1).max(200),
  jobDescription: z.string().trim().min(80).max(60_000),
  sourceUrl: safeUrl.optional(),
  sourcePlatform: z.string().trim().min(1).max(80).optional(),
  location: z.string().trim().max(200).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const jobTargetParamsSchema = z.object({
  id: z.uuid('Job target ID must be a valid UUID'),
});

export const jobTargetListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type ImportJobTargetInput = z.infer<typeof importJobTargetSchema>;
export type JobTargetParams = z.infer<typeof jobTargetParamsSchema>;
export type JobTargetListQuery = z.infer<typeof jobTargetListQuerySchema>;

