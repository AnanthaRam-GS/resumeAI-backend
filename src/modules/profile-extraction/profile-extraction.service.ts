import { profileExtractionPrompt } from '../ai/prompts/profile-extraction.prompt.js';
import { extractTextFromBuffer } from '../../services/document-parser.service.js';
import { requestGeminiJson } from '../../services/gemini.service.js';
import { ValidationError } from '../../utils/errors.js';
import {
  profileExtractionSchema,
  type ProfileExtraction,
  type ProfileExtractionModelOutput,
} from './profile-extraction.schema.js';

const MIN_READABLE_TEXT_LENGTH = 20;
const MAX_RESUME_TEXT_LENGTH = 8000;

export const extractProfile = async (
  buffer: Buffer,
  mimetype: string,
  filename: string,
): Promise<ProfileExtraction> => {
  let resumeText: string;

  try {
    resumeText = await extractTextFromBuffer(buffer, mimetype, filename);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new ValidationError('Could not extract readable text from the uploaded document');
  }

  if (resumeText.length < MIN_READABLE_TEXT_LENGTH) {
    throw new ValidationError('Could not extract readable text from the uploaded document');
  }

  const modelOutput = await requestGeminiJson<ProfileExtractionModelOutput>({
    systemPrompt: profileExtractionPrompt,
    userPrompt: resumeText.slice(0, MAX_RESUME_TEXT_LENGTH),
    maxOutputTokens: 1000,
    temperature: 0.1,
  });

  const result = profileExtractionSchema.safeParse(modelOutput);
  if (!result.success) {
    throw new ValidationError('Gemini returned an invalid profile extraction response');
  }

  return result.data;
};
