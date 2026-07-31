import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const source = resolve('src/db/migrations');
const destination = resolve('dist/db/migrations');

await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });
