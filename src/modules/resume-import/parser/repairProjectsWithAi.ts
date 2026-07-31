import { z } from 'zod';
import { parserConfig } from '../../../config/parserConfig.js';
import { requestNimJson } from '../../../services/nvidia-nim.service.js';
import { logger } from '../../../utils/logger.js';
import {
	extractedLinkSchema,
	parsedProjectItemSchema,
	type ParsedProjectItem,
} from '../resume-import.schema.js';
import type { ParserContext } from './types.js';
import { warning } from './utils.js';

const projectRepairSchema = z.object({
	projects: z.array(parsedProjectItemSchema).max(12),
});

const guidedProjectRepairJson = {
	type: 'object',
	additionalProperties: false,
	properties: {
		projects: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					title: { type: 'string' },
					description: { type: 'string' },
					bullets: { type: 'array', items: { type: 'string' } },
					tech_stack: { type: 'array', items: { type: 'string' } },
					project_url: { type: 'string' },
					github_url: { type: 'string' },
					live_url: { type: 'string' },
					impact_metrics: { type: 'string' },
				},
				required: ['title'],
			},
		},
	},
	required: ['projects'],
};

const projectSectionText = (context: ParserContext): string =>
	context.sections
		.filter((section) => section.key === 'projects')
		.map((section) => section.text)
		.join('\n\n')
		.slice(0, 6000);

const projectLinksForPrompt = (context: ParserContext) =>
	context.links
		.filter((link) => link.kind === 'project' || link.kind === 'github_repo' || link.kind === 'demo')
		.map((link) => ({
			displayText: link.displayText,
			url: link.normalizedUrl,
			nearbyText: link.nearbyText?.slice(0, 180),
			kind: link.kind,
		}));

const systemPrompt = `You repair parsed resume project data.
Return strict JSON only. Extract only real projects from the Projects section.
Do not turn action bullets into project titles. Titles are project names, not sentences.
A description sentence must never become a project title.
Map GitHub repository links to github_url and project_url when they are the primary project link.
Assign embedded links to the nearest correct project.
Preserve project descriptions exactly as written. Do not rewrite or summarize.
Keep bullets as contribution/details. Do not invent technologies or metrics.`;

export interface ProjectRepairResult {
	projects: ParsedProjectItem[];
	modelUsed: string;
	usedFallback: boolean;
}

const callWithFallback = async <T>(
	options: Parameters<typeof requestNimJson<T>>[0],
): Promise<{ result: T; modelUsed: string; usedFallback: boolean }> => {
	const primaryModel = parserConfig.parserModel;
	try {
		const result = await requestNimJson<T>({ ...options, model: primaryModel });
		return { result, modelUsed: primaryModel, usedFallback: false };
	} catch (primaryError) {
		const fallbackModel = parserConfig.parserFallbackModel;
		if (!fallbackModel) throw primaryError;
		logger.warn(
			{ err: primaryError, primaryModel, fallbackModel },
			'Primary parser model failed; retrying with fallback model for project repair',
		);
		const result = await requestNimJson<T>({ ...options, model: fallbackModel });
		return { result, modelUsed: fallbackModel, usedFallback: true };
	}
};

export const repairProjectsWithAi = async (
	context: ParserContext,
	deterministicProjects: ParsedProjectItem[],
): Promise<ProjectRepairResult | undefined> => {
	const text = projectSectionText(context);
	if (!text.trim()) return undefined;
	try {
		const { result: raw, modelUsed, usedFallback } = await callWithFallback<unknown>({
			systemPrompt,
			userPrompt: JSON.stringify({
				projectsSectionText: text,
				extractedLinks: projectLinksForPrompt(context),
				currentProjects: deterministicProjects.map((project) => ({
					title: project.title,
					project_url: project.project_url,
					github_url: project.github_url,
					bullets: project.bullets,
				})),
				instructions: {
					doNotTurnDescriptionsIntoTitles: true,
					preserveDescriptionsExactly: true,
					doNotInvent: true,
					assignEmbeddedLinksToNearestProject: true,
				},
			}),
			temperature: 0,
			maxTokens: 2500,
			maxRetries: 0,
			timeoutMs: parserConfig.parserTimeoutMs,
			guidedJson: guidedProjectRepairJson,
		});
		const parsed = projectRepairSchema.safeParse(raw);
		if (!parsed.success || parsed.data.projects.length === 0) {
			context.warnings.push(
				warning('PROJECT_AI_REPAIR_INVALID', 'Project repair returned invalid data and was ignored.', 'warning', 'projects'),
			);
			return undefined;
		}
		context.warnings.push(
			warning('PROJECT_AI_REPAIRED', 'Project entries were repaired using AI-assisted parsing.', 'info', 'projects'),
		);
		return {
			projects: parsed.data.projects.map((project) => ({
				...project,
				links: project.links?.filter((link) => extractedLinkSchema.safeParse(link).success),
				_meta: {
					confidence: 0.88,
					warnings: [],
					sourceSection: 'Projects',
					sourceText: text.slice(0, 500),
				},
			})),
			modelUsed,
			usedFallback,
		};
	} catch (error) {
		logger.warn({ err: error, operation: 'resume_import_project_repair_ai' }, 'Resume project AI repair failed');
		context.warnings.push(
			warning('PROJECT_AI_REPAIR_UNAVAILABLE', 'AI project repair was unavailable; deterministic project parsing was used.', 'info', 'projects'),
		);
		return undefined;
	}
};
