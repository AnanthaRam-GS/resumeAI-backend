import { deleteFile, uploadFile } from '../../services/storage.service.js';
import { parseDocumentIntoPortfolioItems } from '../../services/document-parser.service.js';
import { createPortfolioItem } from '../portfolio/portfolio.service.js';
import {
	createPortfolioItemSchema,
	type CreatePortfolioItemInput,
} from '../portfolio/portfolio.schema.js';
import type { PortfolioItem } from '../portfolio/portfolio.service.js';
import { ValidationError } from '../../utils/errors.js';

export interface DocumentUploadResult {
  documentS3Key: string;
  filename: string;
  extractedItemCount: number;
  extractedItems: PortfolioItem[];
}

export const processDocumentUpload = async (
	userId: string,
	buffer: Buffer,
	mimetype: string,
  filename: string,
): Promise<DocumentUploadResult> => {
	// Store the original uploaded document in S3 before extraction.
	const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
	const documentS3Key = `users/${userId}/uploads/${Date.now()}_${safeFilename}`;
	await uploadFile(documentS3Key, buffer, mimetype);

	try {
		// Parse the uploaded document into structured portfolio items via NVIDIA NIM.
		const parsedItems = await parseDocumentIntoPortfolioItems(buffer, mimetype, filename);

		// Persist extracted items in PostgreSQL, attaching the source document S3 key.
		const createdItems: PortfolioItem[] = [];
		for (const item of parsedItems) {
			const input = createPortfolioItemSchema.safeParse({
				...item,
				source: 'upload',
				document_s3_key: documentS3Key,
				document_filename: filename,
			});

			if (!input.success) {
				throw new ValidationError('No valid portfolio items could be extracted');
			}

			const created = await createPortfolioItem(userId, input.data as CreatePortfolioItemInput);
			createdItems.push(created);
		}

		return {
			documentS3Key,
			filename,
			extractedItemCount: createdItems.length,
			extractedItems: createdItems,
		};
	} catch (originalError) {
		try {
			await deleteFile(documentS3Key);
		} catch (cleanupError) {
			const cleanupMessage =
				cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
			console.error(
				`Failed to cleanup uploaded document ${documentS3Key}: ${cleanupMessage}`,
			);
		}

		throw originalError;
	}
};
