import type { ExtractedEntities } from '../../types/ai.types.js';
import { requestNimJson } from '../../services/nvidia-nim.service.js';
import { ValidationError } from '../../utils/errors.js';
import { jdExtractionPrompt } from './prompts/jd-extraction.prompt.js';

const allowedSeniority = new Set<ExtractedEntities['roleSeniority']>([
	'intern',
	'junior',
	'mid',
	'senior',
	'lead',
	'principal',
	'staff',
	'unknown',
]);

const unique = (values: string[] | undefined): string[] => {
	return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
};

export const normalizeExtractedEntities = (value: Partial<ExtractedEntities>): ExtractedEntities => {
	const roleSeniority = value.roleSeniority ?? 'unknown';

	if (!allowedSeniority.has(roleSeniority)) {
		throw new ValidationError('Invalid role seniority returned by JD analyzer');
	}

	return {
		requiredSkills: unique(value.requiredSkills),
		preferredSkills: unique(value.preferredSkills),
		techStack: unique(value.techStack),
		roleSeniority,
		roleCategory: (value.roleCategory ?? 'General').trim() || 'General',
		summary: value.summary?.trim(),
		responsibilities: unique(value.responsibilities),
		keywords: unique(value.keywords),
	};
};

export const analyzeJobDescription = async (jobDescription: string): Promise<ExtractedEntities> => {
	if (!jobDescription.trim()) {
		throw new ValidationError('Job description is required');
	}

	const extracted = await requestNimJson<Partial<ExtractedEntities>>({
		systemPrompt: jdExtractionPrompt,
		userPrompt: jobDescription,
		temperature: 0.1,
	});

	return normalizeExtractedEntities(extracted);
};

