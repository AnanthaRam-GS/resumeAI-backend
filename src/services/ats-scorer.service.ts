import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ATSResult, ExtractedEntities, SkillTaxonomyFile, SkillTaxonomySkill } from '../types/ai.types.js';

const TAXONOMY_URL = new URL('../data/skills-taxonomy.json', import.meta.url);
let cachedTaxonomy: SkillTaxonomyFile | null = null;

export const normalizeText = (value: string): string => {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
};

const unique = (values: string[]): string[] => {
	return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
};

const loadTaxonomy = (): SkillTaxonomyFile => {
	if (cachedTaxonomy) {
		return cachedTaxonomy;
	}

	const raw = readFileSync(fileURLToPath(TAXONOMY_URL), 'utf8');
	cachedTaxonomy = JSON.parse(raw) as SkillTaxonomyFile;
	return cachedTaxonomy;
};

const flattenTaxonomySkills = (): SkillTaxonomySkill[] => {
	return loadTaxonomy().groups.flatMap((group) => group.skills);
};

export const getTaxonomyKeywords = (): string[] => {
	const keywords = flattenTaxonomySkills().flatMap((skill) => [skill.name, ...(skill.synonyms ?? [])]);
	return unique(keywords.map(normalizeText));
};

export const textIncludesKeyword = (text: string, keyword: string): boolean => {
	const normalizedText = normalizeText(text);
	const normalizedKeyword = normalizeText(keyword);

	if (!normalizedText || !normalizedKeyword) {
		return false;
	}

	return normalizedText.includes(normalizedKeyword);
};

export const findMatchingKeywords = (text: string, keywords: string[]): string[] => {
	return unique(keywords.filter((keyword) => textIncludesKeyword(text, keyword)).map((keyword) => keyword.trim()));
};

const normalizeEntityList = (values?: string[]): string[] => {
	return unique((values ?? []).map((value) => value.trim()).filter(Boolean));
};

const buildSuggestions = (missingRequired: string[], missingPreferred: string[]): string[] => {
	const suggestions: string[] = [];

	if (missingRequired.length > 0) {
		suggestions.push(`Add evidence for ${missingRequired.slice(0, 4).join(', ')}`);
	}

	if (missingPreferred.length > 0) {
		suggestions.push(`Consider highlighting ${missingPreferred.slice(0, 4).join(', ')}`);
	}

	if (suggestions.length === 0) {
		suggestions.push('Tailor the resume summary and top bullets to the target role.');
	}

	return suggestions;
};

export interface AtsScoreInput {
	jobDescription: string;
	resumeText: string;
	extractedEntities?: Partial<ExtractedEntities>;
}

export const scoreAtsMatch = ({ jobDescription, resumeText, extractedEntities }: AtsScoreInput): ATSResult => {
	const requiredSkills = normalizeEntityList(extractedEntities?.requiredSkills);
	const preferredSkills = normalizeEntityList(extractedEntities?.preferredSkills);
	const techStack = normalizeEntityList(extractedEntities?.techStack);

	const jobKeywords = findMatchingKeywords(jobDescription, getTaxonomyKeywords());
	const resumeKeywords = findMatchingKeywords(resumeText, [...getTaxonomyKeywords(), ...jobKeywords]);

	const foundRequired = requiredSkills.filter((keyword) => textIncludesKeyword(resumeText, keyword));
	const foundPreferred = preferredSkills.filter((keyword) => textIncludesKeyword(resumeText, keyword));
	const foundTech = techStack.filter((keyword) => textIncludesKeyword(resumeText, keyword));

	const matchedKeywords = unique([...foundRequired, ...foundPreferred, ...foundTech, ...resumeKeywords]);
	const missingRequired = requiredSkills.filter((keyword) => !foundRequired.includes(keyword));
	const missingPreferred = preferredSkills.filter((keyword) => !foundPreferred.includes(keyword));

	const maxScore = Math.max(requiredSkills.length * 4 + preferredSkills.length * 2 + techStack.length, 1);
	const rawScore = foundRequired.length * 4 + foundPreferred.length * 2 + foundTech.length;
	const score = Math.min(100, Math.round((rawScore / maxScore) * 100));

	return {
		score,
		foundKeywords: unique([...foundRequired, ...foundPreferred, ...foundTech]),
		missingKeywords: unique([...missingRequired, ...missingPreferred]),
		suggestions: buildSuggestions(missingRequired, missingPreferred),
		matchedKeywords,
	};
};
