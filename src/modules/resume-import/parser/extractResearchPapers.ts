import type { ExtractedLink, ParsedResearchPaperItem } from '../resume-import.schema.js';
import type { ParserContext } from './types.js';
import {
	itemMeta,
	normalizeTextKey,
	normalizeUrl,
	normalizeWhitespace,
	uniqueByKey,
} from './utils.js';

const DOI_RE = /\b(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i;
const ARXIV_RE = /\b(?:https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/)?(\d{4}\.\d{4,5}(?:v\d+)?)\b/i;
const YEAR_RE = /\b((?:19|20)\d{2})\b/;
const STATUS_RE = /\b(accepted|published|submitted|under review|preprint)\b/i;
const VENUE_RE =
	/\b(?:IEEE|ACM|Springer|Elsevier|ScienceDirect|ResearchGate|Journal|Conference|Proceedings|Workshop|Transactions|Symposium|arXiv)\b[^.;\n]*/i;
const PUBLICATION_TYPE_HINTS: Array<[NonNullable<ParsedResearchPaperItem['publicationType']>, RegExp]> = [
	['preprint', /\b(?:preprint|arxiv)\b/i],
	['workshop', /\bworkshop\b/i],
	['journal', /\b(?:journal|transactions)\b/i],
	['conference', /\b(?:conference|proceedings|symposium|ieee|acm)\b/i],
	['article', /\barticle\b/i],
];
const RESEARCH_LINK_LABEL_RE =
	/\b(?:doi|arxiv|publication|published version|paper|paper pdf|pdf|preprint|code|source code|repository|artifact|supplementary materials?)\b/i;
const DETAIL_START_RE =
	/^(?:authored|co-?authored|wrote|evaluated|evaluating|analyzed|analysed|compared|proposed|presented|described|studied|surveyed|reviewed|implemented|developed|built|created|designed|optimized|integrated|applied|used|leveraged|trained|deployed|achieved|demonstrated|introduced)\b/i;
const DETAIL_SENTENCE_RE =
	/\b(?:research paper|paper evaluating|study evaluating|using|to\s+(?:evaluate|compare|predict|classify|detect|estimate|optimize|improve|analyze|analyse)|that|which)\b/i;
const TITLE_WORDS_RE = /[A-Za-z][A-Za-z-]*/g;

type ResearchChunk = {
	lines: string[];
	links: ExtractedLink[];
};

const cleanResearchLine = (line: string): string =>
	normalizeWhitespace(line.replace(/^[-•\s]+/, '').replace(/\s+/g, ' '));

const hasPublicationEvidence = (text: string): boolean =>
	DOI_RE.test(text) || /arxiv/i.test(text) || VENUE_RE.test(text) || STATUS_RE.test(text) || YEAR_RE.test(text);

const looksLikePaperTitle = (line: string): boolean => {
	const cleaned = cleanTitle(line);
	if (!cleaned || cleaned.length < 8 || cleaned.length > 180) return false;
	if (/^(?:authors?|venue|doi|arxiv|published|accepted|submitted|under review|keywords?|abstract|code|source code|publication|paper|pdf)\b/i.test(cleaned)) return false;
	if (DETAIL_START_RE.test(cleaned)) return false;
	if (/[.!?]$/.test(cleaned) && DETAIL_SENTENCE_RE.test(cleaned)) return false;
	if (/^(?:developed|built|implemented|created|designed|optimized|integrated|applied)\b/i.test(cleaned)) return false;
	return /^[A-Z0-9"']/.test(cleaned);
};

const titleStopPattern =
	/\s+(?:doi\s*:|arxiv\s*:|accepted\b|published\b|submitted\b|under review\b|preprint\b|in\s+(?:ieee|acm|springer|elsevier|journal|conference|proceedings|workshop)\b)/i;

const cleanTitle = (line: string): string =>
	normalizeWhitespace(
		line
			.replace(/\[[^\]]+\]\(https?:\/\/[^)\s]+\)/gi, '')
			.replace(/(?:https?:\/\/|www\.)[^\s),;]+/gi, '')
			.replace(DOI_RE, '')
			.replace(/\barxiv\s*:?\s*\d{4}\.\d{4,5}(?:v\d+)?/gi, '')
			.replace(/(?:\s+(?:doi|arxiv|publication|published version|paper pdf|pdf|preprint|code|source code|repository|artifact|supplementary materials?))*\s*$/i, '')
			.replace(/\s*[-|:,]\s*$/g, ''),
	);

