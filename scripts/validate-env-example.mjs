import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const requiredExampleKeys = [
  'NODE_ENV',
  'PORT',
  'USE_SUPABASE',
  'SUPABASE_DATABASE_URL',
  'DIRECT_URL',
  'PGSSLMODE',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'API_KEY',
  'NVIDIA_NIM_API_KEY',
  'NVIDIA_NIM_BASE_URL',
  'NVIDIA_NIM_MODEL',
  'APP_BASE_URL',
  'FRONTEND_URL',
  'TOKEN_ENCRYPTION_KEY',
  'REDIS_URL',
  'WORKERS_ENABLED',
  'CORS_ALLOWED_ORIGINS',
];

const requiredTestKeys = [
  'NODE_ENV',
  'PORT',
  'USE_SUPABASE',
  'LOCAL_DATABASE_URL',
  'TEST_DATABASE_URL',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'API_KEY',
  'APP_BASE_URL',
  'FRONTEND_URL',
  'TOKEN_ENCRYPTION_KEY',
];

const unsafePatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /ghp_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
];

const readEnvFile = (path) => parse(readFileSync(path, 'utf8'));

const assertRequiredKeys = (env, keys, path) => {
  const missing = keys.filter((key) => !(key in env));
  if (missing.length > 0) {
    throw new Error(`${path} is missing required keys: ${missing.join(', ')}`);
  }
};

const assertSafeValues = (env, path) => {
  for (const [key, value] of Object.entries(env)) {
    if (unsafePatterns.some((pattern) => pattern.test(value))) {
      throw new Error(`${path} appears to contain a real secret in ${key}`);
    }
  }
};

const example = readEnvFile('.env.example');
const testExample = readEnvFile('.env.test.example');

assertRequiredKeys(example, requiredExampleKeys, '.env.example');
assertRequiredKeys(testExample, requiredTestKeys, '.env.test.example');
assertSafeValues(example, '.env.example');
assertSafeValues(testExample, '.env.test.example');

if (example.USE_SUPABASE !== 'true') {
  throw new Error('.env.example must default USE_SUPABASE=true');
}

if (testExample.USE_SUPABASE !== 'false') {
  throw new Error('.env.test.example must keep USE_SUPABASE=false');
}

console.log('Environment examples are complete and safe.');
