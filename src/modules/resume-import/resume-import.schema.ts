import { z } from 'zod';

const stringFromUnknown = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const joined = value
      .map(stringFromUnknown)
      .filter((item): item is string => Boolean(item))
      .join('; ');
    return joined || undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
};

const normalizeDate = (value: unknown): string | undefined => {
  const text = stringFromUnknown(value);
  if (!text) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  if (/^\d{4}$/.test(text)) return `${text}-01-01`;
  if (/^(present|current|now|ongoing)$/i.test(text)) return undefined;
  return undefined;
};

const normalizeUrl = (value: unknown): string | undefined => {
  const text = stringFromUnknown(value);
  if (!text) return undefined;
  const withoutTrailing = text.replace(/[),.;\]]+$/g, '');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(withoutTrailing)) return withoutTrailing;
  if (/^(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(withoutTrailing)) {
    return `https://${withoutTrailing}`;
  }
  return withoutTrailing;
};

const optionalStr = z.preprocess(stringFromUnknown, z.string().trim().optional());
const optionalUrl = z.preprocess(normalizeUrl, z.string().trim().optional());
const requiredTitle = z.preprocess(stringFromUnknown, z.string().trim().min(1));
const optionalDate = z.preprocess(
  normalizeDate,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
);

const stringArray = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
      return value.map(stringFromUnknown).filter((item): item is string => Boolean(item));
    }
    const text = stringFromUnknown(value);
    if (!text) return undefined;
    return text
      .split(/[,;|]/)
      .map((item) => item.trim())
      .filter(Boolean);
  },
  z.array(z.string().trim().min(1)).optional(),
);

const arrayFromUnknown = (value: unknown): unknown[] | undefined => {
  if (value === null || value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
};

const sectionArray = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    arrayFromUnknown,
    z
      .array(z.unknown())
      .optional()
      .transform((items): z.output<T>[] | undefined => {
        if (!items) return undefined;
        return items.flatMap((item) => {
          const parsed = schema.safeParse(item);
          return parsed.success ? [parsed.data as z.output<T>] : [];
        });
      }),
  );

const withAliases =
  (aliases: Record<string, string[]>) =>
  (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = { ...(value as Record<string, unknown>) };
    for (const [target, sources] of Object.entries(aliases)) {
      if (stringFromUnknown(record[target])) continue;
      const source = sources.find((key) => stringFromUnknown(record[key]));
      if (source) record[target] = record[source];
    }
    return record;
  };

export const parseWarningSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  severity: z.enum(['info', 'warning', 'error']).default('warning'),
  section: z.string().trim().optional(),
  field: z.string().trim().optional(),
});

export const parsedFieldSchema = <T extends z.ZodType>(schema: T) =>
  z.object({
    value: schema,
    confidence: z.number().min(0).max(1).default(0.7),
    sourceSection: z.string().trim().optional(),
    sourceText: z.string().trim().optional(),
    sourcePage: z.number().int().positive().optional(),
    warnings: z.array(z.string().trim().min(1)).default([]),
  });

export const extractedLinkSchema = z.object({
  displayText: z.string().trim().optional(),
  url: z.string().trim().min(1),
  normalizedUrl: z.string().trim().min(1),
  page: z.number().int().positive().optional(),
  section: z.string().trim().optional(),
  nearbyText: z.string().trim().optional(),
  kind: z
    .enum([
      'linkedin',
      'github_profile',
      'github_repo',
      'portfolio',
      'project',
      'demo',
      'doi',
      'arxiv',
      'publication',
      'paper_pdf',
      'code',
      'email_domain',
      'unknown',
    ])
    .default('unknown'),
});

export const parsedPersonalSchema = z.object({
  full_name: optionalStr,
  email: optionalStr,
  phone: optionalStr,
  location: optionalStr,
  linkedin_url: optionalUrl,
  github_url: optionalUrl,
  portfolio_url: optionalUrl,
  summary: optionalStr,
});