const significantTextKey = (value: string | undefined): string => {
	if (!value) return '';
	const words = value.match(TITLE_WORDS_RE) ?? [];
	return words.length ? normalizeTextKey(words.join(' ')) : normalizeTextKey(value);
};

const textContainsLinkLabel = (textKey: string, link: ExtractedLink): boolean => {
	const labelKey = significantTextKey(link.displayText);
	if (labelKey && labelKey.length >= 4 && textKey.includes(labelKey)) return true;
	const nearbyKey = significantTextKey(link.nearbyText);
	return nearbyKey.length >= 4 && (textKey.includes(nearbyKey) || nearbyKey.includes(textKey.slice(0, 80)));
};

const isResearchDetailLine = (line: string): boolean => {
	const cleaned = cleanResearchLine(line);
	return DETAIL_START_RE.test(cleaned) || (/[.!?]$/.test(cleaned) && DETAIL_SENTENCE_RE.test(cleaned));
};

const TITLE_METADATA_PREFIX_RE =
	/^(?:authors?|venue|doi|arxiv|published|accepted|submitted|under review|keywords?|abstract|code|source code|publication|paper|pdf|year|conference|journal|proceedings|status)\s*[:-]/i;

const extractTitle = (lines: string[]): string | undefined => {
	const titleIdx = lines.findIndex((line) => looksLikePaperTitle(line));
	if (titleIdx === -1) return undefined;

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	let titleRaw: string = lines[titleIdx]!;

	// PDF text extraction can split long titles mid-word across lines
	// (e.g., “Electronic Product Cate” followed by “gories” on the next line).
	// Merge up to 2 continuation lines when the next line starts with a lowercase
	// letter (the reliable signal of a mid-word or wrapped-word break).
	for (let i = titleIdx + 1; i < Math.min(titleIdx + 3, lines.length); i++) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const next = cleanResearchLine(lines[i]!);
		if (!next) break;
		// Metadata labels always terminate the title
		if (TITLE_METADATA_PREFIX_RE.test(next)) break;
		// Strong publication evidence (DOI, year standalone, status keywords) terminates title
		if (DOI_RE.test(next) || STATUS_RE.test(next)) break;
		// Year-only lines or lines starting with a year are publication metadata
		if (/^\(?((?:19|20)\d{2})\)?[.,;\s]*$/.test(next)) break;
		// Detail sentences terminate the title
		if (DETAIL_START_RE.test(next)) break;
		if (/[.!?]$/.test(next) && DETAIL_SENTENCE_RE.test(next)) break;
		const prevEnd = cleanResearchLine(titleRaw);
		const prevWordCount = (prevEnd.match(/\S+/g) ?? []).length;
		// Merge lowercase starts (mid-word PDF break) or uppercase starts when the
		// accumulated title is very short (< 5 words = word-level line wrap).
		const isLowercaseContinuation = /^[a-z]/.test(next);
		const isShortTitleWrap = prevWordCount < 5 && !/[.!?]$/.test(prevEnd);
		if (!isLowercaseContinuation && !isShortTitleWrap) break;
		// Join without space only for mid-word breaks (lowercase + prev ends in letter).
		// Word-level wraps (uppercase continuation) always use a space.
		const joiner = isLowercaseContinuation && /[a-zA-Z]$/.test(prevEnd) ? '' : ' ';
		titleRaw = prevEnd + joiner + next;
	}

	const quoted = titleRaw.match(/[“”]([^””]{8,})[“”]/)?.[1];
	if (quoted) return normalizeWhitespace(quoted);
	const cleaned = cleanTitle(titleRaw);
	const stop = cleaned.search(titleStopPattern);
	const beforeStop = stop > 0 ? cleaned.slice(0, stop) : cleaned;
	const bySplit = beforeStop.split(/\s+\bby\b\s+/i)[0] ?? beforeStop;
	const dashSplit = bySplit.split(/\s+[–—|]\s+/)[0] ?? bySplit;
	return (
		normalizeWhitespace(
			dashSplit
				.replace(/\s*(?:[,;(]\s*)?(?:19|20)\d{2}[).]?\s*$/g, '')
				.replace(/[.;,]+$/g, ''),
		) || undefined
	);
};

