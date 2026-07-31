import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { ValidationError } from '../../../utils/errors.js';
import type { ExtractedLink } from '../resume-import.schema.js';
import type { ExtractedResumeDocument, SupportedResumeFileType } from './types.js';
import {
	dedupeLinks,
	classifyLink,
	normalizeUrl,
	parseDoiLinks,
	parseMarkdownLinks,
	parsePlainTextLinks,
	warning,
} from './utils.js';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const detectResumeFileType = (
	mimetype: string,
	filename: string,
): SupportedResumeFileType => {
	const lower = filename.toLowerCase();
	if (mimetype === PDF_MIME || lower.endsWith('.pdf')) return 'pdf';
	if (mimetype === DOCX_MIME || lower.endsWith('.docx')) return 'docx';
	throw new ValidationError('Unsupported file type. Please upload a PDF or DOCX file.');
};

const stripHtml = (html: string): string =>
	html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n')
		.replace(/<\/li>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');

const extractDocxLinksFromHtml = (html: string): ExtractedLink[] =>
	Array.from(html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)).flatMap((match) => {
		const rawUrl = match[1]?.trim();
		const displayText = stripHtml(match[2] ?? '').trim();
		const normalizedUrl = rawUrl ? normalizeUrl(rawUrl) : undefined;
		if (!rawUrl || !normalizedUrl) return [];
		return [
			{
				displayText,
				url: rawUrl,
				normalizedUrl,
				nearbyText: displayText,
				kind: classifyLink(normalizedUrl, displayText, displayText),
			},
		];
	});

export const extractResumeDocument = async (
	buffer: Buffer,
	mimetype: string,
	filename: string,
): Promise<ExtractedResumeDocument> => {
	const fileType = detectResumeFileType(mimetype, filename);

	if (fileType === 'pdf') {
		try {
			const parser = new PDFParse({ data: new Uint8Array(buffer) });
			try {
				const result = await parser.getText({
					parseHyperlinks: true,
					lineEnforce: true,
					cellSeparator: ' | ',
					pageJoiner: '\n',
				});
				const text = result.text.trim();
				const links = dedupeLinks([...parseMarkdownLinks(text), ...parsePlainTextLinks(text), ...parseDoiLinks(text)]);
				const warnings = [];
				if (text.length < 50) {
					warnings.push(
						warning(
							'SCANNED_OR_EMPTY_PDF',
							'This resume appears to be scanned. Please upload a text-based PDF or DOCX.',
							'error',
						),
					);
				}
				return { fileType, text, links, warnings, pageCount: result.total };
			} finally {
				await parser.destroy().catch(() => undefined);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (/password/i.test(message)) {
				throw new ValidationError('This PDF appears to be password-protected. Please upload an unlocked PDF or DOCX.');
			}
			throw new ValidationError('Could not read this PDF. Please upload a valid text-based PDF or DOCX.');
		}
	}

	try {
		const [rawTextResult, htmlResult] = await Promise.all([
			mammoth.extractRawText({ buffer }),
			mammoth.convertToHtml({ buffer }),
		]);
		const text = rawTextResult.value.trim();
		const htmlLinks = extractDocxLinksFromHtml(htmlResult.value);
		const links = dedupeLinks([...htmlLinks, ...parsePlainTextLinks(text), ...parseDoiLinks(text)]);
		return { fileType, text, links, warnings: [] };
	} catch {
		throw new ValidationError('Could not read this DOCX. Please upload a valid DOCX or text-based PDF.');
	}
};
