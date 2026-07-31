import type { ParsedEducationItem } from '../resume-import.schema.js';
import type { ParserContext } from './types.js';
import { parseDateRange, parseYearRange } from './dateUtils.js';
import { itemMeta, normalizeWhitespace, uniqueByKey } from './utils.js';

const DEGREE_RE =
	/\b(B\.?\s?Tech|M\.?\s?Tech|B\.?E\.?|M\.?E\.?|B\.?S\.?|M\.?S\.?|B\.?Sc|M\.?Sc|Bachelor(?:'s)?|Master(?:'s)?|MBA|Ph\.?D|Doctor|Associate|Diploma|Class\s+XII|Class\s+X|Higher Secondary)\b/i;

const splitChunks = (lines: string[]): string[][] => {
	const chunks: string[][] = [];
	let current: string[] = [];
	for (const line of lines) {
		const startsNew =
			current.length >= 2 &&
			(DEGREE_RE.test(line) || /^\b(?:19|20)\d{2}\b\s*(?:-|to|–|—)/i.test(line));
		if (startsNew) {
			chunks.push(current);
			current = [];
		}
		current.push(line);
	}
	if (current.length) chunks.push(current);
	return chunks;
};

const parseDegreeAndField = (line: string): { degree?: string; field_of_study?: string } => {
	const withoutGpa = line.replace(/\b(?:C?GPA|GPA)\s*[:-]?\s*[0-9.]+(?:\s*\/\s*[0-9.]+)?/gi, '').trim();
	const withoutDates = withoutGpa
		.replace(/\b(?:19|20)\d{2}\s*(?:-|to|–|—)\s*(?:19|20)\d{2}\b/i, '')
		.trim();
	const degreeMatch = withoutDates.match(DEGREE_RE);
	if (!degreeMatch) return {};
	const degree = degreeMatch[0].replace(/\s+/g, ' ').replace(/B\.?\s?Tech/i, 'B.Tech').replace(/M\.?\s?Tech/i, 'M.Tech');
	const afterDegree = withoutDates.slice((degreeMatch.index ?? 0) + degreeMatch[0].length);
	const field = afterDegree
		.replace(/^[,\s-]*(?:in\s+)?/i, '')
		.split(/\s{2,}|[|;]/)[0]
		?.replace(/\b(?:C?GPA|GPA)\b.*$/i, '')
		.trim();
	return { degree, ...(field ? { field_of_study: field } : {}) };
};

const parseInstitution = (
	lines: string[],
	degreeLine?: string,
): { institution_name?: string; location?: string } => {
	const institutionLine =
		lines.find((line) => line !== degreeLine && /\b(university|college|institute|school|academy|vidyapeetham)\b/i.test(line)) ??
		lines.find((line) => line !== degreeLine && !/\b(?:19|20)\d{2}\b/.test(line) && !/\b(?:C?GPA|GPA)\b/i.test(line));
	if (!institutionLine) return {};
	const parts = institutionLine.split(',').map((part) => part.trim()).filter(Boolean);
	return {
		institution_name: parts[0],
		...(parts.length > 1 ? { location: parts.slice(1).join(', ') } : {}),
	};
};

export const extractEducation = (context: ParserContext): ParsedEducationItem[] => {
	const sections = context.sections.filter((section) => section.key === 'education');
	const items = sections.flatMap((section) =>
		splitChunks(section.lines).flatMap((chunk): ParsedEducationItem[] => {
			const joined = normalizeWhitespace(chunk.join(' '));
			const gpa = joined.match(/\b(?:C?GPA|GPA)\s*[:-]?\s*([0-9.]+(?:\s*\/\s*[0-9.]+)?)/i)?.[1]?.trim();
			const degreeLine =
				chunk.find((line) => DEGREE_RE.test(line)) ??
				chunk.find((line) => /\b(?:19|20)\d{2}\b.*\b(?:B\.?\s?Tech|B\.?E\.?|Class\s+XII)\b/i.test(line));
			const degreeParts = degreeLine ? parseDegreeAndField(degreeLine) : {};
			const institution = parseInstitution(chunk, degreeLine);
			const dates = { ...parseYearRange(joined), ...parseDateRange(joined) };
			const title = degreeParts.degree ?? degreeLine ?? institution.institution_name;
			if (!title || (!degreeParts.degree && !institution.institution_name)) return [];
			return [
				{
					title,
					...degreeParts,
					...institution,
					...(gpa ? { gpa } : {}),
					...dates,
					description: chunk.filter((line) => line !== degreeLine).join(' '),
					_meta: itemMeta(0.82, section.heading, joined),
				},
			];
		}),
	);

	return uniqueByKey(
		items,
		(item) => `${item.degree ?? item.title}:${item.institution_name ?? ''}:${item.end_date ?? ''}`,
	);
};
