import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
	getCurrentProfile,
	getProfileCompletenessSummary,
	updateCareerGoalDetails,
	updateOnboardingProgress,
	updatePersonalProfileDetails,
} from './profile.controller.js';
import {
	type UpdateCareerGoalInput,
	type UpdateOnboardingStepInput,
	type UpdatePersonalProfileInput,
	updateCareerGoalSchema,
	updateOnboardingStepSchema,
	updatePersonalProfileSchema,
} from './profile.schema.js';

export const profileRoutes: FastifyPluginAsync = async (app) => {
	app.get(
		'/me',
		{
			preHandler: auth,
		},
		getCurrentProfile,
	);

	app.get(
		'/completeness',
		{
			preHandler: auth,
		},
		getProfileCompletenessSummary,
	);

	app.patch<{ Body: UpdatePersonalProfileInput }>(
		'/personal',
		{
			preHandler: [
				auth,
				validate({
					body: updatePersonalProfileSchema,
				}),
			],
		},
		updatePersonalProfileDetails,
	);

	app.patch<{ Body: UpdateCareerGoalInput }>(
		'/career-goal',
		{
			preHandler: [
				auth,
				validate({
					body: updateCareerGoalSchema,
				}),
			],
		},
		updateCareerGoalDetails,
	);

	app.patch<{ Body: UpdateOnboardingStepInput }>(
		'/onboarding-step',
		{
			preHandler: [
				auth,
				validate({
					body: updateOnboardingStepSchema,
				}),
			],
		},
		updateOnboardingProgress,
	);
};
