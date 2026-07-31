import type { ExtractedEntities } from '../../types/ai.types.js';
import { requestNimJson } from '../../services/nvidia-nim.service.js';
import { requestGeminiJson } from '../../services/gemini.service.js';
import { getTaxonomySkills, textIncludesKeyword } from '../../services/ats-scorer.service.js';
import { ValidationError } from '../../utils/errors.js';
import { jdExtractionPrompt } from './prompts/jd-extraction.prompt.js';

const allowedSeniority = new Set<ExtractedEntities['roleSeniority']>([
  'intern',
  'junior',
  'mid',
  'senior',
  'lead',
  'principal',
  'staff',
  'unknown',
]);

const unique = (values: string[] | undefined): string[] => {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
};

const formatErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const splitSentences = (value: string): string[] => {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
};

const inferRoleSeniority = (jobDescription: string): ExtractedEntities['roleSeniority'] => {
  if (/\b(principal)\b/i.test(jobDescription)) return 'principal';
  if (/\b(staff)\b/i.test(jobDescription)) return 'staff';
  if (/\b(lead|manager|head)\b/i.test(jobDescription)) return 'lead';
  if (/\b(senior|sr\.?)\b/i.test(jobDescription)) return 'senior';
  if (/\b(mid|intermediate)\b/i.test(jobDescription)) return 'mid';
  if (/\b(junior|jr\.?|entry[-\s]?level)\b/i.test(jobDescription)) return 'junior';
  if (/\b(intern|internship)\b/i.test(jobDescription)) return 'intern';
  return 'unknown';
};

const inferRoleCategory = (jobDescription: string): string => {
  if (/\b(frontend|front-end|react|next\.?js|ui|ux)\b/i.test(jobDescription))
    return 'Frontend Engineering';
  if (/\b(data|machine learning|ml|ai|analytics|pandas|numpy)\b/i.test(jobDescription))
    return 'Data and AI';
  if (/\b(mobile|ios|android|react native|flutter)\b/i.test(jobDescription))
    return 'Mobile Engineering';
  if (
    /\b(backend|back-end|api|node|fastify|express|database|microservices)\b/i.test(jobDescription)
  )
    return 'Backend Engineering';
  if (
    /\b(devops|sre|platform|cloud|kubernetes|docker|ci\/cd|infrastructure)\b/i.test(jobDescription)
  )
    return 'Infrastructure Engineering';
  return 'General';
};

const extractSkills = (jobDescription: string): string[] => {
  const skills = getTaxonomySkills()
    .filter((skill) =>
      [skill.name, ...(skill.synonyms ?? [])].some((keyword) =>
        textIncludesKeyword(jobDescription, keyword),
      ),
    )
    .map((skill) => skill.name);

  return unique(skills);
};

const classifyRequiredSkills = (jobDescription: string, skills: string[]): string[] => {
  const sentences = splitSentences(jobDescription);
  const preferredCues = /\b(preferred|nice to have|nice-to-have|bonus|plus|desirable|optional)\b/i;

  return skills.filter((skill) => {
    const matchingSentences = sentences.filter((sentence) => textIncludesKeyword(sentence, skill));
    return !matchingSentences.some((sentence) => preferredCues.test(sentence));
  });
};

const classifyPreferredSkills = (jobDescription: string, skills: string[]): string[] => {
  const sentences = splitSentences(jobDescription);
  const preferredCues = /\b(preferred|nice to have|nice-to-have|bonus|plus|desirable|optional)\b/i;

  return skills.filter((skill) => {
    const matchingSentences = sentences.filter((sentence) => textIncludesKeyword(sentence, skill));
    return matchingSentences.some((sentence) => preferredCues.test(sentence));
  });
};

const extractResponsibilities = (jobDescription: string): string[] => {
  const responsibilityCues =
    /\b(build|develop|design|deliver|maintain|lead|own|create|implement|improve|collaborate)\b/i;
  return splitSentences(jobDescription)
    .filter((sentence) => responsibilityCues.test(sentence))
    .slice(0, 6);
};

const fallbackAnalyzeJobDescription = (jobDescription: string): ExtractedEntities => {
  const skills = extractSkills(jobDescription);
  const preferredSkills = classifyPreferredSkills(jobDescription, skills);
  const requiredSkills = classifyRequiredSkills(jobDescription, skills);
  const summary = splitSentences(jobDescription).slice(0, 2).join(' ').slice(0, 320);

  return normalizeExtractedEntities({
    requiredSkills: requiredSkills.length > 0 ? requiredSkills : skills,
    preferredSkills,
    techStack: skills,
    roleSeniority: inferRoleSeniority(jobDescription),
    roleCategory: inferRoleCategory(jobDescription),
    summary,
    responsibilities: extractResponsibilities(jobDescription),
    keywords: skills,
  });
};

export const normalizeExtractedEntities = (
  value: Partial<ExtractedEntities>,
): ExtractedEntities => {
  const roleSeniority = value.roleSeniority ?? 'unknown';

  if (!allowedSeniority.has(roleSeniority)) {
    throw new ValidationError('Invalid role seniority returned by JD analyzer');
  }

  return {
    requiredSkills: unique(value.requiredSkills),
    preferredSkills: unique(value.preferredSkills),
    techStack: unique(value.techStack),
    roleSeniority,
    roleCategory: (value.roleCategory ?? 'General').trim() || 'General',
    summary: value.summary?.trim(),
    responsibilities: unique(value.responsibilities),
    keywords: unique(value.keywords),
  };
};

export const analyzeJobDescription = async (jobDescription: string): Promise<ExtractedEntities> => {
  if (!jobDescription.trim()) {
    throw new ValidationError('Job description is required');
  }

  let nimError: unknown;
  try {
    const extracted = await requestNimJson<Partial<ExtractedEntities>>({
      systemPrompt: jdExtractionPrompt,
      userPrompt: jobDescription,
      temperature: 0.1,
    });
    return normalizeExtractedEntities(extracted);
  } catch (error) {
    nimError = error;
  }

  try {
    const extracted = await requestGeminiJson<Partial<ExtractedEntities>>({
      systemPrompt: jdExtractionPrompt,
      userPrompt: jobDescription,
      temperature: 0.1,
    });
    return normalizeExtractedEntities(extracted);
  } catch (geminiError) {
    console.warn(
      `[JD analyzer] Falling back to deterministic extraction. NIM: ${formatErrorMessage(nimError)}; Gemini: ${formatErrorMessage(geminiError)}`,
    );
    return fallbackAnalyzeJobDescription(jobDescription);
  }
};