const extractAuthors = (text: string, title?: string): string[] | undefined => {
	const labeled = text.match(/\bAuthors?\s*:\s*([^.\n;]+)/i)?.[1];
	const byLine = text.match(/\bby\s+([^.\n;]+?)(?:\s+(?:in|at)\s+|\s+\b(?:IEEE|ACM|Springer|Journal|Conference)\b|,?\s*(?:19|20)\d{2}|$)/i)?.[1];
	const source = labeled ?? byLine;
	if (!source) return undefined;
	const titleKey = normalizeTextKey(title);
	const authors = source
		.split(/\s*(?:,|;| and | & )\s*/i)
		.map((author) => normalizeWhitespace(author.replace(/\bet al\.?$/i, '')))
		.filter((author) => author.length >= 2 && normalizeTextKey(author) !== titleKey);
	return authors.length ? uniqueByKey(authors, (author) => author) : undefined;
};

const doiFromText = (text: string): string | undefined => text.match(DOI_RE)?.[1]?.replace(/[),.;\]]+$/g, '');

const arxivUrlFromText = (text: string, links: ExtractedLink[]): string | undefined => {
	const link = links.find((item) => item.kind === 'arxiv')?.normalizedUrl;
	if (link) return link;
	const id = text.match(ARXIV_RE)?.[1];
	return id ? `https://arxiv.org/abs/${id}` : undefined;
};

const statusFromText = (text: string): ParsedResearchPaperItem['status'] => {
	const status = text.match(STATUS_RE)?.[1]?.toLowerCase().replace(/\s+/g, '_');
	if (status === 'under_review') return 'under_review';
	if (status === 'accepted' || status === 'published' || status === 'submitted' || status === 'preprint') return status;
	return /arxiv/i.test(text) ? 'preprint' : 'unknown';
};

const typeFromText = (text: string): ParsedResearchPaperItem['publicationType'] =>
	PUBLICATION_TYPE_HINTS.find(([, regex]) => regex.test(text))?.[0] ?? 'unknown';

const venueFromText = (text: string): string | undefined =>
	normalizeWhitespace(text.match(/\b(?:in|at)\s+([^.;\n]*(?:IEEE|ACM|Springer|Journal|Conference|Proceedings|Workshop|Symposium|Transactions)[^.;\n]*)/i)?.[1] ?? text.match(VENUE_RE)?.[0] ?? '') || undefined;

const publisherFromText = (text: string): string | undefined =>
	['IEEE', 'ACM', 'Springer', 'Elsevier', 'ScienceDirect', 'ResearchGate'].find((publisher) =>
		new RegExp(`\\b${publisher}\\b`, 'i').test(text),
	);

const keywordsFromText = (text: string): string[] | undefined => {
	const raw = text.match(/\bKeywords?\s*:\s*([^\n.]+)/i)?.[1];
	if (!raw) return undefined;
	const keywords = raw
		.split(/[,;|]/)
		.map((keyword) => normalizeWhitespace(keyword))
		.filter((keyword) => keyword.length > 1 && keyword.length < 50);
	return keywords.length ? uniqueByKey(keywords, (keyword) => keyword) : undefined;
};

const abstractFromLines = (lines: string[], title?: string): string | undefined => {
	const abstractLine = lines.find((line) => /^abstract\b/i.test(line));
	if (abstractLine) return normalizeWhitespace(abstractLine.replace(/^abstract\s*:?\s*/i, ''));
	const detailLines = lines.filter((line) => /^(?:description|summary)\b/i.test(line));
	const cleaned = detailLines.map((line) => normalizeWhitespace(line.replace(/^(?:description|summary)\s*:?\s*/i, '')));
	if (cleaned.length) return cleaned.join('\n');
	const titleKey = normalizeTextKey(title);
	const inferred = lines
		.filter((line) => {
			const lineKey = normalizeTextKey(cleanTitle(line));
			if (!lineKey || lineKey === titleKey) return false;
			if (/^(?:authors?|venue|doi|arxiv|published|accepted|submitted|under review|keywords?|code|source code|publication|paper|pdf)\b/i.test(line)) return false;
			return isResearchDetailLine(line);
		})
		.map((line) => normalizeWhitespace(line));
	return inferred.length ? inferred.join('\n') : undefined;
};

const linksForResearchText = (text: string, allLinks: ExtractedLink[]): ExtractedLink[] => {
	const textKey = normalizeTextKey(text);
	return uniqueByKey(
		allLinks.filter((link) => {
			if (['doi', 'arxiv', 'publication', 'paper_pdf', 'github_repo', 'code', 'unknown'].includes(link.kind)) {
				const nearby = normalizeTextKey(link.nearbyText ?? '');
				return (
					text.includes(link.normalizedUrl) ||
					text.includes(link.url) ||
					(nearby && textKey.includes(nearby.slice(0, 80))) ||
					textContainsLinkLabel(textKey, link)
				);
			}
			return false;
		}),
		(link) => link.normalizedUrl,
	);
};

