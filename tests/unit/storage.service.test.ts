import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { AppError } from '../../src/utils/errors.js';

const sendMock = vi.fn();
const presignMock = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
	class MockS3Client {
		send = sendMock;
	}

	class MockPutObjectCommand {
		input: unknown;

		constructor(input: unknown) {
			this.input = input;
		}
	}

	class MockGetObjectCommand {
		input: unknown;

		constructor(input: unknown) {
			this.input = input;
		}
	}

	class MockDeleteObjectCommand {
		input: unknown;

		constructor(input: unknown) {
			this.input = input;
		}
	}

	return {
		S3Client: MockS3Client,
		PutObjectCommand: MockPutObjectCommand,
		GetObjectCommand: MockGetObjectCommand,
		DeleteObjectCommand: MockDeleteObjectCommand,
	};
});

vi.mock('@aws-sdk/s3-request-presigner', () => {
	return {
		getSignedUrl: presignMock,
	};
});

const loadService = async () => {
	return import('../../src/services/storage.service.js');
};

describe('storage service', () => {
	beforeEach(() => {
		sendMock.mockReset();
		presignMock.mockReset();
	});

	it('uploads a file and returns the object key', async () => {
		sendMock.mockResolvedValueOnce({});
		const { uploadFile } = await loadService();
		const buffer = Buffer.from('resume');

		const key = await uploadFile('users/user-1/resumes/resume.pdf', buffer, 'application/pdf');

		expect(key).toBe('users/user-1/resumes/resume.pdf');
		expect(sendMock).toHaveBeenCalledTimes(1);
		const [command] = sendMock.mock.calls[0] as [PutObjectCommand];
		expect(command).toBeInstanceOf(PutObjectCommand);
		expect(command.input).toMatchObject({
			Bucket: env.AWS_S3_BUCKET,
			Key: 'users/user-1/resumes/resume.pdf',
			Body: buffer,
			ContentType: 'application/pdf',
		});
	});

	it('generates a signed url with the default expiry', async () => {
		presignMock.mockResolvedValueOnce('https://signed.example.com/file.pdf');
		const { getSignedUrl, s3Client, DEFAULT_SIGNED_URL_EXPIRY_SECONDS } = await loadService();

		const url = await getSignedUrl('users/user-1/resumes/resume.pdf');

		expect(url).toBe('https://signed.example.com/file.pdf');
		expect(presignMock).toHaveBeenCalledTimes(1);
		const [client, command, options] = presignMock.mock.calls[0] as [
			typeof s3Client,
			GetObjectCommand,
			{ expiresIn: number },
		];
		expect(client).toBe(s3Client);
		expect(command).toBeInstanceOf(GetObjectCommand);
		expect(command.input).toMatchObject({
			Bucket: env.AWS_S3_BUCKET,
			Key: 'users/user-1/resumes/resume.pdf',
		});
		expect(options).toEqual({ expiresIn: DEFAULT_SIGNED_URL_EXPIRY_SECONDS });
	});

	it('deletes a file and returns success', async () => {
		sendMock.mockResolvedValueOnce({});
		const { deleteFile } = await loadService();

		const deleted = await deleteFile('users/user-1/documents/portfolio.pdf');

		expect(deleted).toBe(true);
		expect(sendMock).toHaveBeenCalledTimes(1);
		const [command] = sendMock.mock.calls[0] as [DeleteObjectCommand];
		expect(command).toBeInstanceOf(DeleteObjectCommand);
		expect(command.input).toMatchObject({
			Bucket: env.AWS_S3_BUCKET,
			Key: 'users/user-1/documents/portfolio.pdf',
		});
	});

	it('wraps upload failures in an AppError', async () => {
		sendMock.mockRejectedValueOnce(new Error('aws failure'));
		const { uploadFile } = await loadService();

		await expect(uploadFile('broken-key', Buffer.from('resume'), 'application/pdf')).rejects.toMatchObject<AppError>({
			message: 'Failed to upload file to storage',
			statusCode: 502,
		});
	});

	it('wraps signed url failures in an AppError', async () => {
		presignMock.mockRejectedValueOnce(new Error('aws failure'));
		const { getSignedUrl } = await loadService();

		await expect(getSignedUrl('broken-key')).rejects.toMatchObject<AppError>({
			message: 'Failed to generate signed URL',
			statusCode: 502,
		});
	});

	it('wraps delete failures in an AppError', async () => {
		sendMock.mockRejectedValueOnce(new Error('aws failure'));
		const { deleteFile } = await loadService();

		await expect(deleteFile('broken-key')).rejects.toMatchObject<AppError>({
			message: 'Failed to delete file from storage',
			statusCode: 502,
		});
	});
});
