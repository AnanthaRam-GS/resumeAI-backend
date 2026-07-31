import {
	DeleteObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presignUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 900;

const s3Client = new S3Client({
	region: env.AWS_REGION,
	credentials: {
		accessKeyId: env.AWS_ACCESS_KEY_ID,
		secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
	},
});

const ensureStorageConfigured = (): void => {
	if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_S3_BUCKET) {
		throw new AppError('File storage is not configured for this environment', 503, 'STORAGE_NOT_CONFIGURED');
	}
};

const wrapStorageError = (message: string): AppError => {
	return new AppError(message, 502);
};

export const uploadFile = async (
	key: string,
	buffer: Buffer,
	contentType: string,
): Promise<string> => {
	ensureStorageConfigured();
	try {
		await s3Client.send(
			new PutObjectCommand({
				Bucket: env.AWS_S3_BUCKET,
				Key: key,
				Body: buffer,
				ContentType: contentType,
			}),
		);

		return key;
	} catch {
		throw wrapStorageError('Failed to upload file to storage');
	}
};

export const getSignedUrl = async (
	key: string,
	expiresIn = DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
): Promise<string> => {
	ensureStorageConfigured();
	try {
		return await presignUrl(
			s3Client,
			new GetObjectCommand({
				Bucket: env.AWS_S3_BUCKET,
				Key: key,
			}),
			{ expiresIn },
		);
	} catch {
		throw wrapStorageError('Failed to generate signed URL');
	}
};

export const downloadFile = async (key: string): Promise<Buffer> => {
	ensureStorageConfigured();
	try {
		const result = await s3Client.send(
			new GetObjectCommand({
				Bucket: env.AWS_S3_BUCKET,
				Key: key,
			}),
		);
		if (!result.Body) throw new Error('Empty storage body');
		const chunks: Buffer[] = [];
		for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
			chunks.push(Buffer.from(chunk));
		}
		return Buffer.concat(chunks);
	} catch {
		throw wrapStorageError('Failed to download file from storage');
	}
};

export const deleteFile = async (key: string): Promise<boolean> => {
	ensureStorageConfigured();
	try {
		await s3Client.send(
			new DeleteObjectCommand({
				Bucket: env.AWS_S3_BUCKET,
				Key: key,
			}),
		);

		return true;
	} catch {
		throw wrapStorageError('Failed to delete file from storage');
	}
};

export { DEFAULT_SIGNED_URL_EXPIRY_SECONDS, s3Client };
