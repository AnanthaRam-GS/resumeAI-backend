import { pool } from '../../db/client.js';
import { analyzeJobDescription } from '../ai/jd-analyzer.service.js';
import { listPortfolioItems } from '../portfolio/portfolio.service.js';
import { getProfile } from '../profile/profile.service.js';
import { scorePortfolioItems } from '../ai/portfolio-scorer.service.js';
import { selectPortfolioItems } from '../ai/item-selector.service.js';
import { requestNimJson } from '../../services/nvidia-nim.service.js';
import { renderHtmlToPdfBuffer } from '../../services/pdf-renderer.service.js';
import { uploadFile } from '../../services/storage.service.js';
import { scoreAtsMatch } from '../../services/ats-scorer.service.js';
import { resumeGenerationPrompt } from '../ai/prompts/resume-generation.prompt.js';
import { generateVersionLabel } from '../../utils/version-label.js';
import { ValidationError } from '../../utils/errors.js';
import { ACADEMIC_SERIF_BASE_CSS } from './academic-serif-template.js';
import {
  assertSupportedOutputLanguage,
  getLanguageLabel,
} from '../../services/language.service.js';
import { scorePortfolioBySemanticSimilarity } from '../../services/semantic-search.service.js';
import { assertAndConsumeUsageBatch } from '../../services/entitlements.service.js';
import { trackEvent } from '../../services/analytics-events.service.js';
import { embedJobTarget } from '../../services/embedding.service.js';
import { recordAtsBenchmark } from '../analytics/benchmark.service.js';
import {
  DEFAULT_PROJECT_COUNT,
  rankProjects,
  toRankableProjectFromPortfolioItem,
} from '../analytics/project-ranking.service.js';
import {
  isResumeTemplateId,
  normalizeResumeTemplateId,
  renderResumeHtml,
  RESUME_PDF_MARGIN,
} from './templates/index.js';
import type { PortfolioItemRecord, ScoredItem, SelectedItem } from '../../types/ai.types.js';

type UserContact = {
  full_name: string;
  email: string;
  phone_number?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  location?: string | null;
};

type GenerateResumeInput = {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  templateId?: string;
  pageLength?: string;
  outputLanguage?: string;
  jobTargetId?: string;
  projectCount?: number;
  selectedProjectIds?: string[];
};

type GeneratedResumeContent = {
  summary?: string;
  experience?: Array<{
    company?: string;
    role?: string;
    period?: string;
    bullets?: string[];
  }>;
  projects?: Array<{
    name?: string;
    description?: string;
    tech_stack?: string[];
    bullets?: string[];
    project_url?: string;
  }>;
  researchPapers?: Array<{
    title?: string;
    authors?: string[];
    venue?: string;
    year?: string;
    doi?: string;
    arxivUrl?: string;
    publicationUrl?: string;
    githubUrl?: string;
    description?: string;
    keywords?: string[];
    status?: string;
  }>;
  skills?: Record<string, string[]>;
  education?: Array<{
    institution?: string;
    degree?: string;
    period?: string;
    gpa?: string;
  }>;
  certifications?: Array<{
    name?: string;
    issuer?: string;
    date?: string;
  }>;
};

type GeneratedProject = NonNullable<GeneratedResumeContent['projects']>[number];

const extraText = (item: PortfolioItemRecord, key: string): string | undefined => {
  const value = item.extra?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const extraStringArray = (item: PortfolioItemRecord, key: string): string[] =>
  Array.isArray(item.extra?.[key])
    ? (item.extra[key] as unknown[]).map((value) => cleanText(value)).filter(Boolean)
    : [];

const researchPaperFromPortfolioItem = (item: PortfolioItemRecord): NonNullable<GeneratedResumeContent['researchPapers']>[number] => ({
  title: item.title,
  authors: extraStringArray(item, 'authors'),
  venue: extraText(item, 'venue'),
  year: extraText(item, 'year') ?? formatDateValue(item.start_date).slice(-4),
  doi: extraText(item, 'doi'),
  arxivUrl: extraText(item, 'arxivUrl'),
  publicationUrl: extraText(item, 'publicationUrl') ?? item.project_url ?? undefined,
  githubUrl: extraText(item, 'githubUrl'),
  description: item.description ?? undefined,
  keywords: extraStringArray(item, 'keywords'),
  status: extraText(item, 'status') ?? 'unknown',
});

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const ensureUrl = (value: string): string =>
  /^https?:\/\//i.test(value) ? value : `https://${value}`;

const displayUrl = (value: string): string => value.replace(/^https?:\/\/(www\.)?/i, '');

const renderBulletList = (bullets?: string[]): string =>
  `<ul>${(bullets ?? []).map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>`;

const MONTH_FORMATTER = new Intl.DateTimeFormat('en', {
  month: 'short',
  year: 'numeric',
});

const cleanText = (value: unknown): string =>
  String(value ?? '')
    .replace(/#+/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeComparableText = (value: unknown): string =>
  cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const dedupeBullets = (bullets: unknown[] | undefined, ...existingText: unknown[]): string[] => {
  const references = existingText.map(normalizeComparableText).filter((text) => text.length >= 40);
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const bullet of bullets ?? []) {
    const cleaned = cleanText(bullet);
    const comparable = normalizeComparableText(cleaned);
    if (!cleaned || !comparable || seen.has(comparable)) continue;

    const duplicatesExisting = references.some(
      (reference) =>
        comparable === reference ||
        comparable.includes(reference) ||
        reference.includes(comparable),
    );
    if (duplicatesExisting) continue;

    seen.add(comparable);
    deduped.push(cleaned);
  }

  return deduped;
};

const formatDateValue = (value: unknown): string => {
  if (!value) return '';
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? '' : MONTH_FORMATTER.format(value);

  const text = cleanText(value);
  if (!text) return '';

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}|GMT|UTC|T\d{2}:/i.test(text)) {
    return MONTH_FORMATTER.format(parsed);
  }

  return text;
};

