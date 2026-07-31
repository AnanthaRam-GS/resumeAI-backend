import { z } from 'zod';

export const updatePersonalProfileSchema = z
	.object({
		full_name: z
			.string()
			.trim()
			.min(2, 'Full name must be at least 2 characters')
			.optional(),
		university: z.string().trim().optional(),
		graduation_year: z.int('Graduation year must be an integer').optional(),
		target_role_category: z.string().trim().optional(),
		profile_photo_s3_key: z.string().trim().nullable().optional(),
		phone_number: z.string().trim().nullable().optional(),
		linkedin_url: z.string().trim().nullable().optional(),
		github_url: z.string().trim().nullable().optional(),
		portfolio_url: z.string().trim().nullable().optional(),
		location: z.string().trim().nullable().optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided',
		path: [],
	});

export const updateCareerGoalSchema = z.object({
	career_goal: z.string().trim().min(10, 'Career goal must be at least 10 characters'),
});

export const updateOnboardingStepSchema = z.object({
	onboarding_step: z
		.int('Onboarding step must be an integer')
		.min(1, 'Onboarding step must be between 1 and 8')
		.max(8, 'Onboarding step must be between 1 and 8'),
	onboarding_complete: z.boolean().optional(),
});

export type UpdatePersonalProfileInput = z.infer<typeof updatePersonalProfileSchema>;
export type UpdateCareerGoalInput = z.infer<typeof updateCareerGoalSchema>;
export type UpdateOnboardingStepInput = z.infer<typeof updateOnboardingStepSchema>;
