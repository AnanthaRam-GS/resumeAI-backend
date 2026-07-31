import type { ParsedResumeData } from '../resume-import.schema.js';
import { normalizeTextKey, normalizeUrlKey, uniqueByKey } from './utils.js';

export const deduplicateParsedData = (data: ParsedResumeData): ParsedResumeData => ({
	...data,
	education: uniqueByKey(
		data.education ?? [],
		(item) => `${normalizeTextKey(item.degree ?? item.title)}:${normalizeTextKey(item.institution_name)}:${item.end_date ?? ''}`,
	),
	experience: uniqueByKey(
		data.experience ?? [],
		(item) => `${normalizeTextKey(item.title)}:${normalizeTextKey(item.company_name)}:${item.start_date ?? ''}`,
	),
	projects: uniqueByKey(
		data.projects ?? [],
		(item) => `${normalizeTextKey(item.title)}:${normalizeUrlKey(item.project_url ?? item.github_url) ?? ''}`,
	),
	researchPapers: uniqueByKey(
		data.researchPapers ?? [],
		(item) =>
			[
				item.doi ? `doi:${normalizeTextKey(item.doi)}` : '',
				item.arxivUrl ? `arxiv:${normalizeUrlKey(item.arxivUrl)}` : '',
				item.publicationUrl ? `url:${normalizeUrlKey(item.publicationUrl)}` : '',
				`title:${normalizeTextKey(item.title)}:${item.year ?? ''}`,
			].find(Boolean),
	),
	skills: uniqueByKey(data.skills ?? [], (item) => normalizeTextKey(item.skill_name ?? item.title)),
	certifications: uniqueByKey(
		data.certifications ?? [],
		(item) => `${normalizeTextKey(item.title)}:${normalizeTextKey(item.issuing_org)}:${normalizeUrlKey(item.cert_url) ?? ''}`,
	),
	achievements: uniqueByKey(data.achievements ?? [], (item) => normalizeTextKey(item.value)),
});