export const parsedPersonalInfoSchema = z.object({
  fullName: parsedFieldSchema(z.string().trim().min(1)).optional(),
  email: parsedFieldSchema(z.string().trim().min(1)).optional(),
  phone: parsedFieldSchema(z.string().trim().min(1)).optional(),
  location: parsedFieldSchema(z.string().trim().min(1)).optional(),
  linkedinUrl: parsedFieldSchema(z.string().trim().min(1)).optional(),
  githubUrl: parsedFieldSchema(z.string().trim().min(1)).optional(),
  portfolioUrl: parsedFieldSchema(z.string().trim().min(1)).optional(),
  professionalSummary: parsedFieldSchema(z.string().trim().min(1)).optional(),
});

const itemMetaSchema = z.object({
  confidence: z.number().min(0).max(1).default(0.7),
  warnings: z.array(z.string().trim().min(1)).default([]),
  sourceSection: z.string().trim().optional(),
  sourceText: z.string().trim().optional(),
  duplicate: z
    .object({
      isDuplicate: z.boolean(),
      existingItemId: z.string().uuid().optional(),
      reason: z.string().trim().optional(),
      action: z.enum(['skip', 'update', 'create']).default('create'),
    })
    .optional(),
});

export const parsedExperienceItemSchema = z.preprocess(
  withAliases({
    title: ['role', 'position', 'job_title'],
    company_name: ['company', 'employer', 'organization'],
  }),
  z.object({
    title: requiredTitle,
    company_name: optionalStr,
    location: optionalStr,
    start_date: optionalDate,
    end_date: optionalDate,
    is_current: z.boolean().optional(),
    description: optionalStr,
    bullets: stringArray,
    tech_stack: stringArray,
    achievements: optionalStr,
    employment_type: optionalStr,
    _meta: itemMetaSchema.optional(),
  }),
);

export const parsedEducationItemSchema = z.preprocess(
  withAliases({
    title: ['degree', 'name'],
    institution_name: ['institution', 'school', 'university'],
  }),
  z.object({
    title: requiredTitle,
    degree: optionalStr,
    field_of_study: optionalStr,
    institution_name: optionalStr,
    location: optionalStr,
    start_date: optionalDate,
    end_date: optionalDate,
    is_current: z.boolean().optional(),
    gpa: optionalStr,
    description: optionalStr,
    details: stringArray,
    _meta: itemMetaSchema.optional(),
  }),
);

export const parsedSkillItemSchema = z.preprocess(
  (value) => {
    const text = stringFromUnknown(value);
    if (text && (typeof value !== 'object' || value === null || Array.isArray(value))) {
      return { title: text, skill_name: text };
    }
    return withAliases({ title: ['skill_name', 'name'] })(value);
  },
  z.object({
    title: requiredTitle,
    skill_name: optionalStr,
    domain_category: optionalStr,
    _meta: itemMetaSchema.optional(),
  }),
);

export const parsedProjectItemSchema = z.preprocess(
  withAliases({
    title: ['name', 'project_name'],
    project_url: ['url', 'link', 'github_url', 'repo_url', 'repository_url', 'live_url'],
    github_url: ['githubUrl', 'repo_url', 'repository_url'],
    live_url: ['liveUrl', 'demo_url'],
  }),
  z.object({
    title: requiredTitle,
    description: optionalStr,
    bullets: stringArray,
    tech_stack: stringArray,
    project_url: optionalUrl,
    github_url: optionalUrl,
    live_url: optionalUrl,
    start_date: optionalDate,
    end_date: optionalDate,
    role: optionalStr,
    achievements: optionalStr,
    impact_metrics: optionalStr,
    links: z.array(extractedLinkSchema).optional(),
    _meta: itemMetaSchema.optional(),
  }),
);

const publicationTypeSchema = z.enum([
  'journal',
  'conference',
  'preprint',
  'workshop',
  'article',
  'unknown',
]);
const publicationStatusSchema = z.enum([
  'published',
  'accepted',
  'submitted',
  'under_review',
  'preprint',
  'unknown',
]);
const parserModeSchema = z.enum(['rule-based', 'llm-only', 'hybrid']);

