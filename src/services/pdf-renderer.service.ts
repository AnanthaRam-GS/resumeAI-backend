import puppeteer from 'puppeteer';
import { AppError } from '../utils/errors.js';

export interface PdfRenderOptions {
	format?: 'A4' | 'Letter';
	printBackground?: boolean;
	margin?: {
		top: string;
		right: string;
		bottom: string;
		left: string;
	};
}

const DEFAULT_MARGIN = {
	top: '16mm',
	right: '14mm',
	bottom: '16mm',
	left: '14mm',
};

export const renderHtmlToPdfBuffer = async (
	html: string,
	options: PdfRenderOptions = {},
): Promise<Buffer> => {
	const browser = await puppeteer.launch({
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	});

	try {
		const page = await browser.newPage();
		await page.setContent(html, { waitUntil: 'load' });
		if ('evaluateHandle' in page && typeof page.evaluateHandle === 'function') {
			await page.evaluateHandle('document.fonts.ready');
		}

		const pdf = await page.pdf({
			format: options.format ?? 'A4',
			printBackground: options.printBackground ?? true,
			margin: options.margin ?? DEFAULT_MARGIN,
		});

		return Buffer.from(pdf);
	} catch {
		throw new AppError('Failed to render PDF', 502);
	} finally {
		await browser.close();
	}
};
