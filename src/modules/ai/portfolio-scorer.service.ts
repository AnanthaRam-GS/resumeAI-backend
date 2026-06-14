import type { ExtractedEntities, PortfolioItemRecord, ScoredItem } from '../../types/ai.types.js';
import { findMatchingKeywords, textIncludesKeyword } from '../../services/ats-scorer.service.js';

const unique = (values: string[]): string[] => {
	return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
};

const getItemText = (item: PortfolioItemRecord): string => {
	return [
		item.title,
		item.description,
		item.company_name,
		item.domain_category,
		item.degree,
		item.field_of_study,
		item.institution_name,
		item.achievements,
		item.issuing_org,
		item.skill_name,
		item.project_url,
		item.impact_metrics,
		...(item.tech_stack ?? []),
	].filter(Boolean).join(' ');
};

const scoreRecency = (item: PortfolioItemRecord): { score: number; reason?: string } => {
	if (item.is_current) {
		return { score: 15, reason: 'Current role or ongoing work adds freshness.' };
	}

	if (!item.end_date) {
		return { score: 8 };
	}

	const endDate = new Date(item.end_date);
	if (Number.isNaN(endDate.getTime())) {
		return { score: 8 };
	}

	const monthsAgo = Math.max(0, (Date.now() - endDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
	if (monthsAgo <= 12) {
		return { score: 15, reason: 'Recently completed work is more relevant.' };
	}
	if (monthsAgo <= 24) {
		return { score: 10 };
	}
	return { score: 5 };
};

const scoreImpact = (item: PortfolioItemRecord): { score: number; reason?: string } => {
	const impactText = [item.impact_metrics, item.extra && JSON.stringify(item.extra)]
		.filter(Boolean)
		.join(' ')
		.trim();

	if (!impactText) {
		return { score: 4 };
	}

	const hasNumber = /\d/.test(impactText);
	const score = hasNumber ? 15 : 9;
	return {
		score,
		reason: hasNumber ? 'Quantified impact strengthens the bullet.' : 'Impact statement is present.',
	};
};

const scoreDomain = (
	item: PortfolioItemRecord,
	extractedEntities: ExtractedEntities,
	itemText: string,
): { score: number; reason?: string } => {
	const categoryKeywords = unique([
		extractedEntities.roleCategory,
		...findMatchingKeywords(extractedEntities.roleCategory, [item.type, item.domain_category ?? '']),
	]);

	const matched = categoryKeywords.filter((keyword) => textIncludesKeyword(itemText, keyword));
	if (matched.length === 0) {
		return { score: 4 };
	}

	return {
		score: Math.min(20, 8 + matched.length * 4),
		reason: `Role alignment found for ${matched.slice(0, 3).join(', ')}.`,
	};
};

const scoreSkillAlignment = (
	itemText: string,
	extractedEntities: ExtractedEntities,
): { score: number; matchedSkills: string[]; reason?: string } => {
	const keywords = unique([
		...extractedEntities.requiredSkills,
		...extractedEntities.preferredSkills,
		...extractedEntities.techStack,
	]);
	const matchedSkills = keywords.filter((keyword) => textIncludesKeyword(itemText, keyword));

	if (matchedSkills.length === 0) {
		return { score: 10, matchedSkills: [] };
	}

	return {
		score: Math.min(50, 10 + matchedSkills.length * 8),
		matchedSkills,
		reason: `Matches ${matchedSkills.slice(0, 4).join(', ')}.`,
	};
};

export const scorePortfolioItems = (
	items: PortfolioItemRecord[],
	extractedEntities: ExtractedEntities,
	jobDescription = '',
): ScoredItem[] => {
	return items
		.map<ScoredItem>((item) => {
			const itemText = getItemText(item);
			const skillScore = scoreSkillAlignment(itemText, extractedEntities);
			const recencyScore = scoreRecency(item);
			const impactScore = scoreImpact(item);
			const domainScore = scoreDomain(item, extractedEntities, `${itemText} ${jobDescription}`);

			const score = Math.min(100, skillScore.score + recencyScore.score + impactScore.score + domainScore.score);
			const reasons = [skillScore.reason, recencyScore.reason, impactScore.reason, domainScore.reason].filter(
				(reason): reason is string => Boolean(reason),
			);

			return {
				item,
				score,
				reasons,
				matchedSkills: skillScore.matchedSkills,
			};
		})
		.sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title));
};

