import { z } from 'zod';
import { parserConfig } from '../../../config/parserConfig.js';
import { requestNimJson } from '../../../services/nvidia-nim.service.js';
import { ValidationError } from '../../../utils/errors.js';
import { logger } from '../../../utils/logger.js';
import { resumeParserPrompt } from '../../ai/prompts/resume-parser.prompt.js';
import {
  parsedResearchPaperItemSchema,
  parsedResumeDataSchema,
  type ParsedResearchPaperItem,
  type ParsedResumeData,
} from '../resume-import.schema.js';
import { withConfidenceScores } from './confidenceScoring.js';
import { deduplicateParsedData } from './deduplicateParsedData.js';
import { extractCertifications } from './extractCertifications.js';
import { extractEducation } from './extractEducation.js';
import { extractExperience } from './extractExperience.js';
import { extractResumeDocument } from './extractText.js';
import { extractPersonalInfo } from './extractPersonalInfo.js';
import { extractProjects, hasProjectParsingIssues } from './extractProjects.js';
import { extractResearchPapers } from './extractResearchPapers.js';
import { extractSkills } from './extractSkills.js';
import { normalizeParsedData } from './normalizeParsedData.js';
import { repairProjectsWithAi } from './repairProjectsWithAi.js';
import { segmentSections } from './segmentSections.js';
import type { ParserContext, ResumeParserMode } from './types.js';
import { RESUME_PARSER_VERSION } from './types.js';
import { linesFromText, warning } from './utils.js';
import { validateParsedData } from './validateParsedData.js';

const LLM_ONLY_TEXT_LIMIT = 30_000;
const RESEARCH_AI_TEXT_LIMIT = 7000;

interface FinalizeOptions {
  mode: ResumeParserMode;
  startedAt: number;
  aiOperations: string[];
  llmUsedFor: string[];
  modelUsed?: string;
  fallbackModelUsed?: boolean;
}

const finalizeParsedData = (data: ParsedResumeData, options: FinalizeOptions): ParsedResumeData => {
  const finalized = withConfidenceScores(
    deduplicateParsedData(validateParsedData(normalizeParsedData(data))),
  );
  return parsedResumeDataSchema.parse({
    ...finalized,
    parseMetadata: {
      mode: options.mode,
      durationMs: Date.now() - options.startedAt,
      aiUsed: options.aiOperations.length > 0,
      aiOperations: options.aiOperations,
      llmUsedFor: options.llmUsedFor,
      model: options.modelUsed,
      fallbackModelUsed: options.fallbackModelUsed ?? false,
      confidence: finalized.confidence?.overall,
    },
  });
};

const fullResumePrompt = (context: ParserContext): string =>
  JSON.stringify({
    resumeText: context.text.slice(0, LLM_ONLY_TEXT_LIMIT),
    extractedLinks: context.links.map((link) => ({
      displayText: link.displayText,
      url: link.normalizedUrl,
      kind: link.kind,
      section: link.section,
      nearbyText: link.nearbyText?.slice(0, 220),
    })),
  });

const callNimWithFallback = async <T>(
  options: Parameters<typeof requestNimJson<T>>[0],
): Promise<{ result: T; modelUsed: string; usedFallback: boolean }> => {
  const primaryModel = parserConfig.parserModel;
  try {
    const result = await requestNimJson<T>({ ...options, model: primaryModel });
    return { result, modelUsed: primaryModel, usedFallback: false };
  } catch (primaryError) {
    const fallbackModel = parserConfig.parserFallbackModel;
    if (!fallbackModel) throw primaryError;
    logger.warn(
      { err: primaryError, primaryModel, fallbackModel, operation: options.model ?? 'nim_call' },
      'Primary parser model failed; retrying with fallback model',
    );
    const result = await requestNimJson<T>({ ...options, model: fallbackModel });
    return { result, modelUsed: fallbackModel, usedFallback: true };
  }
};

