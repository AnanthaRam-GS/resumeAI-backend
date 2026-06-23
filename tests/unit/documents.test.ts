import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/utils/errors.js';

const requestNimJsonMock = vi.fn();
const pdfGetTextMock = vi.fn();

vi.mock('../../src/services/nvidia-nim.service.js', () => ({
	requestNimJson: requestNimJsonMock,
}));

vi.mock('pdf-parse', () => ({
	PDFParse: class MockPDFParse {
		getText = pdfGetTextMock;
	},
}));

vi.mock('mammoth', () => ({
	default: {
		extractRawText: vi.fn(async () => ({
			value: 'Sample DOCX text with React and CSS skills.',
		})),
	},
}));

const uploadFileMock = vi.fn();
const getSignedUrlMock = vi.fn();
const deleteFileMock = vi.fn();

vi.mock('../../src/services/storage.service.js', () => ({
	uploadFile: uploadFileMock,
	getSignedUrl: getSignedUrlMock,
	deleteFile: deleteFileMock,
}));

const createPortfolioItemMock = vi.fn();

vi.mock('../../src/modules/portfolio/portfolio.service.js', () => ({
	createPortfolioItem: createPortfolioItemMock,
}));

describe('parseDocumentIntoPortfolioItems (mocked NIM)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		pdfGetTextMock.mockResolvedValue({
			text: 'Sample PDF text with TypeScript and Node.js experience at Google.',
		});
		uploadFileMock.mockResolvedValue('s3-key');
		getSignedUrlMock.mockResolvedValue('https://s3/key');
		deleteFileMock.mockResolvedValue(true);
	});

	it('extracts portfolio items from a PDF buffer', async () => {
		requestNimJsonMock.mockResolvedValueOnce({
			items: [
				{
					type: 'experience',
					title: 'Software Engineer',
					company_name: 'Google',
					description: 'Built TypeScript services',
					tech_stack: ['TypeScript', 'Node.js'],
					start_date: '2022-01-01',
					end_date: '2024-01-01',
				},
			],
		});

		const { parseDocumentIntoPortfolioItems } = await import(
			'../../src/services/document-parser.service.js'
		);

		const items = await parseDocumentIntoPortfolioItems(
			Buffer.from('PDF content'),
			'application/pdf',
			'resume.pdf',
		);

		expect(items).toHaveLength(1);
		expect(items[0]?.type).toBe('experience');
		expect(items[0]?.title).toBe('Software Engineer');
		expect(items[0]?.source).toBe('upload');
		expect(requestNimJsonMock).toHaveBeenCalledWith(
			expect.objectContaining({
				maxTokens: 2000,
				temperature: 0.1,
				userPrompt: expect.stringContaining('TypeScript'),
			}),
		);
	});

	it('extracts items from a DOCX buffer', async () => {
		requestNimJsonMock.mockResolvedValueOnce({
			items: [
				{ type: 'skill', title: 'React', skill_name: 'React' },
				{ type: 'skill', title: 'CSS', skill_name: 'CSS' },
			],
		});

		const { parseDocumentIntoPortfolioItems } = await import(
			'../../src/services/document-parser.service.js'
		);

		const items = await parseDocumentIntoPortfolioItems(
			Buffer.from('DOCX content'),
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'resume.docx',
		);

		expect(items).toHaveLength(2);
		expect(items.every((item) => item.type === 'skill')).toBe(true);
	});

	it('filters out items with missing title or invalid type', async () => {
		requestNimJsonMock.mockResolvedValueOnce({
			items: [
				{ type: 'project', title: '' },
				{ type: 'unknown-type', title: 'X' },
				{
					type: 'experience',
					title: 'Broken Dates',
					start_date: '2024/01/01',
				},
				{
					type: 'skill',
					title: 'Broken Tech Stack',
					tech_stack: ['TypeScript', ''],
				},
				{
					type: 'project',
					title: 'Valid Project',
					description: 'Built a valid upload-safe project entry',
					unsupported_field: 'ignored',
				},
			],
		});

		const { parseDocumentIntoPortfolioItems } = await import(
			'../../src/services/document-parser.service.js'
		);

		const items = await parseDocumentIntoPortfolioItems(
			Buffer.from('PDF text'),
			'application/pdf',
			'resume.pdf',
		);

		expect(items).toHaveLength(1);
		expect(items[0]?.title).toBe('Valid Project');
		expect(items[0]).not.toHaveProperty('unsupported_field');
	});

	it('throws when all extracted items are invalid', async () => {
		requestNimJsonMock.mockResolvedValueOnce({
			items: [
				{ type: 'project', title: '' },
				{ type: 'experience', title: 'Broken Dates', start_date: '2024/01/01' },
				{ type: 'skill', title: 'Broken Tech Stack', tech_stack: ['TypeScript', ''] },
			],
		});

		const { parseDocumentIntoPortfolioItems } = await import(
			'../../src/services/document-parser.service.js'
		);

		await expect(
			parseDocumentIntoPortfolioItems(
				Buffer.from('PDF text'),
				'application/pdf',
				'resume.pdf',
			),
		).rejects.toThrow('No valid portfolio items could be extracted');
	});

	it('throws ValidationError for unsupported file type', async () => {
		const { extractTextFromBuffer } = await import('../../src/services/document-parser.service.js');

		await expect(
			extractTextFromBuffer(Buffer.from('data'), 'image/png', 'photo.png'),
		).rejects.toThrow('Unsupported file type');
	});

	it('rejects DOC files as unsupported', async () => {
		const { extractTextFromBuffer } = await import('../../src/services/document-parser.service.js');

		await expect(
			extractTextFromBuffer(
				Buffer.from('legacy-doc'),
				'application/msword',
				'resume.doc',
			),
		).rejects.toThrow('Unsupported file type');
	});
});

