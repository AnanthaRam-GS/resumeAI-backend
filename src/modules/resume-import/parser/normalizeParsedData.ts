import type {
	ParsedCertificationItem,
	ParsedEducationItem,
	ParsedExperienceItem,
	ParsedProjectItem,
	ParsedResearchPaperItem,
	ParsedResumeData,
	ParsedSkillItem,
} from '../resume-import.schema.js';
import { normalizeSkillName } from './extractSkills.js';
import { cleanProjectTitle } from './extractProjects.js';
import { normalizeUrl, uniqueByKey } from './utils.js';

const cleanText = (value: string | undefined): string | undefined => {
	const cleaned = value?.replace(/\s+/g, ' ').trim();
	return cleaned || undefined;
};

const normalizeBullets = (bullets: string[] | undefined): string[] | undefined => {
	const cleaned = uniqueByKey(
		(bullets ?? [])
				.map((bullet) => bullet.replace(/^[-•\s]+/, '').replace(/\s+/g, ' ').trim())
			.filter((bullet) => bullet.length > 4),
		(bullet) => bullet,
	);
	return cleaned.length ? cleaned : undefined;
};

const normalizeProject = (project: ParsedProjectItem): ParsedProjectItem => {
	const title = cleanProjectTitle(project.title);
	const links = project.links?.map((link) => ({
		...link,
		normalizedUrl: normalizeUrl(link.normalizedUrl) ?? link.normalizedUrl,
	}));
	return {
		...project,
		title,
		description: cleanText(project.description),
		bullets: normalizeBullets(project.bullets),
		project_url: normalizeUrl(project.project_url ?? '') ?? project.project_url,
		github_url: normalizeUrl(project.github_url ?? '') ?? project.github_url,
		live_url: normalizeUrl(project.live_url ?? '') ?? project.live_url,
		tech_stack: uniqueByKey(
			(project.tech_stack ?? []).map((skill) => normalizeSkillName(skill)).filter((skill): skill is string => Boolean(skill)),
			(skill) => skill,
		),
		...(links?.length ? { links } : {}),
	};
};

const normalizeDoi = (value: string | undefined): string | undefined => {
	const cleaned = cleanText(value)?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/[),.;\]]+$/g, '');
	return cleaned || undefined;
};

const normalizeResearchPaper = (paper: ParsedResearchPaperItem): ParsedResearchPaperItem => {
	const links = paper.links?.map((link) => ({
		...link,
		normalizedUrl: normalizeUrl(link.normalizedUrl) ?? link.normalizedUrl,
	}));
	return {
		...paper,
		title: cleanText(paper.title) ?? paper.title,
		authors: uniqueByKey((paper.authors ?? []).map((author) => cleanText(author)).filter((author): author is string => Boolean(author)), (author) => author),
		venue: cleanText(paper.venue),
		publisher: cleanText(paper.publisher),
		year: cleanText(paper.year),
		date: cleanText(paper.date),
		doi: normalizeDoi(paper.doi),
		arxivUrl: normalizeUrl(paper.arxivUrl ?? '') ?? paper.arxivUrl,
		publicationUrl: normalizeUrl(paper.publicationUrl ?? '') ?? paper.publicationUrl,
		githubUrl: normalizeUrl(paper.githubUrl ?? '') ?? paper.githubUrl,
		abstract: cleanText(paper.abstract),
		keywords: uniqueByKey((paper.keywords ?? []).map((keyword) => cleanText(keyword)).filter((keyword): keyword is string => Boolean(keyword)), (keyword) => keyword),
		...(links?.length ? { links } : {}),
	};
};

const normalizeEducation = (education: ParsedEducationItem): ParsedEducationItem => ({
	...education,
	title: cleanText(education.title) ?? education.title,
	degree: cleanText(education.degree),
	field_of_study: cleanText(education.field_of_study),
	institution_name: cleanText(education.institution_name),
	location: cleanText(education.location),
	gpa: cleanText(education.gpa),
	description: cleanText(education.description),
});

const normalizeExperience = (experience: ParsedExperienceItem): ParsedExperienceItem => ({
	...experience,
	title: cleanText(experience.title) ?? experience.title,
	company_name: cleanText(experience.company_name),
	location: cleanText(experience.location),
	description: cleanText(experience.description),
	bullets: normalizeBullets(experience.bullets),
	tech_stack: uniqueByKey(
		(experience.tech_stack ?? []).map((skill) => normalizeSkillName(skill)).filter((skill): skill is string => Boolean(skill)),
		(skill) => skill,
	),
	achievements: cleanText(experience.achievements),
});

const normalizeCertification = (certification: ParsedCertificationItem): ParsedCertificationItem => ({
	...certification,
	title: cleanText(certification.title) ?? certification.title,
	issuing_org: cleanText(certification.issuing_org),
	cert_url: normalizeUrl(certification.cert_url ?? '') ?? certification.cert_url,
	credential_id: cleanText(certification.credential_id),
});

const normalizeSkill = (skill: ParsedSkillItem): ParsedSkillItem | undefined => {
	const name = normalizeSkillName(skill.skill_name ?? skill.title);
	if (!name) return undefined;
	return {
		...skill,
		title: name,
		skill_name: name,
		domain_category: cleanText(skill.domain_category),
	};
};

export const normalizeParsedData = (data: ParsedResumeData): ParsedResumeData => ({
	...data,
	education: data.education?.map(normalizeEducation),
	experience: data.experience?.map(normalizeExperience),
	projects: data.projects?.map(normalizeProject),
	researchPapers: data.researchPapers?.map(normalizeResearchPaper),
	skills: data.skills?.map(normalizeSkill).filter((skill): skill is ParsedSkillItem => Boolean(skill)),
	certifications: data.certifications?.map(normalizeCertification),
	extractedLinks: uniqueByKey(data.extractedLinks, (link) => link.normalizedUrl),
});
