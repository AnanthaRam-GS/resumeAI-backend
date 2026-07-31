import type { ParseWarning, ParsedResumeData } from '../resume-import.schema.js';
import { isProjectTitleCandidate } from './extractProjects.js';
import { isValidLocationCandidate } from './extractPersonalInfo.js';
import { warning } from './utils.js';

type WarningMeta = {
	confidence?: number;
	warnings?: string[];
	sourceSection?: string;
	sourceText?: string;
};

const addItemWarning = <T extends { _meta?: WarningMeta }>(item: T, message: string): T => ({
	...item,
	_meta: {
		confidence: item._meta?.confidence ?? 0.5,
		warnings: [...(item._meta?.warnings ?? []), message],
		...(item._meta?.sourceSection ? { sourceSection: item._meta.sourceSection } : {}),
		...(item._meta?.sourceText ? { sourceText: item._meta.sourceText } : {}),
	},
});

export const validateParsedData = (data: ParsedResumeData): ParsedResumeData => {
	const warnings: ParseWarning[] = [...data.warnings];
	const personal = data.personal ? { ...data.personal } : undefined;
	const personalInfo = data.personalInfo ? { ...data.personalInfo } : undefined;

	if (personal?.location && !isValidLocationCandidate(personal.location)) {
		warnings.push(warning('INVALID_LOCATION', 'Location was rejected because it does not look like a place.', 'warning', 'location'));
		delete personal.location;
		if (personalInfo) delete personalInfo.location;
	}
	if (personal?.portfolio_url && /gmail\.com/i.test(personal.portfolio_url)) {
		warnings.push(warning('EMAIL_DOMAIN_AS_PORTFOLIO', 'An email domain was rejected as a portfolio URL.', 'warning', 'portfolioUrl'));
		delete personal.portfolio_url;
		if (personalInfo) delete personalInfo.portfolioUrl;
	}

	const education = (data.education ?? []).flatMap((item) => {
		if (!item.degree && !item.institution_name) return [];
		if (item.gpa && !/^[0-9.]+(?:\s*\/\s*[0-9.]+)?$/.test(item.gpa)) {
			return [addItemWarning(item, 'GPA format needs review.')];
		}
		return [item];
	});

	const projects = (data.projects ?? []).flatMap((item) => {
		if (!item.title) return [];
		if (!isProjectTitleCandidate(item.title, { hasProjectLink: Boolean(item.project_url ?? item.github_url ?? item.live_url) })) {
			return [
				addItemWarning(
					item,
					'Project title looks like a description and needs review.',
				),
			];
		}
		if (/\blink to project|project link|view project\b/i.test(item.title)) {
			return [addItemWarning(item, 'Project title still contains link-label text.')];
		}
		return [item];
	});

	const researchPapers = (data.researchPapers ?? []).flatMap((item) => {
		if (!item.title) return [];
		const warningsForItem: string[] = [];
		if (item.doi && !/^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(item.doi)) {
			warningsForItem.push('DOI format needs review.');
		}
		if (item.arxivUrl && !/arxiv\.org\/(?:abs|pdf)\/\d{4}\.\d{4,5}(?:v\d+)?/i.test(item.arxivUrl)) {
			warningsForItem.push('arXiv URL format needs review.');
		}
		if (item.year && !/^(?:19|20)\d{2}$/.test(item.year)) {
			warningsForItem.push('Publication year needs review.');
		}
		if (!item.doi && !item.arxivUrl && !item.publicationUrl && !item.venue && (item._meta?.confidence ?? 0.5) < 0.7) {
			warningsForItem.push('Research paper has limited publication evidence.');
		}
		return [warningsForItem.reduce((paper, message) => addItemWarning(paper, message), item)];
	});

	const skills = (data.skills ?? []).filter((item) => {
		const text = item.skill_name ?? item.title;
		return text.length <= 40 && text.split(/\s+/).length <= 5 && !/[.!?]$/.test(text);
	});

	const certifications = (data.certifications ?? []).filter((item) => item.title);

	return {
		...data,
		...(personal ? { personal } : {}),
		...(personalInfo ? { personalInfo } : {}),
		education,
		projects,
		researchPapers,
		skills,
		certifications,
		warnings,
	};
};
