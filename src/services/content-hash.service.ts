import { createHash } from 'node:crypto';

export const sha256 = (input: string | Buffer): string =>
  createHash('sha256').update(input).digest('hex');

export const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

export const normalizeForHash = (value: string): string =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s@.+:/?=&%#_-]/gu, '');

export const hashNormalizedText = (value: string): string =>
  sha256(normalizeForHash(value));

export const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
};

export const hashStableJson = (value: unknown): string => sha256(stableJson(value));

