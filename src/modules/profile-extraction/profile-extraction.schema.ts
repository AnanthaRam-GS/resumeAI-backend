import { z } from 'zod';

const nullableTrimmedString = z.string().trim().min(1).nullable();

const uniqueTrimmedStrings = z
  .array(z.string().trim().min(1))
  .transform((values) => [...new Set(values)]);

export const profileExtractionSchema = z
  .object({
    full_name: nullableTrimmedString,
    year_of_study: nullableTrimmedString,
    graduation_year: z.int().min(1900).max(2200).nullable(),
    target_roles: uniqueTrimmedStrings,
    skills: uniqueTrimmedStrings,
    preferred_location: nullableTrimmedString,
    opportunity_type: nullableTrimmedString,
  })
  .strict();

export type ProfileExtraction = z.infer<typeof profileExtractionSchema>;
export type ProfileExtractionModelOutput = z.input<typeof profileExtractionSchema>;