export const parsedResearchPaperItemSchema = z.preprocess(
  withAliases({
    title: ['name', 'paper_title', 'publication_title'],
    publicationUrl: ['url', 'link', 'paper_url', 'publication_url', 'publisher_url'],
    arxivUrl: ['arxiv', 'arxiv_url'],
    githubUrl: ['github', 'github_url', 'code_url', 'repository_url', 'repo_url'],
  }),
  z.object({
    title: requiredTitle,
    authors: stringArray,
    venue: optionalStr,
    publicationType: publicationTypeSchema.default('unknown').optional(),
    publisher: optionalStr,
    year: optionalStr,
    date: optionalStr,
    doi: optionalStr,
    arxivUrl: optionalUrl,
    publicationUrl: optionalUrl,
    githubUrl: optionalUrl,
    abstract: optionalStr,
    keywords: stringArray,
    status: publicationStatusSchema.default('unknown').optional(),
    links: z.array(extractedLinkSchema).optional(),
    _meta: itemMetaSchema.optional(),
  }),
);

export const parsedCertificationItemSchema = z.preprocess(
  withAliases({
    title: ['name', 'certification_name'],
    issuing_org: ['issuer', 'organization', 'issuing_organization'],
    cert_url: ['url', 'link', 'credential_url'],
  }),
  z.object({
    title: requiredTitle,
    issuing_org: optionalStr,
    cert_url: optionalUrl,
    credential_id: optionalStr,
    start_date: optionalDate,
    end_date: optionalDate,
    _meta: itemMetaSchema.optional(),
  }),
);

const normalizeSkillsSection = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.entries(value as Record<string, unknown>).flatMap(([category, rawSkills]) => {
    const rawSkillText = stringFromUnknown(rawSkills);
    const skills =
      rawSkillText && !Array.isArray(rawSkills)
        ? rawSkillText
            .split(/[,;|]/)
            .map((item) => item.trim())
            .filter(Boolean)
        : (arrayFromUnknown(rawSkills) ?? []);
    return skills.map((skill) => {
      const name = stringFromUnknown(skill);
      if (name) return { title: name, skill_name: name, domain_category: category };
      if (skill && typeof skill === 'object' && !Array.isArray(skill)) {
        return { domain_category: category, ...(skill as Record<string, unknown>) };
      }
      return skill;
    });
  });
};

const fieldValue = (value: unknown): unknown => {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in value) {
    return (value as { value?: unknown }).value;
  }
  return value;
};

const legacyPersonalFromPersonalInfo = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return {
    full_name: fieldValue(record.fullName),
    email: fieldValue(record.email),
    phone: fieldValue(record.phone),
    location: fieldValue(record.location),
    linkedin_url: fieldValue(record.linkedinUrl),
    github_url: fieldValue(record.githubUrl),
    portfolio_url: fieldValue(record.portfolioUrl),
    summary: fieldValue(record.professionalSummary),
  };
};

const normalizeResumeData = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  const copyAlias = (target: string, aliases: string[]) => {
    if (record[target] !== undefined) return;
    const alias = aliases.find((key) => record[key] !== undefined);
    if (alias) record[target] = record[alias];
  };

  copyAlias('personal', ['contact', 'contact_info', 'personal_info', 'profile']);
  copyAlias('personalInfo', ['personal_info_v2']);
  if (!record.personal && record.personalInfo)
    record.personal = legacyPersonalFromPersonalInfo(record.personalInfo);
  copyAlias('experience', ['work_experience', 'professional_experience', 'employment', 'jobs']);
  copyAlias('education', ['educations', 'academic_background', 'academic_history']);
  copyAlias('skills', ['technical_skills', 'skill_set', 'competencies']);
  copyAlias('projects', ['project', 'personal_projects', 'academic_projects']);
  copyAlias('researchPapers', [
    'research_papers',
    'publications',
    'research_publications',
    'papers',
    'published_papers',
    'conference_papers',
    'journal_publications',
    'preprints',
    'articles',
    'manuscripts',
    'research_work',
  ]);
  copyAlias('certifications', ['certificates', 'licenses', 'credentials']);
  record.skills = normalizeSkillsSection(record.skills);
  return record;
};

