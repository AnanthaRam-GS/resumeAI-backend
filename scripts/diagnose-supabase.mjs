import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const envPath = existsSync('.env') ? '.env' : '.env.example';
const env = parse(readFileSync(envPath, 'utf8'));
const databaseUrl = env.SUPABASE_DATABASE_URL || env.DATABASE_URL || '';

const getProjectRefFromUrl = (value) => {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    const directMatch = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
    if (directMatch) return directMatch[1];

    if (url.hostname.endsWith('.pooler.supabase.com')) {
      const userMatch = decodeURIComponent(url.username).match(/^postgres\.([a-z0-9]+)$/);
      if (userMatch) return userMatch[1];
    }
  } catch {
    return undefined;
  }

  return undefined;
};

const configuredRef = getProjectRefFromUrl(databaseUrl);

if (!configuredRef) {
  console.error('Could not determine a Supabase project ref from SUPABASE_DATABASE_URL or DATABASE_URL.');
  process.exit(1);
}

let projects = [];
try {
  const output = execFileSync('supabase', ['projects', 'list', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  projects = JSON.parse(output.slice(output.indexOf('[')));
} catch (error) {
  console.log(`Configured Supabase project ref: ${configuredRef}`);
  console.log('Supabase CLI project list is unavailable. Run `pnpm db:check` for connection validation.');
  process.exit(0);
}

const project = projects.find((entry) => entry.ref === configuredRef);

console.log(`Configured Supabase project ref: ${configuredRef}`);

if (!project) {
  console.error('Configured Supabase project ref was not found in the authenticated Supabase account.');
  console.error('Available projects:');
  for (const entry of projects) {
    console.error(`- ${entry.name} (${entry.ref}) status=${entry.status}`);
  }
  process.exit(1);
}

console.log(`Matched project: ${project.name}`);
console.log(`Project status: ${project.status}`);
console.log(`Database host: ${project.database?.host ?? 'unknown'}`);

const activeStatuses = new Set(['ACTIVE', 'ACTIVE_HEALTHY']);
const status = typeof project.status === 'string' ? project.status : '';

if (!activeStatuses.has(status) && !status.startsWith('ACTIVE_')) {
  console.error('Supabase project is not ACTIVE. Resume/unpause it in Supabase before running signup, migrations, or health checks.');
  process.exit(1);
}

console.log('Supabase project metadata looks active. Run `pnpm db:check` to verify credentials and network access.');
