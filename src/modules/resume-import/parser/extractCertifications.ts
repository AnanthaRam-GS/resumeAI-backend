import type { ParsedCertificationItem } from '../resume-import.schema.js';
import type { ParserContext } from './types.js';
import { parseMonthYear } from './dateUtils.js';
import { itemMeta, normalizeWhitespace, uniqueByKey } from './utils.js';

export const extractCertifications = (context: ParserContext): ParsedCertificationItem[] =>
	uniqueByKey(
		context.sections
			.filter((section) => section.key === 'certifications')
			.flatMap((section) =>
				section.lines.flatMap((line): ParsedCertificationItem[] => {
					const text = normalizeWhitespace(line);
					if (!text || /^(certifications|certificates|courses)$/i.test(text)) return [];
					const date = parseMonthYear(text);
					const withoutDate = text
						.replace(
							/\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(?:19|20)\d{2}\b/gi,
							'',
						)
						.trim();
					const parts = withoutDate.split(/\s+(?:-|–|—|\bat\b|\bby\b)\s+/i).map((part) => part.trim()).filter(Boolean);
					const url = context.links.find((link) => text.includes(link.url) || text.includes(link.displayText ?? ''));
					const title = parts[0] ?? withoutDate;
					if (!title) return [];
					return [
						{
							title,
							...(parts[1] ? { issuing_org: parts[1] } : {}),
							...(url ? { cert_url: url.normalizedUrl } : {}),
							...(date ? { start_date: date } : {}),
							_meta: itemMeta(0.74, section.heading, text),
						},
					];
				}),
			),
		(item) => `${item.title}:${item.issuing_org ?? ''}:${item.cert_url ?? ''}`,
	);