export const parsedResumeDataSchema = z.preprocess(
  normalizeResumeData,
  z.object({
    sourceFile: z
      .object({
        fileName: z.string().trim(),
        fileType: z.enum(['pdf', 'docx']),
        parserVersion: z.string().trim(),
      })
      .optional(),
    parseMetadata: z
      .object({
        mode: parserModeSchema,
        durationMs: z.number().int().min(0).optional(),
        aiUsed: z.boolean().default(false),
        aiOperations: z.array(z.string().trim().min(1)).default([]),
        llmUsedFor: z.array(z.string().trim().min(1)).default([]),
        model: z.string().trim().optional(),
        fallbackModelUsed: z.boolean().default(false),
        confidence: z.number().min(0).max(1).optional(),
      })
      .optional(),
    personalInfo: parsedPersonalInfoSchema.optional(),
    personal: parsedPersonalSchema.optional(),
    experience: sectionArray(parsedExperienceItemSchema),
    education: sectionArray(parsedEducationItemSchema),
    skills: sectionArray(parsedSkillItemSchema),
    projects: sectionArray(parsedProjectItemSchema),
    researchPapers: sectionArray(parsedResearchPaperItemSchema),
    certifications: sectionArray(parsedCertificationItemSchema),
    achievements: z.array(parsedFieldSchema(z.string().trim().min(1))).optional(),
    publications: z
      .array(
        z.object({
          title: optionalStr,
          venue: optionalStr,
          date: optionalStr,
          url: optionalUrl,
          _meta: itemMetaSchema.optional(),
        }),
      )
      .optional(),
    extractedLinks: z.array(extractedLinkSchema).default([]),
    warnings: z.array(parseWarningSchema).default([]),
    confidence: z
      .object({
        overall: z.number().min(0).max(1).default(0.6),
        personalInfo: z.number().min(0).max(1).default(0.6),
        education: z.number().min(0).max(1).default(0.6),
        experience: z.number().min(0).max(1).default(0.6),
        projects: z.number().min(0).max(1).default(0.6),
        researchPapers: z.number().min(0).max(1).default(0.6),
        skills: z.number().min(0).max(1).default(0.6),
        certifications: z.number().min(0).max(1).default(0.6),
      })
      .default({
        overall: 0.6,
        personalInfo: 0.6,
        education: 0.6,
        experience: 0.6,
        projects: 0.6,
        researchPapers: 0.6,
        skills: 0.6,
        certifications: 0.6,
      }),
  }),
);

export const applyResumeSchema = z
  .object({
    personal: parsedPersonalSchema.optional(),
    personalInfo: parsedPersonalInfoSchema.optional(),
    selectedPersonalFields: z.array(z.string()).optional(),
    experience: sectionArray(parsedExperienceItemSchema),
    education: sectionArray(parsedEducationItemSchema),
    skills: sectionArray(parsedSkillItemSchema),
    projects: sectionArray(parsedProjectItemSchema),
    researchPapers: sectionArray(parsedResearchPaperItemSchema),
    certifications: sectionArray(parsedCertificationItemSchema),
    mergeStrategy: z.enum(['skip_duplicates', 'update_existing']).default('skip_duplicates'),
  })
  .transform((data) => {
    if (!data.personal && data.personalInfo) {
      const parsed = parsedPersonalSchema.safeParse(
        legacyPersonalFromPersonalInfo(data.personalInfo),
      );
      return { ...data, personal: parsed.success ? parsed.data : undefined };
    }
    return data;
  });

export const resumeDocumentParamsSchema = z.object({
  id: z.string().uuid('Resume document id must be a valid UUID'),
});

export type ParseWarning = z.infer<typeof parseWarningSchema>;
export type ExtractedLink = z.infer<typeof extractedLinkSchema>;
export type ParsedResumeData = z.infer<typeof parsedResumeDataSchema>;
export type ParsedPersonal = z.infer<typeof parsedPersonalSchema>;
export type ParsedPersonalInfo = z.infer<typeof parsedPersonalInfoSchema>;
export type ParsedExperienceItem = z.infer<typeof parsedExperienceItemSchema>;
export type ParsedEducationItem = z.infer<typeof parsedEducationItemSchema>;
export type ParsedSkillItem = z.infer<typeof parsedSkillItemSchema>;
export type ParsedProjectItem = z.infer<typeof parsedProjectItemSchema>;
export type ParsedResearchPaperItem = z.infer<typeof parsedResearchPaperItemSchema>;
export type ParsedCertificationItem = z.infer<typeof parsedCertificationItemSchema>;
export type ApplyResumeInput = z.infer<typeof applyResumeSchema>;
export type ResumeDocumentParams = z.infer<typeof resumeDocumentParamsSchema>;