const formatPeriod = (
  startDate: unknown,
  endDate: unknown,
  isCurrent?: boolean | null,
): string | undefined => {
  const start = formatDateValue(startDate);
  const end = isCurrent ? 'Present' : formatDateValue(endDate);

  if (start && end) return `${start} - ${end}`;
  return start || end || undefined;
};

const updateJobStatus = async (
  jobId: string,
  status: string,
  stage: string,
  percent: number,
): Promise<void> => {
  await pool.query(
    `UPDATE resume_generation_jobs
     SET status = $1, current_stage = $2, progress_percent = $3
     WHERE id = $4`,
    [status, stage, percent, jobId],
  );
};

const selectRankedProjects = (
  scoredItems: ScoredItem[],
  projectIds: string[],
): SelectedItem[] => {
  const scoredById = new Map(scoredItems.map((item) => [item.item.id, item]));
  return projectIds
    .map((projectId) => scoredById.get(projectId))
    .filter((item): item is ScoredItem => Boolean(item))
    .map((item, index) => ({
      ...item,
      selectionRank: index + 1,
    }));
};

const validateManualProjectSelection = (
  requestedIds: string[],
  projects: PortfolioItemRecord[],
): string[] => {
  const projectIdSet = new Set(projects.map((project) => project.id));
  const uniqueRequestedIds = Array.from(new Set(requestedIds));
  const invalidIds = uniqueRequestedIds.filter((id) => !projectIdSet.has(id));

  if (invalidIds.length > 0) {
    throw new ValidationError('One or more selected projects were not found in your portfolio.');
  }

  return uniqueRequestedIds;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const buildResumeHtml = (
  content: GeneratedResumeContent,
  jobTitle: string,
  companyName: string,
  selected: SelectedItem[],
  contact?: UserContact,
): string => {
  const skillRows = Object.entries(content.skills ?? {})
    .map(
      ([category, skills]) =>
        `<tr><td class="skill-cat">${escapeHtml(category)}</td><td>${skills.map(escapeHtml).join(', ')}</td></tr>`,
    )
    .join('');

  const experienceHtml = (content.experience ?? [])
    .map(
      (exp) => `
      <div class="entry">
        <div class="entry-header">
          <span class="entry-title">${escapeHtml(exp.role)}</span>
          <span class="entry-period">${escapeHtml(exp.period)}</span>
        </div>
        <div class="entry-org">${escapeHtml(exp.company)}</div>
        ${renderBulletList(exp.bullets)}
      </div>`,
    )
    .join('');

  const projectsHtml = (content.projects ?? [])
    .map(
      (proj) => `
      <div class="entry">
        <div class="entry-header">
          <span class="entry-title">${escapeHtml(proj.name)}</span>
          <span class="entry-tech">${(proj.tech_stack ?? []).map(escapeHtml).join(' · ')}</span>
        </div>
        ${proj.description ? `<div class="entry-desc">${escapeHtml(proj.description)}</div>` : ''}
        ${renderBulletList(proj.bullets)}
      </div>`,
    )
    .join('');

  const educationHtml = (content.education ?? [])
    .map(
      (edu) => `
      <div class="entry">
        <div class="entry-header">
          <span class="entry-title">${escapeHtml(edu.degree)}</span>
          <span class="entry-period">${escapeHtml(edu.period)}</span>
        </div>
        <div class="entry-org">${escapeHtml(edu.institution)}${edu.gpa ? ` &mdash; GPA: ${escapeHtml(edu.gpa)}` : ''}</div>
      </div>`,
    )
    .join('');

  const certHtml = (content.certifications ?? [])
    .map(
      (cert) =>
        `<div class="cert-entry"><strong>${escapeHtml(cert.name)}</strong>` +
        (cert.issuer ? ` &mdash; ${escapeHtml(cert.issuer)}` : '') +
        (cert.date ? ` (${escapeHtml(cert.date)})` : '') +
        `</div>`,
    )
    .join('');

  // Fallback: if Gemini returned no structured sections, show selected item titles
  const fallbackSection =
    !content.summary && !content.experience?.length && !content.projects?.length
      ? `<section><h2>Portfolio Highlights</h2>${selected.map((s) => `<div class="entry"><span class="entry-title">${escapeHtml(s.item.title)}</span><p>${escapeHtml(s.item.description)}</p></div>`).join('')}</section>`
      : '';

  // Build contact info row
  const contactItems: string[] = [];
  if (contact?.email)
    contactItems.push(
      `<a class="contact-item" href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>`,
    );
  if (contact?.phone_number)
    contactItems.push(
      `<a class="contact-item" href="tel:${escapeHtml(contact.phone_number.replace(/\s+/g, ''))}">${escapeHtml(contact.phone_number)}</a>`,
    );
  if (contact?.location) contactItems.push(`<span>${escapeHtml(contact.location)}</span>`);
  const socialItems: string[] = [];
  if (contact?.github_url)
    socialItems.push(
      `<a class="contact-item" href="${escapeHtml(ensureUrl(contact.github_url))}">${escapeHtml(displayUrl(contact.github_url))}</a>`,
    );
  if (contact?.linkedin_url)
    socialItems.push(
      `<a class="contact-item" href="${escapeHtml(ensureUrl(contact.linkedin_url))}">${escapeHtml(displayUrl(contact.linkedin_url))}</a>`,
    );
  if (contact?.portfolio_url)
    socialItems.push(
      `<a class="contact-item" href="${escapeHtml(ensureUrl(contact.portfolio_url))}">${escapeHtml(displayUrl(contact.portfolio_url))}</a>`,
    );
  const contactHtml = [
    contactItems.length > 0
      ? `<div class="contact-row">${contactItems.join('<span class="contact-sep">|</span>')}</div>`
      : '',
    socialItems.length > 0
      ? `<div class="contact-row">${socialItems.join('<span class="contact-sep">|</span>')}</div>`
      : '',
  ].join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Resume - ${escapeHtml(jobTitle)} at ${escapeHtml(companyName)}</title>
  <style>
    ${ACADEMIC_SERIF_BASE_CSS}
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(contact?.full_name ?? 'Resume')}</h1>
    ${jobTitle ? `<div class="header-sub">Tailored for ${escapeHtml(jobTitle)}${companyName ? ` at ${escapeHtml(companyName)}` : ''}</div>` : ''}
    ${contactHtml}
  </header>

  ${content.summary ? `<section><h2>Summary</h2><p class="summary">${escapeHtml(content.summary)}</p></section>` : ''}

  ${content.experience?.length ? `<section><h2>Experience</h2>${experienceHtml}</section>` : ''}

  ${content.projects?.length ? `<section><h2>Projects</h2>${projectsHtml}</section>` : ''}

  ${Object.keys(content.skills ?? {}).length > 0 ? `<section><h2>Skills</h2><table>${skillRows}</table></section>` : ''}

  ${content.education?.length ? `<section><h2>Education</h2>${educationHtml}</section>` : ''}

  ${content.certifications?.length ? `<section><h2>Certifications</h2>${certHtml}</section>` : ''}

  ${fallbackSection}
</body>
  </html>`;
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] =>
  Array.from(
    new Set(
      values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)),
    ),
  );

const SKILL_CATEGORY_ORDER = [
  'Programming Languages',
  'Frontend',
  'Backend',
  'Databases',
  'Cloud & DevOps',
  'Data & AI',
  'Testing & Quality',
  'Tools',
  'Other',
];

const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  {
    category: 'Programming Languages',
    keywords: ['typescript', 'javascript', 'python', 'java', 'go', 'golang', 'c', 'c++', 'c#', 'ruby', 'php', 'rust', 'swift', 'kotlin'],
  },
  {
    category: 'Frontend',
    keywords: ['react', 'next js', 'vue', 'angular', 'html', 'css', 'tailwind', 'redux', 'vite'],
  },
  {
    category: 'Backend',
    keywords: ['node js', 'fastify', 'express', 'rest api', 'graphql', 'microservices', 'api', 'serverless'],
  },
  {
    category: 'Databases',
    keywords: ['postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'sql', 'database', 'supabase', 'prisma'],
  },
  {
    category: 'Cloud & DevOps',
    keywords: ['aws', 'gcp', 'azure', 'docker', 'kubernetes', 'k8s', 'ci cd', 'github actions', 'terraform', 's3'],
  },
  {
    category: 'Data & AI',
    keywords: ['machine learning', 'artificial intelligence', 'ai', 'ml', 'llm', 'rag', 'pandas', 'numpy', 'scikit learn', 'tensorflow', 'pytorch'],
  },
  {
    category: 'Testing & Quality',
    keywords: ['testing', 'vitest', 'jest', 'playwright', 'cypress', 'debugging', 'performance tuning'],
  },
  {
    category: 'Tools',
    keywords: ['git', 'github', 'jira', 'figma', 'postman', 'linux', 'bash'],
  },
];

const normalizePhrase = (value: unknown): string =>
  cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const evidenceContainsSkill = (evidenceText: string, skill: string): boolean => {
  const normalizedSkill = normalizePhrase(skill);
  if (!normalizedSkill) return false;
  return ` ${evidenceText} `.includes(` ${normalizedSkill} `);
};

const selectedEvidenceText = (selected: SelectedItem[]): string =>
  normalizePhrase(
    selected
      .flatMap(({ item }) => [
        item.title,
        item.description,
        item.company_name,
        item.domain_category,
        item.degree,
        item.field_of_study,
        item.institution_name,
        item.achievements,
        item.issuing_org,
        item.skill_name,
        item.impact_metrics,
        ...(item.tech_stack ?? []),
      ])
      .filter(Boolean)
      .join(' '),
  );

const selectedSkills = (selected: SelectedItem[]): string[] =>
  uniqueStrings(
    selected.flatMap(({ item }) => [
      item.skill_name ?? undefined,
      ...(item.type === 'skill' ? [item.title] : []),
      ...(item.tech_stack ?? []),
    ]),
  );

const categorizeSkill = (skill: string): string => {
  const normalized = normalizePhrase(skill);
  const matchedRule = CATEGORY_KEYWORDS.find((rule) =>
    rule.keywords.some((keyword) => normalized === keyword || ` ${normalized} `.includes(` ${keyword} `)),
  );
  return matchedRule?.category ?? 'Other';
};

const orderSkillCategories = (skills: Record<string, string[]>): Record<string, string[]> => {
  const entries = Object.entries(skills).filter(([, values]) => values.length > 0);
  entries.sort(([left], [right]) => {
    const leftIndex = SKILL_CATEGORY_ORDER.indexOf(left);
    const rightIndex = SKILL_CATEGORY_ORDER.indexOf(right);
    return (
      (leftIndex === -1 ? SKILL_CATEGORY_ORDER.length : leftIndex) -
        (rightIndex === -1 ? SKILL_CATEGORY_ORDER.length : rightIndex) ||
      left.localeCompare(right)
    );
  });
  return Object.fromEntries(entries);
};

const normalizeResumeSkills = (
  rawSkills: GeneratedResumeContent['skills'],
  selected: SelectedItem[],
): Record<string, string[]> => {
  const evidenceText = selectedEvidenceText(selected);
  const explicitCandidateSkills = selectedSkills(selected);
  const explicitSkillSet = new Set(explicitCandidateSkills.map(normalizePhrase));
  const rawSkillValues = Object.values(rawSkills ?? {}).flatMap((values) => values ?? []);
  const groundedSkills = uniqueStrings([...rawSkillValues, ...explicitCandidateSkills])
    .filter((skill) => explicitSkillSet.has(normalizePhrase(skill)) || evidenceContainsSkill(evidenceText, skill));
  const categorized = new Map<string, string[]>();

  for (const skill of groundedSkills) {
    const category = categorizeSkill(skill);
    categorized.set(category, uniqueStrings([...(categorized.get(category) ?? []), skill]));
  }

  return orderSkillCategories(Object.fromEntries(categorized));
};

const truncateAtWord = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) return value;
  const truncated = value.slice(0, maxChars + 1);
  const lastSpace = truncated.lastIndexOf(' ');
  const result = truncated.slice(0, lastSpace > 60 ? lastSpace : maxChars).trim();
  return result.replace(/[.,;:\s]+$/, '');
};

const limitWords = (value: string, maxWords: number): string => {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value;
  return words.slice(0, maxWords).join(' ').replace(/[.,;:\s]+$/, '');
};

const projectDensity = (pageLength: string, projectCount: number): {
  descriptionChars: number;
  bulletCount: number;
  bulletWords: number;
  techCount: number;
} => {
  if (pageLength !== '1-page') {
    return { descriptionChars: 260, bulletCount: 3, bulletWords: 22, techCount: 8 };
  }
  if (projectCount <= 2) {
    return { descriptionChars: 230, bulletCount: 2, bulletWords: 18, techCount: 7 };
  }
  if (projectCount === 3) {
    return { descriptionChars: 170, bulletCount: 2, bulletWords: 16, techCount: 6 };
  }
  return { descriptionChars: 130, bulletCount: 1, bulletWords: 15, techCount: 5 };
};

const normalizeProjectText = (value: unknown, maxChars: number): string | undefined => {
  const cleaned = cleanText(value);
  if (!cleaned) return undefined;
  return truncateAtWord(cleaned, maxChars);
};

const findGeneratedProject = (
  generatedProjects: GeneratedResumeContent['projects'],
  selection: SelectedItem,
  index: number,
): GeneratedProject | undefined => {
  const selectedTitle = normalizeComparableText(selection.item.title);
  return (
    generatedProjects?.find((project) => normalizeComparableText(project.name) === selectedTitle) ??
    generatedProjects?.[index]
  );
};

const normalizeProjects = (
  generatedProjects: GeneratedResumeContent['projects'],
  selected: SelectedItem[],
  pageLength: string,
): GeneratedResumeContent['projects'] => {
  const selectedProjects = selected.filter((selection) => selection.item.type === 'project');
  const density = projectDensity(pageLength, selectedProjects.length);

  return selectedProjects.map((selection, index) => {
    const generated = findGeneratedProject(generatedProjects, selection, index);
    const projectEvidence = normalizePhrase(
      [
        selection.item.title,
        selection.item.description,
        selection.item.impact_metrics,
        selection.item.project_url,
        ...(selection.item.tech_stack ?? []),
      ].filter(Boolean).join(' '),
    );
    const candidateDescription =
      normalizeProjectText(generated?.description, density.descriptionChars) ??
      normalizeProjectText(selection.item.description, density.descriptionChars);
    const techStack = uniqueStrings([
      ...(generated?.tech_stack ?? []),
      ...(selection.item.tech_stack ?? []),
    ])
      .filter((skill) => evidenceContainsSkill(projectEvidence, skill))
      .slice(0, density.techCount);
    const bullets = dedupeBullets(generated?.bullets, candidateDescription)
      .map((bullet) => limitWords(bullet, density.bulletWords))
      .filter(Boolean)
      .slice(0, density.bulletCount);

    return {
      name: selection.item.title,
      description: candidateDescription,
      tech_stack: techStack,
      bullets: bullets.length > 0 ? bullets : evidenceBullets(selection).slice(0, density.bulletCount),
    };
  });
};

const formatProviderError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const itemPeriod = (item: SelectedItem['item']): string | undefined => {
  return formatPeriod(item.start_date, item.end_date, item.is_current);
};

const evidenceBullets = (
  selected: SelectedItem,
  options: { includeDescription?: boolean } = {},
): string[] => {
  const item = selected.item;
  const matchedSkills = selected.matchedSkills ?? [];
  const bullets = uniqueStrings([
    options.includeDescription ? item.description : undefined,
    item.impact_metrics ? `Delivered measurable impact: ${item.impact_metrics}` : undefined,
    item.tech_stack?.length ? `Applied ${item.tech_stack.slice(0, 6).join(', ')}.` : undefined,
    matchedSkills.length
      ? `Aligned experience with ${matchedSkills.slice(0, 5).join(', ')}.`
      : undefined,
  ]);

  return bullets.length > 0
    ? bullets.slice(0, 3)
    : [`Highlighted ${item.title} as relevant evidence for the target role.`];
};

const buildFallbackResumeContent = (
  jobTitle: string,
  companyName: string,
  selected: SelectedItem[],
): GeneratedResumeContent => {
  const selectedTech = selected.flatMap((selection) => selection.item.tech_stack ?? []);
  const technicalSkills = uniqueStrings([...selectedTech, ...selectedSkills(selected)]);
  const summary = buildResumeSummary(jobTitle, companyName, technicalSkills, selected);

  const experience = selected
    .filter((selection) => selection.item.type === 'experience')
    .map((selection) => ({
      company: selection.item.company_name ?? 'Relevant Experience',
      role: selection.item.title,
      period: itemPeriod(selection.item),
      bullets: evidenceBullets(selection, { includeDescription: true }),
    }));

  const projects = selected
    .filter((selection) => selection.item.type === 'project')
    .map((selection) => ({
      name: selection.item.title,
      description: selection.item.description ?? undefined,
      tech_stack: selection.item.tech_stack ?? undefined,
      bullets: evidenceBullets(selection),
    }));

  const researchPapers = selected
    .filter((selection) => selection.item.type === 'research_paper')
    .map((selection) => researchPaperFromPortfolioItem(selection.item));

  const portfolioHighlights =
    experience.length === 0 && projects.length === 0
      ? selected.slice(0, 4).map((selection) => ({
          name: selection.item.title,
          description: selection.item.description ?? undefined,
          tech_stack: selection.item.tech_stack ?? undefined,
          bullets: evidenceBullets(selection),
        }))
      : [];

  return {
    summary,
    experience,
    projects: [...projects, ...portfolioHighlights],
    researchPapers,
    skills: normalizeResumeSkills({ Technical: technicalSkills }, selected),
    education: selected
      .filter((selection) => selection.item.type === 'education')
      .map((selection) => ({
        institution: selection.item.institution_name ?? undefined,
        degree: selection.item.degree ?? selection.item.title,
        period: itemPeriod(selection.item),
        gpa: selection.item.gpa ?? undefined,
      })),
    certifications: selected
      .filter((selection) => selection.item.type === 'certification')
      .map((selection) => ({
        name: selection.item.title,
        issuer: selection.item.issuing_org ?? undefined,
      })),
  };
};

const isInvalidSummary = (summary: string | undefined): boolean => {
  if (!summary?.trim()) return true;
  return /^#|job description|^company$|^about the role$/i.test(summary.trim());
};

const buildResumeSummary = (
  jobTitle: string,
  companyName: string,
  skills: string[],
  selected: SelectedItem[],
): string => {
  const topSkills = skills.slice(0, 5).join(', ');
  const topEvidence = selected
    .filter((item) => ['project', 'experience'].includes(item.item.type))
    .slice(0, 2)
    .map((item) => item.item.title)
    .filter(Boolean);
  const roleLabel = jobTitle.trim() || 'target role';
  const companyClause = companyName.trim() ? ` at ${companyName.trim()}` : '';
  const skillClause = topSkills ? ` with strength in ${topSkills}` : '';
  const evidenceClause = topEvidence.length
    ? `, backed by work on ${topEvidence.join(' and ')}`
    : '';

  return `Candidate aligned to the ${roleLabel}${companyClause}${skillClause}${evidenceClause}. Brings relevant portfolio evidence, practical execution, and role-focused communication to deliver measurable impact.`;
};

const normalizeGeneratedContent = (
  content: GeneratedResumeContent,
  fallback: {
    jobTitle: string;
    companyName: string;
    selected: SelectedItem[];
    pageLength: string;
  },
): GeneratedResumeContent => {
  const skills = selectedSkills(fallback.selected);
  const summary = cleanText(content.summary);

  return {
    ...content,
    summary: isInvalidSummary(summary)
      ? buildResumeSummary(fallback.jobTitle, fallback.companyName, skills, fallback.selected)
      : summary,
    experience: content.experience?.map((item) => ({
      ...item,
      role: cleanText(item.role),
      company: cleanText(item.company),
      period: cleanText(item.period),
      bullets: dedupeBullets(item.bullets),
    })),
    projects: normalizeProjects(content.projects, fallback.selected, fallback.pageLength),
    researchPapers: (content.researchPapers?.length
      ? content.researchPapers
      : fallback.selected
          .filter((selection) => selection.item.type === 'research_paper')
          .map((selection) => researchPaperFromPortfolioItem(selection.item))
    )?.map((item) => ({
      ...item,
      title: cleanText(item.title),
      authors: uniqueStrings(item.authors ?? []),
      venue: cleanText(item.venue),
      year: cleanText(item.year),
      doi: cleanText(item.doi),
      arxivUrl: cleanText(item.arxivUrl),
      publicationUrl: cleanText(item.publicationUrl),
      githubUrl: cleanText(item.githubUrl),
      description: cleanText(item.description),
      keywords: uniqueStrings(item.keywords ?? []),
      status: cleanText(item.status) || 'unknown',
    })).filter((item) => item.title),
    skills: normalizeResumeSkills(content.skills, fallback.selected),
    education: content.education?.map((item) => ({
      ...item,
      institution: cleanText(item.institution),
      degree: cleanText(item.degree),
      period: cleanText(item.period),
      gpa: cleanText(item.gpa),
    })),
    certifications: content.certifications?.map((item) => ({
      ...item,
      name: cleanText(item.name),
      issuer: cleanText(item.issuer),
      date: cleanText(item.date),
    })),
  };
};

export const generateResumeForJob = async (userId: string, input: GenerateResumeInput) => {
  await assertAndConsumeUsageBatch(userId, [{ key: 'resume_generation' }, { key: 'ai_request' }]);
  const outputLanguage = assertSupportedOutputLanguage(input.outputLanguage);
  const outputLanguageLabel = getLanguageLabel(outputLanguage);
  const pageLength = input.pageLength ?? '1-page';
  const templateId = normalizeResumeTemplateId(input.templateId);
  if (input.templateId && !isResumeTemplateId(input.templateId)) {
    console.warn(`[resume] Unsupported template "${input.templateId}" requested. Falling back to primary.`);
  }

  // Fetch user contact info for the PDF header
  let userContact: UserContact | undefined;
  try {
    userContact = (await getProfile(userId)) as UserContact;
  } catch {
    // non-blocking — resume generates without contact info
  }

  const jobTargetResult = input.jobTargetId
    ? await pool.query<{
        id: string;
        job_title: string;
        company_name: string;
        job_description: string;
      }>(
        `SELECT id, job_title, company_name, job_description
       FROM job_targets
       WHERE id = $1 AND user_id = $2`,
        [input.jobTargetId, userId],
      )
    : await pool.query<{
        id: string;
        job_title: string;
        company_name: string;
        job_description: string;
      }>(
        `INSERT INTO job_targets (user_id, job_title, company_name, job_description, output_language)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, job_title, company_name, job_description`,
        [userId, input.jobTitle, input.companyName, input.jobDescription, outputLanguage],
      );
  const jobTarget = jobTargetResult.rows[0];
  if (!jobTarget) {
    throw new ValidationError('Job target not found or not accessible.');
  }
  const jobTitle = jobTarget.job_title;
  const companyName = jobTarget.company_name;
  const jobDescription = jobTarget.job_description;

  void embedJobTarget(userId, jobTarget.id).catch(() => undefined);

  // Create generation job
  const generationJobResult = await pool.query<{ id: string }>(
    `INSERT INTO resume_generation_jobs (user_id, job_target_id, status, current_stage, progress_percent)
     VALUES ($1, $2, 'queued', 'created', 0)
     RETURNING id`,
    [userId, jobTarget.id],
  );
  const generationJob = generationJobResult.rows[0]!;

  // Stage 1: Analyze JD
  await updateJobStatus(generationJob.id, 'analyzing_jd', 'analyzing_jd', 10);
  const extractedEntities = await analyzeJobDescription(jobDescription);

  await pool.query(`UPDATE job_targets SET extracted_entities = $1 WHERE id = $2`, [
    JSON.stringify(extractedEntities),
    jobTarget.id,
  ]);

  // Stage 2: Score portfolio
  await updateJobStatus(generationJob.id, 'scoring_portfolio', 'scoring_portfolio', 25);
  const portfolioItems = await listPortfolioItems(userId, { limit: 200 });
  if (portfolioItems.length === 0) {
    await pool.query(
      `UPDATE resume_generation_jobs
       SET status = 'failed', current_stage = 'failed', progress_percent = 100,
           error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      ['Add at least one portfolio item before generating a resume.', generationJob.id],
    );
    throw new ValidationError('Add at least one portfolio item before generating a resume.');
  }
  const portfolioRecords = portfolioItems as PortfolioItemRecord[];
  const projectItems = portfolioRecords.filter((item) => item.type === 'project');
  if (projectItems.length === 0) {
    await pool.query(
      `UPDATE resume_generation_jobs
       SET status = 'failed', current_stage = 'failed', progress_percent = 100,
           error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      ['Add at least one project before generating a targeted resume.', generationJob.id],
    );
    throw new ValidationError('Add at least one project before generating a targeted resume.');
  }

  const scored = scorePortfolioItems(portfolioRecords, extractedEntities, jobDescription);
  const semanticScores = await scorePortfolioBySemanticSimilarity(userId, jobDescription);
  const semanticById = new Map(semanticScores.map((item) => [item.id, item.semanticScore]));
  const semanticallyBlended =
    semanticById.size > 0
      ? scored
          .map((item) => {
            const semantic = semanticById.get(item.item.id) ?? 0;
            const blendedScore = Math.min(100, Math.round(item.score * 0.7 + semantic * 100 * 0.3));
            return {
              ...item,
              score: blendedScore,
              reasons:
                semantic > 0
                  ? [...item.reasons, `Semantic similarity ${(semantic * 100).toFixed(0)}%.`]
                  : item.reasons,
            };
          })
          .sort(
            (left, right) =>
              right.score - left.score || left.item.title.localeCompare(right.item.title),
          )
      : scored;

  const selectedProjectIds = input.selectedProjectIds && input.selectedProjectIds.length > 0
    ? validateManualProjectSelection(input.selectedProjectIds, projectItems)
    : (await rankProjects(
        userId,
        projectItems.map((item) => toRankableProjectFromPortfolioItem(item)),
        extractedEntities,
        jobDescription,
        input.projectCount ?? DEFAULT_PROJECT_COUNT,
      )).selectedProjectIds;

  const selectedProjects = selectRankedProjects(semanticallyBlended, selectedProjectIds);
  const selectedNonProjects = selectPortfolioItems(
    semanticallyBlended.filter((item) => item.item.type !== 'project'),
    pageLength === '1-page'
      ? { project: 0, experience: 2, education: 1, skill: 5, certification: 1 }
      : { project: 0 },
  );
  const selected = [...selectedProjects, ...selectedNonProjects].map((item, index) => ({
    ...item,
    selectionRank: index + 1,
  }));
  const selectedIds = selected.map((s) => s.item.id);

  // Stage 3: Generate content
  await updateJobStatus(generationJob.id, 'generating_content', 'generating_content', 50);

  const generationPayload = {
    jobTitle,
    companyName,
    outputLanguage,
    outputLanguageLabel,
    pageLength,
    extractedEntities,
    selectedProjectIds,
    requestedProjectCount: input.projectCount ?? DEFAULT_PROJECT_COUNT,
    selectedItems: selected.map((s) => ({
      type: s.item.type,
      title: s.item.title,
      description: s.item.description,
      tech_stack: s.item.tech_stack,
      impact_metrics: s.item.impact_metrics,
      company_name: s.item.company_name,
      role: s.item.title,
      period: formatPeriod(s.item.start_date, s.item.end_date, s.item.is_current),
      institution_name: s.item.institution_name,
      degree: s.item.degree,
      gpa: s.item.gpa,
      skill_name: s.item.skill_name,
      issuing_org: s.item.issuing_org,
      research_paper: s.item.type === 'research_paper' ? researchPaperFromPortfolioItem(s.item) : undefined,
    })),
  };

  let generatedContent: GeneratedResumeContent;
  try {
    generatedContent = await requestNimJson<GeneratedResumeContent>({
      systemPrompt: `${resumeGenerationPrompt}\n\nOutput language: ${outputLanguageLabel}. Preserve names, companies, URLs, technologies, product names, code identifiers, and numeric metrics exactly unless normal grammar requires surrounding translated words.`,
      userPrompt: JSON.stringify(generationPayload),
      maxTokens: 2048,
      temperature: 0.3,
    });
  } catch (error) {
    console.warn(
      `[resume] Falling back to deterministic resume content. NIM: ${formatProviderError(error)}`,
    );
    generatedContent = buildFallbackResumeContent(
      jobTitle,
      companyName,
      selected,
    );
  }
  generatedContent = normalizeGeneratedContent(generatedContent, {
    jobTitle,
    companyName,
    selected,
    pageLength,
  });

  // Stage 4: Render PDF (best-effort — skip gracefully if renderer or storage unavailable)
  await updateJobStatus(generationJob.id, 'rendering_pdf', 'rendering_pdf', 75);

  let pdfKey: string | null = null;
  try {
    const html = renderResumeHtml({
      content: generatedContent as Record<string, unknown>,
      user: userContact,
      jobTitle,
      companyName,
      templateId,
    });
    const pdfBuffer = await renderHtmlToPdfBuffer(html, {
      format: 'A4',
      printBackground: true,
      margin: RESUME_PDF_MARGIN,
    });
    pdfKey = `users/${userId}/resumes/${generationJob.id}.pdf`;
    await uploadFile(pdfKey, pdfBuffer, 'application/pdf');
  } catch {
    pdfKey = null;
  }

  // Stage 5: ATS scoring
  const resumeText = JSON.stringify(generatedContent);
  const ats = scoreAtsMatch({ jobDescription, resumeText, extractedEntities });
  await recordAtsBenchmark(extractedEntities.roleCategory, ats.score);

  // Determine version label
  const existingVersions = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM resume_versions
     WHERE user_id = $1 AND job_target_id = $2`,
    [userId, jobTarget.id],
  );
  const versionNumber = Number(existingVersions.rows[0]?.count ?? 0) + 1;
  const versionLabel = generateVersionLabel(jobTitle, companyName, versionNumber);

  // Persist resume version
  const resumeVersionResult = await pool.query<{
    id: string;
    pdf_s3_key: string | null;
    ats_score: string;
    version_label: string;
  }>(
    `INSERT INTO resume_versions (
       user_id, job_target_id, generation_job_id,
       template_id, page_length, version_label,
       selected_item_ids, generated_content,
       ats_score, ats_feedback, pdf_s3_key, output_language
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id, pdf_s3_key, ats_score, version_label`,
    [
      userId,
      jobTarget.id,
      generationJob.id,
      templateId,
      pageLength,
      versionLabel,
      selectedIds,
      JSON.stringify(generatedContent),
      ats.score,
      JSON.stringify(ats),
      pdfKey,
      outputLanguage,
    ],
  );
  const resumeVersion = resumeVersionResult.rows[0]!;

  // Mark job completed
  await pool.query(
    `UPDATE resume_generation_jobs
     SET status = 'completed', current_stage = 'done', progress_percent = 100, completed_at = NOW()
     WHERE id = $1`,
    [generationJob.id],
  );

  await trackEvent(userId, 'resume_generation_completed', {
    templateId,
    pageLength,
    score: ats.score,
    language: outputLanguage,
    selectedProjectCount: selectedProjectIds.length,
  });

  return {
    generationJobId: generationJob.id,
    jobTarget,
    resumeVersion: {
      id: resumeVersion.id,
      version_label: resumeVersion.version_label,
      pdf_s3_key: resumeVersion.pdf_s3_key,
      ats_score: resumeVersion.ats_score,
      output_language: outputLanguage,
    },
  };
};