const parseWithLlmOnly = async (
  context: ParserContext,
  startedAt: number,
): Promise<ParsedResumeData> => {
  logger.info(
    { mode: 'llm-only', parserVersion: RESUME_PARSER_VERSION },
    'Resume parser mode selected',
  );
  try {
    const { result: raw, modelUsed, usedFallback } = await callNimWithFallback<unknown>({
      systemPrompt: resumeParserPrompt,
      userPrompt: fullResumePrompt(context),
      maxTokens: 5000,
      maxRetries: parserConfig.allowAiParsing ? 2 : 0,
      temperature: 0.1,
      timeoutMs: 60000,
    });
    const parsed = parsedResumeDataSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ValidationError('LLM resume parser returned invalid structured data.');
    }
    const data = parsedResumeDataSchema.parse({
      ...parsed.data,
      sourceFile: {
        fileName: context.fileName,
        fileType: context.fileType,
        parserVersion: RESUME_PARSER_VERSION,
      },
      extractedLinks: context.links,
      warnings: context.warnings,
    });
    return finalizeParsedData(data, {
      mode: 'llm-only',
      startedAt,
      aiOperations: ['full_resume_parse'],
      llmUsedFor: ['personalInfo', 'education', 'experience', 'projects', 'researchPapers', 'skills', 'certifications'],
      modelUsed,
      fallbackModelUsed: usedFallback,
    });
  } catch (error) {
    logger.warn(
      { err: error, operation: 'resume_import_llm_only_parse' },
      'LLM-only resume parse failed',
    );
    context.warnings.push(
      warning(
        'LLM_ONLY_FALLBACK_TO_RULES',
        'LLM-only parsing was unavailable; deterministic resume parsing was used.',
        'warning',
      ),
    );
    logger.info(
      { mode: 'rule-based', requestedMode: 'llm-only', parserVersion: RESUME_PARSER_VERSION },
      'Falling back to deterministic resume parser after LLM-only failure',
    );
    return parseWithRules(context, startedAt, 'rule-based');
  }
};

const researchRepairSchema = z.object({
  researchPapers: z.array(parsedResearchPaperItemSchema).max(12),
});

const researchSectionText = (context: ParserContext): string =>
  context.sections
    .filter((section) => section.key === 'research' || section.key === 'publications')
    .map((section) => `## ${section.heading}\n${section.text}`)
    .join('\n\n')
    .slice(0, RESEARCH_AI_TEXT_LIMIT);

export const researchNeedsAi = (context: ParserContext, papers: ParsedResearchPaperItem[]): boolean => {
  if (!researchSectionText(context).trim()) return false;
  if (papers.length === 0) return true;
  return papers.some(
    (paper) =>
      (paper._meta?.confidence ?? 0.6) < parserConfig.confidenceThreshold ||
      (!paper.doi && !paper.arxivUrl && !paper.publicationUrl && !paper.githubUrl && !paper.venue),
  );
};

const RESEARCH_REPAIR_SYSTEM_PROMPT = `You are an expert academic resume parser. Extract research papers and publications from resume text.

Rules:
- Return strict JSON with a "researchPapers" array only. No prose or markdown.
- Each paper must be one entry — never split a single paper into multiple entries.
- Preserve the FULL paper title exactly as it appears in the source text.
- If a title is word-wrapped across lines, reconstruct the complete title by merging the continuation.
- Never truncate, abbreviate, or shorten paper titles.
- Do not invent authors, venues, years, DOIs, or links that are not present in the source.
- Assign DOI links to the "doi" field (strip the https://doi.org/ prefix).
- Assign arXiv links to the "arxivUrl" field.
- Assign IEEE/ACM/Springer/journal/publisher links to "publicationUrl".
- Assign GitHub or code repository links to "githubUrl".
- Preserve descriptions and abstracts exactly as written in the source.
- Mark uncertain fields with a warning in the _meta.warnings array.
- If a paper has no title, omit it entirely rather than returning an empty entry.
- Do not return papers with blank titles.`;

