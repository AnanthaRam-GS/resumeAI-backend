import type { FastifyReply, FastifyRequest } from 'fastify';
import { success } from '../../utils/response.js';
import type {
	UpdateCareerGoalInput,
	UpdateOnboardingStepInput,
	UpdatePersonalProfileInput,
} from './profile.schema.js';
import {
	getProfileCompleteness,
	getProfile,
	updateCareerGoal,
	updateOnboardingStep,
	updatePersonalProfile,
} from './profile.service.js';

export const getCurrentProfile = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const profile = await getProfile(request.user.userId);

	return reply.send(
		success(
			{
				profile,
			},
			'Profile retrieved',
		),
	);
};

export const updatePersonalProfileDetails = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const profile = await updatePersonalProfile(
		request.user.userId,
		request.body as UpdatePersonalProfileInput,
	);

	return reply.send(
		success(
			{
				profile,
			},
			'Personal profile updated',
		),
	);
};

export const updateCareerGoalDetails = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const profile = await updateCareerGoal(
		request.user.userId,
		request.body as UpdateCareerGoalInput,
	);

	return reply.send(
		success(
			{
				profile,
			},
			'Career goal updated',
		),
	);
};

export const updateOnboardingProgress = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const profile = await updateOnboardingStep(
		request.user.userId,
		request.body as UpdateOnboardingStepInput,
	);

	return reply.send(
		success(
			{
				profile,
			},
			'Onboarding progress updated',
		),
	);
};

export const getProfileCompletenessSummary = async (
	request: FastifyRequest,
	reply: FastifyReply,
) => {
	const completeness = await getProfileCompleteness(request.user.userId);

	return reply.send(
		success(
			{
				completeness,
			},
			'Profile completeness calculated',
		),
	);
};