describe('processDocumentUpload (mocked)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		pdfGetTextMock.mockResolvedValue({
			text: 'Sample PDF text with TypeScript and Node.js experience at Acme.',
		});
		uploadFileMock.mockImplementation(async (key: string) => key);
		deleteFileMock.mockResolvedValue(true);
		createPortfolioItemMock.mockImplementation(
			async (_userId: string, input: Record<string, unknown>) => ({
				id: `item-${Math.random()}`,
				...input,
				created_at: new Date(),
				updated_at: new Date(),
			}),
		);
		requestNimJsonMock.mockResolvedValue({
			items: [
				{ type: 'experience', title: 'Software Engineer', company_name: 'Acme' },
				{ type: 'skill', title: 'TypeScript', skill_name: 'TypeScript' },
			],
		});
	});

	it('uploads original file to S3 and creates portfolio items', async () => {
		const { processDocumentUpload } = await import('../../src/modules/documents/documents.service.js');

		const result = await processDocumentUpload(
			'user-1',
			Buffer.from('PDF content'),
			'application/pdf',
			'resume.pdf',
		);

		expect(result.documentS3Key).toContain('users/user-1/uploads/');
		expect(result.filename).toBe('resume.pdf');
		expect(uploadFileMock).toHaveBeenCalledWith(
			expect.stringContaining('users/user-1/uploads/'),
			expect.any(Buffer),
			'application/pdf',
		);
		expect(deleteFileMock).not.toHaveBeenCalled();
	});

	it('creates a portfolio item for each extracted result', async () => {
		const { processDocumentUpload } = await import('../../src/modules/documents/documents.service.js');

		const result = await processDocumentUpload(
			'user-1',
			Buffer.from('PDF content'),
			'application/pdf',
			'resume.pdf',
		);

		expect(result.extractedItemCount).toBe(2);
		expect(result.extractedItems).toHaveLength(2);
		expect(createPortfolioItemMock).toHaveBeenCalledTimes(2);
		expect(createPortfolioItemMock).toHaveBeenNthCalledWith(
			1,
			'user-1',
			expect.objectContaining({
				source: 'upload',
				document_filename: 'resume.pdf',
				document_s3_key: expect.stringContaining('users/user-1/uploads/'),
			}),
		);
	});

	it('ignores invalid extracted items and persists valid ones', async () => {
		requestNimJsonMock.mockResolvedValue({
			items: [
				{ type: 'skill', title: 'TypeScript', skill_name: 'TypeScript' },
				{ type: 'experience', title: 'Broken Dates', start_date: '2024/01/01' },
			],
		});

		const { processDocumentUpload } = await import('../../src/modules/documents/documents.service.js');

		const result = await processDocumentUpload(
			'user-2',
			Buffer.from('mixed PDF'),
			'application/pdf',
			'mixed.pdf',
		);

		expect(result.extractedItemCount).toBe(1);
		expect(result.extractedItems).toHaveLength(1);
		expect(createPortfolioItemMock).toHaveBeenCalledTimes(1);
		expect(createPortfolioItemMock).toHaveBeenCalledWith(
			'user-2',
			expect.objectContaining({
				type: 'skill',
				title: 'TypeScript',
				source: 'upload',
				document_filename: 'mixed.pdf',
			}),
		);
	});

	it('fails the upload when no valid extracted items remain', async () => {
		requestNimJsonMock.mockResolvedValue({
			items: [
				{ type: 'project', title: '' },
				{ type: 'experience', title: 'Broken Dates', start_date: '2024/01/01' },
			],
		});

		const { processDocumentUpload } = await import('../../src/modules/documents/documents.service.js');

		await expect(
			processDocumentUpload(
				'user-1',
				Buffer.from('empty PDF'),
				'application/pdf',
				'blank.pdf',
			),
		).rejects.toThrow('No valid portfolio items could be extracted');
		expect(createPortfolioItemMock).not.toHaveBeenCalled();
		expect(deleteFileMock).toHaveBeenCalledTimes(1);
		expect(deleteFileMock).toHaveBeenCalledWith(
			expect.stringContaining('users/user-1/uploads/'),
		);
	});

	it('deletes the uploaded file when parsing fails after upload', async () => {
		pdfGetTextMock.mockRejectedValueOnce(new Error('PDF parsing failed'));

		const { processDocumentUpload } = await import('../../src/modules/documents/documents.service.js');

		await expect(
			processDocumentUpload(
				'user-3',
				Buffer.from('bad pdf'),
				'application/pdf',
				'broken.pdf',
			),
		).rejects.toThrow('PDF parsing failed');
		expect(uploadFileMock).toHaveBeenCalledTimes(1);
		expect(deleteFileMock).toHaveBeenCalledTimes(1);
		expect(createPortfolioItemMock).not.toHaveBeenCalled();
	});

	it('deletes the uploaded file when portfolio persistence fails', async () => {
		createPortfolioItemMock.mockRejectedValueOnce(new AppError('DB insert failed', 500));

		const { processDocumentUpload } = await import('../../src/modules/documents/documents.service.js');

		await expect(
			processDocumentUpload(
				'user-4',
				Buffer.from('pdf content'),
				'application/pdf',
				'persistence.pdf',
			),
		).rejects.toThrow('DB insert failed');
		expect(deleteFileMock).toHaveBeenCalledTimes(1);
		expect(deleteFileMock).toHaveBeenCalledWith(
			expect.stringContaining('users/user-4/uploads/'),
		);
	});

	it('preserves the original error when cleanup delete fails', async () => {
		requestNimJsonMock.mockResolvedValueOnce({
			items: [
				{ type: 'project', title: '' },
			],
		});
		deleteFileMock.mockRejectedValueOnce(new Error('Delete failed'));

		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { processDocumentUpload } = await import('../../src/modules/documents/documents.service.js');

		await expect(
			processDocumentUpload(
				'user-5',
				Buffer.from('pdf content'),
				'application/pdf',
				'cleanup-failure.pdf',
			),
		).rejects.toThrow('No valid portfolio items could be extracted');
		expect(deleteFileMock).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining('Failed to cleanup uploaded document'),
		);
		errorSpy.mockRestore();
	});
});

describe('upload middleware', () => {
	it('accepts PDF, DOCX, DOC extensions and rejects others', () => {
		const cases: Array<[string, boolean]> = [
			['resume.pdf', true],
			['resume.docx', true],
			['resume.doc', false],
			['photo.png', false],
			['document.txt', false],
			['spreadsheet.xlsx', false],
		];

		const supported = new Set(['.pdf', '.docx']);

		for (const [filename, expected] of cases) {
			const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
			expect(supported.has(ext)).toBe(expected);
		}
	});

	it('accepts standard PDF and DOCX MIME types', () => {
		const supportedMimes = new Set([
			'application/pdf',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		]);

		expect(supportedMimes.has('application/pdf')).toBe(true);
		expect(
			supportedMimes.has('application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
		).toBe(true);
		expect(supportedMimes.has('application/msword')).toBe(false);
		expect(supportedMimes.has('image/jpeg')).toBe(false);
	});
});
