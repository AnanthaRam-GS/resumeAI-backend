import type { ParsedResumeData } from '../resume-import.schema.js';

const avg = (values: number[]): number => {
	const present = values.filter((value) => Number.isFinite(value));
	if (!present.length) return 0;
	return present.reduce((sum, value) => sum + value, 0) / present.length;
};

const itemAvg = (items: Array<{ _meta?: { confidence?: number } }> | undefined, fallback: number): number =>
	items?.length ? avg(items.map((item) => item._meta?.confidence ?? fallback)) : 0;

export const withConfidenceScores = (data: ParsedResumeData): ParsedResumeData => {
	const personalInfo = data.personalInfo;
	const personalScore = personalInfo
		? avg(
				Object.values(personalInfo)
					.filter((field): field is NonNullable<typeof field> => Boolean(field))
					.map((field) => field.confidence),
			)
		: data.personal
			? 0.62
			: 0;
	const education = itemAvg(data.education, 0.7);
	const experience = itemAvg(data.experience, 0.7);
	const projects = itemAvg(data.projects, 0.7);
	const researchPapers = itemAvg(data.researchPapers, 0.7);
	const skills = itemAvg(data.skills, 0.7);
	const certifications = itemAvg(data.certifications, 0.7);
	const overall = avg([personalScore, education, experience, projects, researchPapers, skills, certifications].filter((score) => score > 0));
	return {
		...data,
		confidence: {
			overall: Number((overall || 0.5).toFixed(2)),
			personalInfo: Number((personalScore || 0.5).toFixed(2)),
			education: Number((education || 0.5).toFixed(2)),
			experience: Number((experience || 0.5).toFixed(2)),
			projects: Number((projects || 0.5).toFixed(2)),
			researchPapers: Number((researchPapers || 0.5).toFixed(2)),
			skills: Number((skills || 0.5).toFixed(2)),
			certifications: Number((certifications || 0.5).toFixed(2)),
		},
	};
};
