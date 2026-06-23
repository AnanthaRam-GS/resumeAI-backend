import { env } from '../src/config/env.js';
import { deleteFile, getSignedUrl, uploadFile } from '../src/services/storage.service.js';

const TEST_CONTENT = 'ResumeAI S3 smoke test';

const run = async () => {
	const objectKey = `smoke-tests/${Date.now()}-resumeai-s3-test.txt`;
	const buffer = Buffer.from(TEST_CONTENT, 'utf8');

	let uploadSuccess = false;
	let signedUrlGenerated = false;
	let deleteSuccess = false;

	try {
		await uploadFile(objectKey, buffer, 'text/plain');
		uploadSuccess = true;

		const signedUrl = await getSignedUrl(objectKey);
		signedUrlGenerated = typeof signedUrl === 'string' && signedUrl.length > 0;

		await deleteFile(objectKey);
		deleteSuccess = true;
	} finally {
		if (uploadSuccess && !deleteSuccess) {
			try {
				await deleteFile(objectKey);
				deleteSuccess = true;
			} catch {
				// Preserve the original failure while still attempting cleanup.
			}
		}

		console.log(
			JSON.stringify(
				{
					objectKey,
					bucket: env.AWS_S3_BUCKET,
					region: env.AWS_REGION,
					uploadSuccess,
					signedUrlGenerated,
					deleteSuccess,
				},
				null,
				2,
			),
		);
	}

	if (!uploadSuccess || !signedUrlGenerated || !deleteSuccess) {
		process.exitCode = 1;
	}
};

void run().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`S3 smoke test failed: ${message}`);
	process.exit(1);
});
