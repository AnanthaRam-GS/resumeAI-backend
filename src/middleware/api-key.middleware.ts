import { timingSafeEqual } from 'node:crypto';
import type { preHandlerHookHandler } from 'fastify';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/errors.js';

const apiKeysMatch = (providedKey: string, expectedKey: string): boolean => {
  const providedBuffer = Buffer.from(providedKey);
  const expectedBuffer = Buffer.from(expectedKey);

  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
};

export const verifyApiKey: preHandlerHookHandler = async (request) => {
  const providedKey = request.headers['x-api-key'];

  if (typeof providedKey !== 'string' || !env.API_KEY || !apiKeysMatch(providedKey, env.API_KEY)) {
    throw new UnauthorizedError('Invalid or missing API key', 'INVALID_API_KEY');
  }
};