const repairResearchPapersWithAi = async (
  context: ParserContext,
  currentPapers: ParsedResearchPaperItem[],
): Promise<{ papers: ParsedResearchPaperItem[]; modelUsed: string; usedFallback: boolean } | undefined> => {
  const text = researchSectionText(context);
  if (!text.trim()) return undefined;

  const researchLinks = context.links
    .filter((link) =>
      ['doi', 'arxiv', 'publication', 'paper_pdf', 'code', 'github_repo'].includes(link.kind),
    )
    .map((link) => ({
      displayText: link.displayText,
      url: link.normalizedUrl,
      nearbyText: link.nearbyText?.slice(0, 220),
      kind: link.kind,
    }));

  try {
    const { result: raw, modelUsed, usedFallback } = await callNimWithFallback<unknown>({
      systemPrompt: RESEARCH_REPAIR_SYSTEM_PROMPT,
      userPrompt: JSON.stringify({
        researchSectionText: text,
        extractedLinks: researchLinks,
        deterministicCandidates: currentPapers.map((p) => ({
          title: p.title,
          year: p.year,
          doi: p.doi,
          arxivUrl: p.arxivUrl,
          venue: p.venue,
          confidence: p._meta?.confidence,
        })),
        instructions: {
          preserveFullTitlesExactly: true,
          mergeWrappedTitleLines: true,
          doNotSplitPapersIntoMultipleEntries: true,
          preserveDescriptionsExactly: true,
          doNotInvent: true,
          assignEmbeddedLinksToCorrectFields: true,
          omitPapersWithNoTitle: true,
        },
      }),
      temperature: 0,
      maxTokens: 3500,
      maxRetries: 1,
      timeoutMs: parserConfig.researchRepairTimeoutMs,
    });
    const parsed = researchRepairSchema.safeParse(raw);
    if (!parsed.success || parsed.data.researchPapers.length === 0) {
      context.warnings.push(
        warning(
          'RESEARCH_AI_REPAIR_INVALID',
          'Research paper AI repair returned invalid data; deterministic result kept.',
          'warning',
          'researchPapers',
        ),
      );
      return undefined;
    }
    context.warnings.push(
      warning(
        'RESEARCH_AI_REPAIRED',
        'Research paper entries were enhanced using AI-assisted parsing.',
        'info',
        'researchPapers',
      ),
    );
    return {
      papers: parsed.data.researchPapers.map((paper) => ({
        ...paper,
        _meta: {
          confidence: 0.86,
          warnings: [],
          sourceSection: 'Research',
          sourceText: text.slice(0, 500),
        },
      })),
      modelUsed,
      usedFallback,
    };
  } catch (error) {
    logger.warn(
      { err: error, operation: 'resume_import_research_repair_ai', timeoutMs: parserConfig.researchRepairTimeoutMs },
      'Resume research AI repair failed',
    );
    context.warnings.push(
      warning(
        'RESEARCH_AI_REPAIR_UNAVAILABLE',
        'AI research enhancement could not complete; the best deterministic result was used. Please review highlighted fields.',
        'info',
        'researchPapers',
      ),
    );
    return undefined;
  }
};

