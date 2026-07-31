import crypto from 'crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export const encryptToken = (plaintext: string): string => {
  try {
    const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    // Layout: [12 bytes IV][16 bytes tag][N bytes ciphertext]
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  } catch {
    throw new AppError('Failed to encrypt token', 500);
  }
};

export const decryptToken = (encryptedBase64: string): string => {
  try {
    const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex');
    const data = Buffer.from(encryptedBase64, 'base64');

    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    throw new AppError('Failed to decrypt token — token may be corrupted', 500);
  }
};
