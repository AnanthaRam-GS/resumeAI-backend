import { describe, expect, it } from 'vitest';
import { parseAllowedOrigins } from '../../src/utils/cors.js';

describe('parseAllowedOrigins', () => {
  it('splits comma-separated origins and trims whitespace', () => {
    expect(parseAllowedOrigins('https://app.example.com, https://admin.example.com')).toEqual([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
  });

  it('falls back to a safe localhost allowlist when no origins are configured', () => {
    expect(parseAllowedOrigins('')).toEqual(['http://localhost:5173', 'http://127.0.0.1:5173']);
  });

  it('preserves a wildcard origin when explicitly configured', () => {
    expect(parseAllowedOrigins('*')).toEqual(['*']);
  });
});
