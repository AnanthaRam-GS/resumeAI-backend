import { z } from 'zod';

export const updateSettingsProfileSchema = z
	.object({
		full_name: z
			.string()
			.trim()
			.min(2, 'Full name must be at least 2 characters')
			.optional(),
		university: z.string().trim().nullable().optional(),
		graduation_year: z
			.int('Graduation year must be an integer')
			.nullable()
			.optional(),
		target_role_category: z.string().trim().nullable().optional(),
		profile_photo_s3_key: z.string().trim().nullable().optional(),
		phone_number: z.string().trim().nullable().optional(),
		linkedin_url: z.string().trim().nullable().optional(),
		github_url: z.string().trim().nullable().optional(),
		portfolio_url: z.string().trim().nullable().optional(),
		location: z.string().trim().nullable().optional(),
		writing_style: z.enum(['professional', 'concise', 'storytelling', 'technical']).nullable().optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided',
		path: [],
	});

export const updateSettingsCareerGoalSchema = z.object({
	career_goal: z.string().trim().min(10, 'Career goal must be at least 10 characters'),
});

export const updateNotificationSettingsSchema = z
	.object({
		notif_gap_digest: z.boolean().optional(),
		notif_gen_complete: z.boolean().optional(),
		notif_sync_complete: z.boolean().optional(),
		analytics_opt_out: z.boolean().optional(),
		weekly_digest_opt_in: z.boolean().optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided',
		path: [],
	});

export const deleteAccountSchema = z
	.object({
		password: z.string().min(8, 'Password must be at least 8 characters'),
		confirmText: z.string().min(1, 'Confirmation text is required'),
	})
	.refine((data) => data.confirmText === 'DELETE MY ACCOUNT', {
		message: 'Confirmation text must exactly match DELETE MY ACCOUNT',
		path: ['confirmText'],
	});

export type UpdateSettingsProfileInput = z.infer<typeof updateSettingsProfileSchema>;
export type UpdateSettingsCareerGoalInput = z.infer<
	typeof updateSettingsCareerGoalSchema
>;
export type UpdateNotificationSettingsInput = z.infer<
	typeof updateNotificationSettingsSchema
>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
