import { z } from 'zod';

const optionalUrl = z.preprocess((value) => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const trimmed = value.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}, z.string().url().optional());

export const applicationStatusSchema = z.enum([
  'saved',
  'preparing',
  'applied',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
]);

export const applicationBodySchema = z.object({
  company: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(200),
  source_url: optionalUrl,
  job_target_id: z.string().uuid().nullable().optional(),
  resume_version_id: z.string().uuid().nullable().optional(),
  status: applicationStatusSchema.optional(),
  application_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  follow_up_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const applicationUpdateSchema = applicationBodySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  'At least one field must be provided',
);

export const applicationParamsSchema = z.object({
  id: z.uuid('Application ID must be a valid UUID'),
});

export const applicationQuerySchema = z.object({
  status: applicationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type ApplicationBody = z.infer<typeof applicationBodySchema>;
export type ApplicationUpdate = z.infer<typeof applicationUpdateSchema>;
export type ApplicationParams = z.infer<typeof applicationParamsSchema>;
export type ApplicationQuery = z.infer<typeof applicationQuerySchema>;