const buildChunks = (lines: string[], allLinks: ExtractedLink[]): ResearchChunk[] => {
	const chunks: ResearchChunk[] = [];
	let current: ResearchChunk | undefined;

	for (const rawLine of lines) {
		const line = cleanResearchLine(rawLine);
		if (!line) continue;
		const source = current?.lines.join(' ') ?? '';
		const startsNew =
			Boolean(current?.lines.length) &&
			hasPublicationEvidence(source) &&
			looksLikePaperTitle(line) &&
			!isResearchDetailLine(line) &&
			!/^abstract\b|^keywords?\b|^doi\b|^arxiv\b/i.test(line);

		if (!current || startsNew) {
			current = { lines: [line], links: [] };
			chunks.push(current);
		} else {
			current.lines.push(line);
		}
		current.links = linksForResearchText(current.lines.join('\n'), allLinks);
	}

	return chunks;
};

const chunkToResearchPaper = (chunk: ResearchChunk, heading: string): ParsedResearchPaperItem | undefined => {
	const sourceText = chunk.lines.join('\n');
	const sourceInline = chunk.lines.join(' ');
	const links = uniqueByKey([...chunk.links, ...linksForResearchText(sourceInline, chunk.links)], (link) => link.normalizedUrl);
	const title = extractTitle(chunk.lines);
	if (!title) return undefined;
	const doi = doiFromText(sourceInline) ?? links.find((link) => link.kind === 'doi')?.normalizedUrl.replace(/^https:\/\/doi\.org\//i, '');
	const arxivUrl = arxivUrlFromText(sourceInline, links);
	const publicationUrl =
		links.find((link) => link.kind === 'publication' || link.kind === 'paper_pdf')?.normalizedUrl ??
		links.find((link) => RESEARCH_LINK_LABEL_RE.test(`${link.displayText ?? ''} ${link.nearbyText ?? ''}`) && !/github\.com/i.test(link.normalizedUrl))?.normalizedUrl;
	const githubUrl = links.find((link) => link.kind === 'code' || link.kind === 'github_repo')?.normalizedUrl;
	const year = sourceInline.match(YEAR_RE)?.[1];
	const warnings: string[] = [];
	const evidenceCount = [doi, arxivUrl, publicationUrl, githubUrl, venueFromText(sourceInline), year].filter(Boolean).length;
	if (evidenceCount === 0) warnings.push('Research paper has limited publication evidence.');
	const confidence = evidenceCount >= 2 ? 0.86 : evidenceCount === 1 ? 0.72 : 0.52;

	return {
		title,
		...(extractAuthors(sourceText, title) ? { authors: extractAuthors(sourceText, title) } : {}),
		...(venueFromText(sourceInline) ? { venue: venueFromText(sourceInline) } : {}),
		publicationType: typeFromText(sourceInline),
		...(publisherFromText(sourceInline) ? { publisher: publisherFromText(sourceInline) } : {}),
		...(year ? { year } : {}),
		...(doi ? { doi } : {}),
		...(arxivUrl ? { arxivUrl: normalizeUrl(arxivUrl) ?? arxivUrl } : {}),
		...(publicationUrl ? { publicationUrl } : {}),
		...(githubUrl ? { githubUrl } : {}),
		...(abstractFromLines(chunk.lines, title) ? { abstract: abstractFromLines(chunk.lines, title) } : {}),
		...(keywordsFromText(sourceInline) ? { keywords: keywordsFromText(sourceInline) } : {}),
		status: statusFromText(sourceInline),
		...(links.length ? { links } : {}),
		_meta: itemMeta(confidence, heading, sourceText, warnings),
	};
};

export const extractResearchPapers = (context: ParserContext): ParsedResearchPaperItem[] =>
	uniqueByKey(
		context.sections
			.filter((section) => section.key === 'research')
			.flatMap((section) =>
				buildChunks(section.lines, context.links)
					.map((chunk) => chunkToResearchPaper(chunk, section.heading))
					.filter((paper): paper is ParsedResearchPaperItem => Boolean(paper)),
			),
		(paper) => `${normalizeTextKey(paper.title)}:${paper.year ?? ''}:${paper.doi ?? paper.arxivUrl ?? paper.publicationUrl ?? ''}`,
	);
