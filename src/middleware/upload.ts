import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import { ValidationError } from '../utils/errors.js';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.doc']);

export interface UploadedFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

declare module 'fastify' {
  interface FastifyRequest {
    uploadedFile?: UploadedFile;
  }
}

const getExtension = (filename: string): string => {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
};

export const parseUpload: preHandlerHookHandler = async (request: FastifyRequest) => {
  if (!request.isMultipart()) {
    throw new ValidationError('Request must be multipart/form-data');
  }

  const data = await request.file();

  if (!data) {
    throw new ValidationError('No file uploaded');
  }

  const { filename, mimetype, file } = data;

  if (!ALLOWED_MIME_TYPES.has(mimetype) && !ALLOWED_EXTENSIONS.has(getExtension(filename))) {
    // Drain the stream to prevent memory leak before throwing
    file.resume();
    throw new ValidationError('Only PDF and DOCX files are supported');
  }

  const chunks: Buffer[] = [];
  let totalSize = 0;

  for await (const chunk of file) {
    totalSize += chunk.length;
    if (totalSize > MAX_FILE_SIZE_BYTES) {
      file.destroy();
      throw new ValidationError('File size must not exceed 10 MB');
    }
    chunks.push(chunk as Buffer);
  }

  if (totalSize === 0) {
    throw new ValidationError('Uploaded file is empty');
  }

  request.uploadedFile = {
    filename,
    mimetype,
    buffer: Buffer.concat(chunks),
  };
};
