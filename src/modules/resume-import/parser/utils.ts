import type { ExtractedLink, ParseWarning } from '../resume-import.schema.js';
import type { ResumeSectionKey } from './types.js';

export const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim();

export const cleanLine = (line: string): string =>
	normalizeWhitespace(
		line
			.replace(/\r/g, '')
			.replace(/[\u2022\u25cf\u25aa\u25ab\u25a0\u25a1\u2043]/g, '-')
			.replace(/^[\s*#|>\-+.,:;()[\]{}]+/, '')
			.replace(/\s*[|]{2,}\s*/g, ' | '),
	);

export const linesFromText = (text: string): string[] =>
	text
		.replace(/\r/g, '\n')
		.split('\n')
		.map(cleanLine)
		.filter(Boolean);

export const uniqueByKey = <T>(items: T[], keyFor: (item: T) => string | undefined): T[] => {
	const seen = new Set<string>();
	return items.filter((item) => {
		const key = keyFor(item)?.trim().toLowerCase();
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

export const normalizeTextKey = (value: string | null | undefined): string =>
	(value ?? '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();

export const normalizeUrl = (value: string): string | undefined => {
	const trimmed = value.trim().replace(/^mailto:/i, '').replace(/[),.;\]]+$/g, '');
	if (!trimmed || trimmed.includes('@')) return undefined;
	const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		const url = new URL(withProtocol);
		if (!['http:', 'https:'].includes(url.protocol)) return undefined;
		url.protocol = 'https:';
		url.hash = '';
		return url.toString().replace(/\/$/g, '');
	} catch {
		return undefined;
	}
};

export const normalizeUrlKey = (value: string | null | undefined): string | null => {
	if (!value) return null;
	const normalized = normalizeUrl(value) ?? value.trim();
	const withoutProtocol = normalized
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/^www\./, '')
		.replace(/\/+$/, '');
	return withoutProtocol || null;
};

export const classifyLink = (url: string, displayText = '', nearbyText = ''): ExtractedLink['kind'] => {
	const normalized = normalizeUrl(url) ?? url.toLowerCase();
	const lower = `${normalized} ${displayText} ${nearbyText}`.toLowerCase();
	if (/\b10\.\d{4,9}\/[-._;()/:a-z0-9]+\b/i.test(lower) || /doi\.org\//i.test(lower)) return 'doi';
	if (/arxiv\.org\/(abs|pdf)\//i.test(lower) || /\barxiv\b/i.test(lower)) return 'arxiv';
	if (/\b(pdf|paper pdf)\b/i.test(lower) && /\.(pdf)(?:$|\?)/i.test(normalized)) return 'paper_pdf';
	if (/@gmail\.com|gmail\.com$/i.test(url) || /^https:\/\/(?:www\.)?gmail\.com/i.test(normalized)) {
		return 'email_domain';
	}
	if (/linkedin\.com\/in\//i.test(lower)) return 'linkedin';
	if (/github\.com\/[^/\s]+\/[^/\s]+/i.test(lower)) return 'github_repo';
	if (/github\.com\/[^/\s]+\/?$/i.test(lower)) return 'github_profile';
	if (/\b(code|source code|supplementary|artifact|repository)\b/i.test(lower) && /github\.com/i.test(lower)) return 'code';
	if (/\b(ieee|springer|acm\.org|dl\.acm|sciencedirect|elsevier|researchgate|scholar\.google|conference|journal|proceedings|publication|paper)\b/i.test(lower)) {
		return 'publication';
	}
	if (/\b(live|demo|preview)\b/i.test(lower)) return 'demo';
	if (/\b(project|repository|source|code|link to project|view project)\b/i.test(lower)) return 'project';
	if (/\b(portfolio|website|personal site)\b/i.test(lower)) return 'portfolio';
	return 'unknown';
};

export const parseDoiLinks = (text: string): ExtractedLink[] =>
	Array.from(text.matchAll(/\b(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/gi)).flatMap(
		(match) => {
			const doi = match[1]?.replace(/[),.;\]]+$/g, '');
			if (!doi) return [];
			const normalizedUrl = `https://doi.org/${doi}`;
			const nearbyText = surroundingText(text, match.index ?? 0);
			return [
				{
					displayText: doi,
					url: match[0] ?? doi,
					normalizedUrl,
					nearbyText,
					kind: 'doi' as const,
				},
			];
		},
	);

export const parseMarkdownLinks = (text: string): ExtractedLink[] =>
	Array.from(text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi)).flatMap((match) => {
		const displayText = match[1]?.trim();
		const url = match[2]?.trim();
		const normalizedUrl = url ? normalizeUrl(url) : undefined;
		if (!url || !normalizedUrl) return [];
		const nearbyText = surroundingText(text, match.index ?? 0);
		return [
			{
				displayText,
				url,
				normalizedUrl,
				nearbyText,
				kind: classifyLink(normalizedUrl, displayText, nearbyText),
			},
		];
	});

export const parsePlainTextLinks = (text: string): ExtractedLink[] =>
	Array.from(
		text.matchAll(
			/\b(?:https?:\/\/|www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s<>)\]]*)?/gi,
		),
	).flatMap((match) => {
		const raw = match[0]?.trim();
		if (!raw || raw.includes('@')) return [];
		const normalizedUrl = normalizeUrl(raw);
		if (!normalizedUrl) return [];
		const nearbyText = surroundingText(text, match.index ?? 0);
		return [
			{
				displayText: raw,
				url: raw,
				normalizedUrl,
				nearbyText,
				kind: classifyLink(normalizedUrl, raw, nearbyText),
			},
		];
	});

export const dedupeLinks = (links: ExtractedLink[]): ExtractedLink[] =>
	uniqueByKey(links, (link) => `${link.normalizedUrl}:${link.displayText ?? ''}`);

export const warning = (
	code: string,
	message: string,
	severity: ParseWarning['severity'] = 'warning',
	field?: string,
	section?: string,
): ParseWarning => ({ code, message, severity, ...(field ? { field } : {}), ...(section ? { section } : {}) });

export const surroundingText = (text: string, index: number, span = 120): string =>
	normalizeWhitespace(text.slice(Math.max(0, index - span), Math.min(text.length, index + span)));

export const field = <T>(
	value: T | undefined,
	confidence: number,
	sourceSection?: ResumeSectionKey | string,
	sourceText?: string,
	warnings: string[] = [],
) =>
	value
		? {
				value,
				confidence,
				...(sourceSection ? { sourceSection } : {}),
				...(sourceText ? { sourceText: sourceText.slice(0, 300) } : {}),
				warnings,
			}
		: undefined;

export const itemMeta = (
	confidence: number,
	sourceSection: ResumeSectionKey | string,
	sourceText: string,
	warnings: string[] = [],
) => ({
	confidence,
	warnings,
	sourceSection,
	sourceText: sourceText.slice(0, 500),
});

export const validUrlOrUndefined = (value: string | undefined): string | undefined =>
	value ? normalizeUrl(value) : undefined;
