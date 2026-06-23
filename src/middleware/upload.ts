import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import { ValidationError } from '../utils/errors.js';

const DOCUMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const IMAGE_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const ALLOWED_DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx']);

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

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

const parseMultipartFile = async (
  request: FastifyRequest,
  options: {
    allowedMimeTypes: Set<string>;
    allowedExtensions: Set<string>;
    maxFileSizeBytes: number;
    invalidTypeMessage: string;
    maxSizeMessage: string;
  },
) => {
  if (!request.isMultipart()) {
    throw new ValidationError('Request must be multipart/form-data');
  }

  const data = await request.file();

  if (!data) {
    throw new ValidationError('No file uploaded');
  }

  const { filename, mimetype, file } = data;

  if (!options.allowedMimeTypes.has(mimetype) && !options.allowedExtensions.has(getExtension(filename))) {
    // Drain the stream to prevent memory leak before throwing
    file.resume();
    throw new ValidationError(options.invalidTypeMessage);
  }

  const chunks: Buffer[] = [];
  let totalSize = 0;

  for await (const chunk of file) {
    totalSize += chunk.length;
    if (totalSize > options.maxFileSizeBytes) {
      file.destroy();
      throw new ValidationError(options.maxSizeMessage);
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

export const parseUpload: preHandlerHookHandler = async (request: FastifyRequest) => {
  await parseMultipartFile(request, {
    allowedMimeTypes: ALLOWED_DOCUMENT_MIME_TYPES,
    allowedExtensions: ALLOWED_DOCUMENT_EXTENSIONS,
    maxFileSizeBytes: DOCUMENT_MAX_FILE_SIZE_BYTES,
    invalidTypeMessage: 'Only PDF and DOCX files are supported',
    maxSizeMessage: 'File size must not exceed 10 MB',
  });
};

export const parseImageUpload: preHandlerHookHandler = async (request: FastifyRequest) => {
  await parseMultipartFile(request, {
    allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
    allowedExtensions: ALLOWED_IMAGE_EXTENSIONS,
    maxFileSizeBytes: IMAGE_MAX_FILE_SIZE_BYTES,
    invalidTypeMessage: 'Only JPG, PNG, and WebP images are supported',
    maxSizeMessage: 'Image size must not exceed 5 MB',
  });
};
