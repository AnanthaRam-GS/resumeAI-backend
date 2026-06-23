import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';

const processDocumentUploadMock = vi.fn();

vi.mock('../../src/modules/documents/documents.service.js', () => ({
	processDocumentUpload: processDocumentUploadMock,
}));

const loadApp = async () => {
	const { buildApp } = await import('../../src/app.js');
	return buildApp();
};

const createToken = (userId = 'user-123', email = 'test@example.com') =>
	jwt.sign({ userId, email }, env.JWT_SECRET, { expiresIn: '1h' });

type MultipartPart = {
	name: string;
	value: Buffer | string;
	filename?: string;
	contentType?: string;
};

const createMultipartPayload = (parts: MultipartPart[]) => {
	const boundary = `----resumeai-test-boundary-${Date.now()}`;
	const chunks: Buffer[] = [];

	for (const part of parts) {
		chunks.push(Buffer.from(`--${boundary}\r\n`));

		const disposition = part.filename
			? `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`
			: `Content-Disposition: form-data; name="${part.name}"\r\n`;

		chunks.push(Buffer.from(disposition));

		if (part.contentType) {
			chunks.push(Buffer.from(`Content-Type: ${part.contentType}\r\n`));
		}

		chunks.push(Buffer.from('\r\n'));
		chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value));
		chunks.push(Buffer.from('\r\n'));
	}

	chunks.push(Buffer.from(`--${boundary}--\r\n`));

	return {
		boundary,
		body: Buffer.concat(chunks),
	};
};

describe('document upload route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		processDocumentUploadMock.mockResolvedValue({
			documentS3Key: 'users/user-123/uploads/123_resume.pdf',
			filename: 'resume.pdf',
			extractedItemCount: 2,
			extractedItems: [
				{
					id: 'item-1',
					type: 'experience',
					source: 'upload',
					title: 'Software Engineer',
				},
				{
					id: 'item-2',
					type: 'skill',
					source: 'upload',
					title: 'TypeScript',
				},
			],
		});
	});

	it('returns 401 when the token is missing', async () => {
		const app = await loadApp();
		await app.ready();

		const response = await app.inject({
			method: 'POST',
			url: '/portfolio/upload',
		});

		expect(response.statusCode).toBe(401);
		expect(response.json()).toEqual({
			success: false,
			message: 'Missing bearer token',
		});
		expect(processDocumentUploadMock).not.toHaveBeenCalled();

		await app.close();
	});

	it('returns 401 when the token is invalid', async () => {
		const app = await loadApp();
		await app.ready();

		const response = await app.inject({
			method: 'POST',
			url: '/portfolio/upload',
			headers: {
				authorization: 'Bearer invalid.token.value',
			},
		});

		expect(response.statusCode).toBe(401);
		expect(response.json()).toEqual({
			success: false,
			message: 'Invalid or expired token',
		});
		expect(processDocumentUploadMock).not.toHaveBeenCalled();

		await app.close();
	});

	it('returns 422 when the multipart request contains no file', async () => {
		const app = await loadApp();
		await app.ready();

		const multipart = createMultipartPayload([
			{ name: 'note', value: 'no file here' },
		]);

		const response = await app.inject({
			method: 'POST',
			url: '/portfolio/upload',
			headers: {
				authorization: `Bearer ${createToken()}`,
				'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
			},
			payload: multipart.body,
		});

		expect(response.statusCode).toBe(422);
		expect(response.json()).toMatchObject({
			success: false,
			message: 'No file uploaded',
		});
		expect(processDocumentUploadMock).not.toHaveBeenCalled();

		await app.close();
	});

	it('returns 422 for an unsupported file type', async () => {
		const app = await loadApp();
		await app.ready();

		const multipart = createMultipartPayload([
			{
				name: 'file',
				filename: 'avatar.png',
				contentType: 'image/png',
				value: Buffer.from('png-content'),
			},
		]);

		const response = await app.inject({
			method: 'POST',
			url: '/portfolio/upload',
			headers: {
				authorization: `Bearer ${createToken()}`,
				'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
			},
			payload: multipart.body,
		});

		expect(response.statusCode).toBe(422);
		expect(response.json()).toMatchObject({
			success: false,
			message: 'Only PDF and DOCX files are supported',
		});
		expect(processDocumentUploadMock).not.toHaveBeenCalled();

		await app.close();
	});

	it('returns 422 for DOC uploads', async () => {
		const app = await loadApp();
		await app.ready();

		const multipart = createMultipartPayload([
			{
				name: 'file',
				filename: 'resume.doc',
				contentType: 'application/msword',
				value: Buffer.from('legacy-doc-content'),
			},
		]);

		const response = await app.inject({
			method: 'POST',
			url: '/portfolio/upload',
			headers: {
				authorization: `Bearer ${createToken()}`,
				'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
			},
			payload: multipart.body,
		});

		expect(response.statusCode).toBe(422);
		expect(response.json()).toMatchObject({
			success: false,
			message: 'Only PDF and DOCX files are supported',
		});
		expect(processDocumentUploadMock).not.toHaveBeenCalled();

		await app.close();
	});

	it('returns 422 for an empty uploaded file', async () => {
		const app = await loadApp();
		await app.ready();

		const multipart = createMultipartPayload([
			{
				name: 'file',
				filename: 'resume.pdf',
				contentType: 'application/pdf',
				value: Buffer.alloc(0),
			},
		]);

		const response = await app.inject({
			method: 'POST',
			url: '/portfolio/upload',
			headers: {
				authorization: `Bearer ${createToken()}`,
				'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
			},
			payload: multipart.body,
		});

		expect(response.statusCode).toBe(422);
		expect(response.json()).toMatchObject({
			success: false,
			message: 'Uploaded file is empty',
		});
		expect(processDocumentUploadMock).not.toHaveBeenCalled();

		await app.close();
	});

	it('returns 201 for a successful upload', async () => {
		const app = await loadApp();
		await app.ready();

		const multipart = createMultipartPayload([
			{
				name: 'file',
				filename: 'resume.pdf',
				contentType: 'application/pdf',
				value: Buffer.from('ResumeAI route upload test PDF'),
			},
		]);

		const response = await app.inject({
			method: 'POST',
			url: '/portfolio/upload',
			headers: {
				authorization: `Bearer ${createToken()}`,
				'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
			},
			payload: multipart.body,
		});

		expect(response.statusCode).toBe(201);
		expect(response.json()).toEqual({
			success: true,
			message: 'Document processed. 2 portfolio items extracted.',
			data: {
				documentS3Key: 'users/user-123/uploads/123_resume.pdf',
				filename: 'resume.pdf',
				extractedItemCount: 2,
				extractedItems: [
					{
						id: 'item-1',
						type: 'experience',
						source: 'upload',
						title: 'Software Engineer',
					},
					{
						id: 'item-2',
						type: 'skill',
						source: 'upload',
						title: 'TypeScript',
					},
				],
			},
		});
		expect(processDocumentUploadMock).toHaveBeenCalledTimes(1);
		expect(processDocumentUploadMock).toHaveBeenCalledWith(
			'user-123',
			expect.any(Buffer),
			'application/pdf',
			'resume.pdf',
		);

		await app.close();
	});
});
