import { ValidationError } from '../utils/errors.js';

export const SUPPORTED_OUTPUT_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'hi', label: 'Hindi' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'pt', label: 'Portuguese' },
] as const;

export type SupportedOutputLanguage = typeof SUPPORTED_OUTPUT_LANGUAGES[number]['code'];

export const DEFAULT_OUTPUT_LANGUAGE: SupportedOutputLanguage = 'en';

const languageCodes = new Set(SUPPORTED_OUTPUT_LANGUAGES.map((language) => language.code));

export const isSupportedOutputLanguage = (value: string): value is SupportedOutputLanguage =>
  languageCodes.has(value as SupportedOutputLanguage);

export const assertSupportedOutputLanguage = (value: string | undefined): SupportedOutputLanguage => {
  const language = value ?? DEFAULT_OUTPUT_LANGUAGE;
  if (!isSupportedOutputLanguage(language)) {
    throw new ValidationError('Unsupported output language');
  }
  return language;
};

export const getLanguageLabel = (code: string): string =>
  SUPPORTED_OUTPUT_LANGUAGES.find((language) => language.code === code)?.label ?? 'English';

