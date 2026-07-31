import type {
  ExtractedLink,
  ParseWarning,
  ParsedCertificationItem,
  ParsedEducationItem,
  ParsedExperienceItem,
  ParsedPersonal,
  ParsedProjectItem,
  ParsedResearchPaperItem,
  ParsedResumeData,
  ParsedSkillItem,
} from '../resume-import.schema.js';
import { parserConfig, type ResumeParserMode } from '../../../config/parserConfig.js';

export const BASE_RESUME_PARSER_VERSION = 'resume-import-parser-v2.3.1-research-paper-links';
export const RESUME_PARSER_VERSION = `${BASE_RESUME_PARSER_VERSION}:${parserConfig.mode}`;
export type { ResumeParserMode };

export type SupportedResumeFileType = 'pdf' | 'docx';
export type ResumeSectionKey =
  | 'header'
  | 'summary'
  | 'education'
  | 'experience'
  | 'projects'
  | 'research'
  | 'skills'
  | 'certifications'
  | 'achievements'
  | 'publications'
  | 'unknown';

export interface ExtractedResumeDocument {
  fileType: SupportedResumeFileType;
  text: string;
  links: ExtractedLink[];
  warnings: ParseWarning[];
  pageCount?: number;
}

export interface ResumeSection {
  key: ResumeSectionKey;
  heading: string;
  lines: string[];
  text: string;
  startLine: number;
  endLine: number;
}

export interface ParserContext {
  fileName: string;
  fileType: SupportedResumeFileType;
  text: string;
  lines: string[];
  sections: ResumeSection[];
  links: ExtractedLink[];
  warnings: ParseWarning[];
}

export interface ParsedSections {
  personal?: ParsedPersonal;
  education: ParsedEducationItem[];
  experience: ParsedExperienceItem[];
  projects: ParsedProjectItem[];
  researchPapers: ParsedResearchPaperItem[];
  skills: ParsedSkillItem[];
  certifications: ParsedCertificationItem[];
  achievements: string[];
}

export type ResumeParseResult = ParsedResumeData;