const parseWithRules = async (
  context: ParserContext,
  startedAt: number,
  mode: Exclude<ResumeParserMode, 'llm-only'>,
): Promise<ParsedResumeData> => {
  logger.info({ mode, parserVersion: RESUME_PARSER_VERSION }, 'Resume parser mode selected');
  const aiOperations: string[] = [];
  const llmUsedFor: string[] = [];
  let modelUsed: string | undefined;
  let anyFallback = false;

  const { personal, personalInfo } = extractPersonalInfo(context);
  const deterministicProjects = extractProjects(context);
  const projectIssues = hasProjectParsingIssues(deterministicProjects);

  let repairedProjects: ReturnType<typeof extractProjects> | undefined;
  if (mode === 'hybrid' && projectIssues) {
    const repairResult = await repairProjectsWithAi(context, deterministicProjects);
    if (repairResult) {
      repairedProjects = repairResult.projects;
      modelUsed = repairResult.modelUsed ?? modelUsed;
      if (repairResult.usedFallback) anyFallback = true;
      aiOperations.push('project_repair');
      llmUsedFor.push('projects');
    }
  }

  if (mode === 'rule-based' && projectIssues) {
    context.warnings.push(
      warning(
        'PROJECT_NEEDS_REVIEW',
        'Project parsing confidence was low; AI repair was skipped because rule-based parser mode is active.',
        'warning',
        'projects',
      ),
    );
  }

  const deterministicResearchPapers = extractResearchPapers(context);
  let repairedResearchPapers: ParsedResearchPaperItem[] | undefined;
  if (mode === 'hybrid' && researchNeedsAi(context, deterministicResearchPapers)) {
    const repairResult = await repairResearchPapersWithAi(context, deterministicResearchPapers);
    if (repairResult) {
      repairedResearchPapers = repairResult.papers;
      modelUsed = repairResult.modelUsed ?? modelUsed;
      if (repairResult.usedFallback) anyFallback = true;
      aiOperations.push('research_repair');
      llmUsedFor.push('researchPapers');
    }
  }

  if (mode === 'rule-based' && researchNeedsAi(context, deterministicResearchPapers)) {
    context.warnings.push(
      warning(
        'RESEARCH_NEEDS_REVIEW',
        'Research paper parsing confidence was low; AI repair was skipped because rule-based parser mode is active.',
        'warning',
        'researchPapers',
      ),
    );
  }

  // Track if embedded link assignment was LLM-assisted
  const hasUnmappedLinks = context.links.some(
    (link) =>
      ['doi', 'arxiv', 'publication', 'paper_pdf', 'github_repo', 'project'].includes(link.kind) &&
      !link.section,
  );
  if (llmUsedFor.includes('projects') || llmUsedFor.includes('researchPapers')) {
    if (hasUnmappedLinks) llmUsedFor.push('embeddedLinks');
  }

  const deterministic = parsedResumeDataSchema.parse({
    sourceFile: {
      fileName: context.fileName,
      fileType: context.fileType,
      parserVersion: RESUME_PARSER_VERSION,
    },
    personal,
    personalInfo,
    education: extractEducation(context),
    experience: extractExperience(context),
    projects: repairedProjects ?? deterministicProjects,
    researchPapers: repairedResearchPapers ?? deterministicResearchPapers,
    skills: extractSkills(context),
    certifications: extractCertifications(context),
    achievements: context.sections
      .filter((section) => section.key === 'achievements')
      .flatMap((section) =>
        section.lines.map((line) => ({
          value: line,
          confidence: 0.72,
          sourceSection: section.heading,
          warnings: [],
        })),
      ),
    extractedLinks: context.links,
    warnings: context.warnings,
  });

  return finalizeParsedData(deterministic, {
    mode,
    startedAt,
    aiOperations,
    llmUsedFor,
    modelUsed,
    fallbackModelUsed: anyFallback,
  });
};

export const parseResumeBuffer = async (
  buffer: Buffer,
  mimetype: string,
  fileName: string,
): Promise<ParsedResumeData> => {
  const startedAt = Date.now();
  const extracted = await extractResumeDocument(buffer, mimetype, fileName);
  const lines = linesFromText(extracted.text);
  const sections = segmentSections(lines);
  const context: ParserContext = {
    fileName,
    fileType: extracted.fileType,
    text: extracted.text,
    lines,
    sections,
    links: extracted.links,
    warnings: [...extracted.warnings],
  };

  if (extracted.text.length < 50) {
    const parsed = parsedResumeDataSchema.parse({
      sourceFile: { fileName, fileType: extracted.fileType, parserVersion: RESUME_PARSER_VERSION },
      warnings: context.warnings,
      extractedLinks: extracted.links,
    });
    return finalizeParsedData(parsed, {
      mode: parserConfig.mode,
      startedAt,
      aiOperations: [],
      llmUsedFor: [],
    });
  }

  if (parserConfig.mode === 'llm-only') {
    return parseWithLlmOnly(context, startedAt);
  }

  return parseWithRules(context, startedAt, parserConfig.mode);
};
