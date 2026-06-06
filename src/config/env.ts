import { config } from 'dotenv';
import { z } from 'zod';

const dotenvPath = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';

config({ path: dotenvPath, quiet: true });

const envSchema = z.object({
	PORT: z.coerce.number().int().min(1).max(65535).default(3000),
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required'),
	JWT_SECRET: z
		.string()
		.trim()
		.min(32, 'JWT_SECRET must be at least 32 characters long'),
	JWT_EXPIRES_IN: z.string().trim().min(1).default('7d'),
	AWS_ACCESS_KEY_ID: z.string().trim().min(1, 'AWS_ACCESS_KEY_ID is required'),
	AWS_SECRET_ACCESS_KEY: z
		.string()
		.trim()
		.min(1, 'AWS_SECRET_ACCESS_KEY is required'),
	AWS_REGION: z.string().trim().min(1, 'AWS_REGION is required'),
	AWS_S3_BUCKET: z.string().trim().min(1, 'AWS_S3_BUCKET is required'),
	GROQ_API_KEY: z.string().trim().min(1, 'GROQ_API_KEY is required'),
	GEMINI_API_KEY: z.string().trim().min(1, 'GEMINI_API_KEY is required'),
});

const formatEnvErrors = (error: z.ZodError) => {
	return error.issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join('.') : 'env';
			return `${path}: ${issue.message}`;
		})
		.join('\n');
};

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
	throw new Error(`Invalid environment configuration:\n${formatEnvErrors(parsedEnv.error)}`);
}

export const env = parsedEnv.data;

export type Env = typeof env;
