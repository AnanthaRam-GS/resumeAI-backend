import { env } from './env.js';
import { logger } from '../utils/logger.js';

export type ResumeParserMode = 'rule-based' | 'llm-only' | 'hybrid';

export const DEFAULT_RESUME_PARSER_MODE: ResumeParserMode = 'hybrid';

const parserModeAliases: Record<string, ResumeParserMode> = {
  'rule-based': 'rule-based',
  rulebased: 'rule-based',
  rules: 'rule-based',
  rule: 'rule-based',
  deterministic: 'rule-based',
  'llm-only': 'llm-only',
  llm: 'llm-only',
  ai: 'llm-only',
  'ai-only': 'llm-only',
  hybrid: 'hybrid',
};

export const normalizeResumeParserMode = (
  value: string | undefined,
): { mode: ResumeParserMode; usedDefault: boolean; reason?: 'missing' | 'invalid' } => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return { mode: DEFAULT_RESUME_PARSER_MODE, usedDefault: true, reason: 'missing' };
  }

  const mode = parserModeAliases[normalized];
  if (!mode) {
    return { mode: DEFAULT_RESUME_PARSER_MODE, usedDefault: true, reason: 'invalid' };
  }

  return { mode, usedDefault: false };
};

const resolvedParserMode = normalizeResumeParserMode(env.RESUME_PARSER_MODE);

if (resolvedParserMode.usedDefault) {
  logger.warn(
    {
      configKey: 'RESUME_PARSER_MODE',
      configValue: env.RESUME_PARSER_MODE ?? null,
      defaultMode: DEFAULT_RESUME_PARSER_MODE,
      reason: resolvedParserMode.reason,
    },
    'RESUME_PARSER_MODE is missing or invalid; defaulting to hybrid parser mode',
  );
}

export const parserConfig = {
  mode: resolvedParserMode.mode,
  allowAiParsing: resolvedParserMode.mode !== 'rule-based',
  confidenceThreshold: env.RESUME_PARSER_CONFIDENCE_THRESHOLD,
  parserModel: env.NVIDIA_NIM_PARSER_MODEL ?? env.NVIDIA_NIM_RESUME_PARSER_MODEL,
  parserFallbackModel: env.NVIDIA_NIM_PARSER_FALLBACK_MODEL,
  parserTimeoutMs: env.NVIDIA_NIM_PARSER_TIMEOUT_MS,
  researchRepairTimeoutMs: env.NVIDIA_NIM_RESEARCH_REPAIR_TIMEOUT_MS,
} as const;
