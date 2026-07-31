import type { ResumeSection, ResumeSectionKey } from './types.js';

const HEADING_MAP: Record<string, ResumeSectionKey> = {
	contact: 'header',
	profile: 'summary',
	'personal details': 'header',
	'personal information': 'header',
	summary: 'summary',
	'professional summary': 'summary',
	'career objective': 'summary',
	objective: 'summary',
	'profile summary': 'summary',
	'about me': 'summary',
	education: 'education',
	'academic background': 'education',
	qualifications: 'education',
	'educational qualifications': 'education',
	academics: 'education',
	experience: 'experience',
	'work experience': 'experience',
	'professional experience': 'experience',
	internship: 'experience',
	internships: 'experience',
	employment: 'experience',
	'work history': 'experience',
	projects: 'projects',
	'academic projects': 'projects',
	'technical projects': 'projects',
	'selected projects': 'projects',
	'project work': 'projects',
	'research papers': 'research',
	publications: 'research',
	'research publications': 'research',
	papers: 'research',
	'published papers': 'research',
	'conference papers': 'research',
	'journal publications': 'research',
	preprints: 'research',
	articles: 'research',
	manuscripts: 'research',
	'research work': 'research',
	skills: 'skills',
	'technical skills': 'skills',
	'core skills': 'skills',
	technologies: 'skills',
	tools: 'skills',
	'programming languages': 'skills',
	'areas of expertise': 'skills',
	certifications: 'certifications',
	certificates: 'certifications',
	licenses: 'certifications',
	courses: 'certifications',
	training: 'certifications',
	achievements: 'achievements',
	awards: 'achievements',
	honors: 'achievements',
	accomplishments: 'achievements',
};

const normalizeHeading = (line: string): string =>
	line
		.replace(/[:\-–—]+$/g, '')
		.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
		.trim()
		.toLowerCase();

const headingForLine = (line: string): { key: ResumeSectionKey; heading: string } | undefined => {
	const normalized = normalizeHeading(line);
	if (HEADING_MAP[normalized]) return { key: HEADING_MAP[normalized], heading: line };
	if (line.length > 42) return undefined;
	if (!/^[A-Z][A-Z\s/&-]{2,}$/.test(line)) return undefined;
	const upper = normalizeHeading(line);
	return HEADING_MAP[upper] ? { key: HEADING_MAP[upper], heading: line } : undefined;
};

export const segmentSections = (lines: string[]): ResumeSection[] => {
	const sections: ResumeSection[] = [
		{
			key: 'header',
			heading: 'Header',
			lines: [],
			text: '',
			startLine: 0,
			endLine: 0,
		},
	];

	let current = sections[0]!;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]!;
		const heading = headingForLine(line);
		if (heading) {
			current.endLine = index - 1;
			current.text = current.lines.join('\n');
			current = {
				key: heading.key,
				heading: heading.heading,
				lines: [],
				text: '',
				startLine: index + 1,
				endLine: index + 1,
			};
			sections.push(current);
			continue;
		}
		current.lines.push(line);
		current.endLine = index;
	}

	for (const section of sections) section.text = section.lines.join('\n');
	return sections.filter((section) => section.key === 'header' || section.lines.length > 0);
};

export const getSections = (sections: ResumeSection[], key: ResumeSectionKey): ResumeSection[] =>
	sections.filter((section) => section.key === key);
