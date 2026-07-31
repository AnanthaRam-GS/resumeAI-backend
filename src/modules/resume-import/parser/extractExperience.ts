import type { ParsedExperienceItem } from '../resume-import.schema.js';
import type { ParserContext } from './types.js';
import { parseDateRange } from './dateUtils.js';
import { extractSkills } from './extractSkills.js';
import { itemMeta, normalizeWhitespace, uniqueByKey } from './utils.js';

const ROLE_RE =
	/\b(engineer|developer|manager|analyst|designer|consultant|intern|lead|director|specialist|associate|researcher|assistant)\b/i;

const splitChunks = (lines: string[]): string[][] => {
	const chunks: string[][] = [];
	let current: string[] = [];
	for (const line of lines) {
		const startsNew =
			current.length >= 3 &&
			ROLE_RE.test(line) &&
			!line.startsWith('-') &&
			!/\b(?:19|20)\d{2}\b/.test(line);
		if (startsNew) {
			chunks.push(current);
			current = [];
		}
		current.push(line);
	}
	if (current.length) chunks.push(current);
	return chunks;
};

const parseHeader = (chunk: string[]) => {
	const header =
		chunk.find((line) => !/\b(?:19|20)\d{2}\b/.test(line) && !line.startsWith('-')) ??
		chunk[0] ??
		'';
	const atMatch = header.match(/^(.+?)\s+at\s+(.+)$/i);
	if (atMatch) return { title: atMatch[1]!.trim(), company_name: atMatch[2]!.trim() };
	const parts = header.split(/\s*(?:\|| - |,)\s*/).map((part) => part.trim()).filter(Boolean);
	if (parts.length >= 2) {
		const titleIndex = parts.findIndex((part) => ROLE_RE.test(part));
		if (titleIndex >= 0) {
			return {
				title: parts[titleIndex],
				company_name: parts.find((_, index) => index !== titleIndex),
			};
		}
		return { title: parts[0], company_name: parts[1] };
	}
	return { title: header.trim() };
};

export const extractExperience = (context: ParserContext): ParsedExperienceItem[] => {
	const allSkills = extractSkills(context);
	return uniqueByKey(
		context.sections
			.filter((section) => section.key === 'experience')
			.flatMap((section) =>
				splitChunks(section.lines).flatMap((chunk): ParsedExperienceItem[] => {
					const joined = normalizeWhitespace(chunk.join(' '));
					const header = parseHeader(chunk);
					if (!header.title || /^(experience|internship|employment)$/i.test(header.title)) return [];
					const dateLine = chunk.find((line) => /\b(?:19|20)\d{2}\b.*(?:-|to|–|—)/i.test(line)) ?? '';
					const bullets = uniqueByKey(
						chunk
							.filter((line) => line !== dateLine && line !== header.title && line !== header.company_name)
							.map((line) => line.replace(/^-+\s*/, '').trim())
							.filter((line) => line.length > 8),
						(line) => line,
					);
					const tech = allSkills
						.filter((skill) => joined.toLowerCase().includes((skill.skill_name ?? skill.title).toLowerCase()))
						.map((skill) => skill.skill_name ?? skill.title);
					return [
						{
							title: header.title,
							...(header.company_name ? { company_name: header.company_name } : {}),
							...parseDateRange(joined),
							...(bullets.length ? { bullets, description: bullets.join('\n'), achievements: bullets.join('\n') } : {}),
							...(tech.length ? { tech_stack: uniqueByKey(tech, (item) => item) } : {}),
							_meta: itemMeta(0.76, section.heading, joined),
						},
					];
				}),
			),
		(item) => `${item.title}:${item.company_name ?? ''}:${item.start_date ?? ''}`,
	);
};
