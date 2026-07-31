import { config } from 'dotenv';
import { z } from 'zod';

const dotenvPath = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';

config({ path: dotenvPath, quiet: true });

const optionalBooleanString = z.preprocess((value) => {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalizedValue)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalizedValue)) {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

const optionalTrimmedString = (schema = z.string().trim().min(1)) =>
  z.preprocess((value) => {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'string' && value.trim() === '') {
      return undefined;
    }

    return value;
  }, schema.optional());

const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    USE_SUPABASE: optionalBooleanString,
    LOCAL_DATABASE_URL: optionalTrimmedString(),
    SUPABASE_DATABASE_URL: optionalTrimmedString(),
    DATABASE_URL: optionalTrimmedString(),
    DIRECT_URL: optionalTrimmedString(),
    SUPABASE_URL: optionalTrimmedString(z.string().trim().url()),
    SUPABASE_ANON_KEY: optionalTrimmedString(),
    SUPABASE_SERVICE_ROLE_KEY: optionalTrimmedString(),
    PGSSLMODE: z
      .enum(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'])
      .optional(),
    PGSSLROOTCERT: optionalTrimmedString(),
    DATABASE_SSL_REJECT_UNAUTHORIZED: optionalBooleanString,
    JWT_SECRET: z.string().trim().min(32, 'JWT_SECRET must be at least 32 characters long'),
    JWT_EXPIRES_IN: z.string().trim().min(1).default('7d'),
    AWS_ACCESS_KEY_ID: z.string().trim().default(''),
    AWS_SECRET_ACCESS_KEY: z.string().trim().default(''),
    AWS_REGION: z.string().trim().default('us-east-1'),
    AWS_S3_BUCKET: z.string().trim().default(''),
    GROQ_API_KEY: optionalTrimmedString(),
    GEMINI_API_KEY: z.string().trim().default(''),
    NVIDIA_API_KEY: z.string().trim().default(''),
    NVIDIA_NIM_API_KEY: z.string().trim().default(''),
    NVIDIA_NIM_BASE_URL: z.string().trim().url().default('https://integrate.api.nvidia.com/v1'),
    NVIDIA_NIM_MODEL: z.string().trim().default('deepseek-ai/deepseek-v4-pro'),
    NVIDIA_NIM_RESUME_PARSER_MODEL: z.string().trim().default('meta/llama-3.3-70b-instruct'),
    NVIDIA_NIM_PARSER_MODEL: optionalTrimmedString(),
    NVIDIA_NIM_PARSER_FALLBACK_MODEL: optionalTrimmedString(),
    NVIDIA_NIM_RESUME_PARSER_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(360000)
      .default(60000),
    NVIDIA_NIM_PARSER_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(360000)
      .default(120000),
    NVIDIA_NIM_RESEARCH_REPAIR_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(360000)
      .default(240000),
    RESUME_PARSER_MODE: optionalTrimmedString(),
    RESUME_PARSER_CONFIDENCE_THRESHOLD: z.coerce
      .number()
      .min(0)
      .max(1)
      .default(0.75),
    NVIDIA_NIM_EMBEDDING_MODEL: optionalTrimmedString(),
    NVIDIA_NIM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(360000).default(30000),
    NVIDIA_NIM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    NVIDIA_NIM_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(60),
    NVIDIA_NIM_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(86400).default(300),
    GITHUB_CLIENT_ID: z.string().trim().default(''),
    GITHUB_CLIENT_SECRET: z.string().trim().default(''),
    APP_BASE_URL: z
      .string()
      .trim()
      .url('APP_BASE_URL must be a valid URL')
      .default('http://localhost:3000'),
    TOKEN_ENCRYPTION_KEY: z
      .string()
      .trim()
      .regex(
        /^[0-9a-fA-F]{64}$/,
        'TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
      )
      .default('0000000000000000000000000000000000000000000000000000000000000000'),
    REDIS_URL: z.string().trim().default('redis://localhost:6379'),
    FRONTEND_URL: optionalTrimmedString(z.string().trim().url('FRONTEND_URL must be a valid URL')),
    WORKERS_ENABLED: optionalBooleanString.default(false),
    USAGE_LIMITS_ENABLED: optionalBooleanString,
    POSTHOG_API_KEY: optionalTrimmedString(),
    POSTHOG_HOST: z.string().trim().url().default('https://app.posthog.com'),
    RESEND_API_KEY: optionalTrimmedString(),
    EMAIL_FROM: z.string().trim().min(1).default('ResumeAI <noreply@example.com>'),
    WS_BASE_URL: optionalTrimmedString(z.string().trim().url()),
    CORS_ALLOWED_ORIGINS: optionalTrimmedString(),
  })
  .superRefine((value, ctx) => {
    const requireProductionSecret = (key: keyof typeof value, message: string) => {
      const current = value[key];
      if (
        value.NODE_ENV === 'production' &&
        (typeof current !== 'string' || current.trim() === '')
      ) {
        ctx.addIssue({ code: 'custom', path: [key], message });
      }
    };

    requireProductionSecret('AWS_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID is required in production');
    requireProductionSecret(
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SECRET_ACCESS_KEY is required in production',
    );
    requireProductionSecret('AWS_S3_BUCKET', 'AWS_S3_BUCKET is required in production');
    requireProductionSecret('GEMINI_API_KEY', 'GEMINI_API_KEY is required in production');
    if (
      value.NODE_ENV === 'production' &&
      value.NVIDIA_API_KEY === '' &&
      value.NVIDIA_NIM_API_KEY === ''
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['NVIDIA_NIM_API_KEY'],
        message: 'NVIDIA_NIM_API_KEY is required in production',
      });
    }

    const githubPartiallyConfigured =
      value.GITHUB_CLIENT_ID !== '' || value.GITHUB_CLIENT_SECRET !== '';
    if (
      githubPartiallyConfigured &&
      (value.GITHUB_CLIENT_ID === '' || value.GITHUB_CLIENT_SECRET === '')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['GITHUB_CLIENT_ID'],
        message:
          'Both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required when GitHub OAuth is enabled',
      });
    }

    if (
      value.NODE_ENV === 'production' &&
      value.TOKEN_ENCRYPTION_KEY ===
        '0000000000000000000000000000000000000000000000000000000000000000'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['TOKEN_ENCRYPTION_KEY'],
        message: 'TOKEN_ENCRYPTION_KEY must be a unique production secret',
      });
    }

    const useSupabase = value.USE_SUPABASE ?? value.NODE_ENV !== 'test';
    const selectedDatabaseUrl = useSupabase
      ? (value.SUPABASE_DATABASE_URL ?? value.DATABASE_URL)
      : (value.LOCAL_DATABASE_URL ?? value.DATABASE_URL);

    if (!selectedDatabaseUrl) {
      ctx.addIssue({
        code: 'custom',
        path: [useSupabase ? 'SUPABASE_DATABASE_URL' : 'LOCAL_DATABASE_URL'],
        message: useSupabase
          ? 'SUPABASE_DATABASE_URL or DATABASE_URL is required when Supabase is enabled'
          : 'LOCAL_DATABASE_URL or DATABASE_URL is required when USE_SUPABASE=false',
      });
    }

    if (useSupabase && !value.DIRECT_URL && selectedDatabaseUrl?.includes('.pooler.supabase.com')) {
      ctx.addIssue({
        code: 'custom',
        path: ['DIRECT_URL'],
        message:
          'DIRECT_URL is required for migrations when SUPABASE_DATABASE_URL or DATABASE_URL uses the Supabase pooler',
      });
    }

    if (value.NODE_ENV === 'production' && !useSupabase) {
      ctx.addIssue({
        code: 'custom',
        path: ['USE_SUPABASE'],
        message: 'Production must use Supabase. Set USE_SUPABASE=true.',
      });
    }

    if (
      value.NODE_ENV === 'production' &&
      selectedDatabaseUrl &&
      /@(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/i.test(selectedDatabaseUrl)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['SUPABASE_DATABASE_URL'],
        message: 'Production database URL must not point to localhost.',
      });
    }
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

const rawEnv = parsedEnv.data;
const useSupabase = rawEnv.USE_SUPABASE ?? rawEnv.NODE_ENV !== 'test';
const selectedDatabaseUrl = useSupabase
  ? (rawEnv.SUPABASE_DATABASE_URL ?? rawEnv.DATABASE_URL)
  : (rawEnv.LOCAL_DATABASE_URL ?? rawEnv.DATABASE_URL);

if (!selectedDatabaseUrl) {
  throw new Error('Invalid environment configuration: no database URL selected');
}

export const env = {
  ...rawEnv,
  USE_SUPABASE: useSupabase,
  DATABASE_URL: selectedDatabaseUrl,
  DIRECT_URL: rawEnv.DIRECT_URL,
  DATABASE_PROVIDER: useSupabase ? 'supabase' : 'local',
  USAGE_LIMITS_ENABLED: rawEnv.USAGE_LIMITS_ENABLED ?? rawEnv.NODE_ENV === 'production',
} as const;

export type Env = typeof env;
