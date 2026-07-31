import {
  ACADEMIC_SERIF_FONT_FACE_CSS,
  ACADEMIC_SERIF_FONT_STACK,
} from '../academic-serif-template.js';

export type ResumeTemplateId =
  | 'primary'
  | 'classic-professional'
  | 'technical-modern'
  | 'executive-minimal';

export interface ResumeTemplateMetadata {
  id: ResumeTemplateId;
  name: string;
  description: string;
  category: 'standard' | 'classic' | 'technical' | 'minimal';
  atsFriendly: true;
  supportsPhoto: false;
}

export interface ResumeRenderUser {
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  location?: string | null;
  github_url?: string | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
}

export interface ResumeRenderContext {
  content: Record<string, unknown>;
  user?: ResumeRenderUser;
  jobTitle?: string;
  companyName?: string;
  templateId?: string | null;
}

interface ResumeEntry {
  title: string;
  subtitle?: string;
  meta?: string;
  detail?: string;
  url?: string;
  bullets: string[];
}

interface NormalizedResumeContent {
  summary?: string;
  skills: Array<{ category: string; items: string[] }>;
  experience: ResumeEntry[];
  projects: ResumeEntry[];
  researchPapers: ResumeEntry[];
  education: ResumeEntry[];
  certifications: ResumeEntry[];
  achievements: string[];
}

export const resumeTemplates: ResumeTemplateMetadata[] = [
  {
    id: 'primary',
    name: 'Primary',
    description: 'Default Signuture academic-style resume template.',
    category: 'standard',
    atsFriendly: true,
    supportsPhoto: false,
  },
  {
    id: 'classic-professional',
    name: 'Classic Professional',
    description: 'Traditional single-column ATS-safe layout for broad professional use.',
    category: 'classic',
    atsFriendly: true,
    supportsPhoto: false,
  },
  {
    id: 'technical-modern',
    name: 'Technical Modern',
    description: 'Modern engineering-focused layout with strong skills and project hierarchy.',
    category: 'technical',
    atsFriendly: true,
    supportsPhoto: false,
  },
  {
    id: 'executive-minimal',
    name: 'Executive Minimal',
    description: 'Elegant impact-first layout for polished professional applications.',
    category: 'minimal',
    atsFriendly: true,
    supportsPhoto: false,
  },
];

export const RESUME_PDF_MARGIN = {
  top: '0',
  right: '0',
  bottom: '0',
  left: '0',
};

const supportedTemplateIds = new Set<string>(resumeTemplates.map((template) => template.id));
const legacyTemplateAliases = new Set(['academic', 'modern', 'minimal']);

export const isResumeTemplateId = (value: unknown): value is ResumeTemplateId =>
  typeof value === 'string' && supportedTemplateIds.has(value);

export const normalizeResumeTemplateId = (value: unknown): ResumeTemplateId => {
  if (isResumeTemplateId(value)) return value;
  if (typeof value === 'string' && legacyTemplateAliases.has(value)) return 'primary';
  return 'primary';
};

export const getResumeTemplate = (value: unknown): ResumeTemplateMetadata =>
  resumeTemplates.find((template) => template.id === normalizeResumeTemplateId(value)) ??
  resumeTemplates[0]!;

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

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

const uniqueStrings = (values: unknown[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const text = cleanText(value);
    const comparable = normalizeComparableText(text);
    if (!text || !comparable || seen.has(comparable)) continue;
    seen.add(comparable);
    result.push(text);
  }

  return result;
};

const dedupeBullets = (values: unknown): string[] =>
  Array.isArray(values) ? uniqueStrings(values) : [];

const ensureUrl = (value: string): string =>
  /^https?:\/\//i.test(value) ? value : `https://${value}`;

const stripProtocol = (value: string): string =>
  value.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

const extractGithubUsername = (url: string): string => {
  const match = url.match(/github\.com\/([^/?#\s]+)/i);
  return match ? match[1]! : stripProtocol(url);
};

const extractLinkedinUsername = (url: string): string => {
  const match = url.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  return match ? match[1]! : stripProtocol(url);
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArrayOfRecords = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : [];

const normalizeSkills = (value: unknown): Array<{ category: string; items: string[] }> => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const record = asRecord(item);
        const category = cleanText(record.category ?? record.name);
        const items = Array.isArray(record.items)
          ? uniqueStrings(record.items)
          : uniqueStrings(String(record.items ?? '').split(','));
        return { category, items };
      })
      .filter((group) => group.category && group.items.length > 0);
  }

  return Object.entries(asRecord(value))
    .map(([category, items]) => ({
      category: cleanText(category),
      items: Array.isArray(items) ? uniqueStrings(items) : uniqueStrings(String(items ?? '').split(',')),
    }))
    .filter((group) => group.category && group.items.length > 0);
};

const normalizeEntry = (
  item: Record<string, unknown>,
  options: {
    titleKeys: string[];
    subtitleKeys?: string[];
    metaKeys?: string[];
    detailKeys?: string[];
    urlKeys?: string[];
  },
): ResumeEntry | undefined => {
  const pick = (keys: string[]): string | undefined => {
    for (const key of keys) {
      const text = cleanText(item[key]);
      if (text) return text;
    }
    return undefined;
  };
  const title = pick(options.titleKeys);
  if (!title) return undefined;

  const techStack = Array.isArray(item.tech_stack)
    ? uniqueStrings(item.tech_stack).join(' | ')
    : undefined;
  const url = pick(options.urlKeys ?? []);

  return {
    title,
    subtitle: pick(options.subtitleKeys ?? []),
    meta: pick(options.metaKeys ?? []) ?? techStack,
    detail: pick(options.detailKeys ?? []),
    url,
    bullets: dedupeBullets(item.bullets ?? item.details),
  };
};

const normalizeContent = (content: Record<string, unknown>): NormalizedResumeContent => {
  const experience = asArrayOfRecords(content.experience)
    .map((item) =>
      normalizeEntry(item, {
        titleKeys: ['role', 'title'],
        subtitleKeys: ['company', 'company_name', 'organization'],
        metaKeys: ['period', 'dateRange', 'date_range', 'location'],
        detailKeys: ['location'],
      }),
    )
    .filter((item): item is ResumeEntry => Boolean(item));

  const projectRecords = asArrayOfRecords(content.projects);
  const projects = projectRecords
    .map((item) =>
      normalizeEntry(item, {
        titleKeys: ['name', 'title'],
        subtitleKeys: ['techStackLabel'],
        metaKeys: ['period', 'dateRange', 'date_range'],
        detailKeys: ['description'],
        urlKeys: ['project_url', 'live_url', 'repository_url', 'url', 'link'],
      }),
    )
    .filter((item): item is ResumeEntry => Boolean(item))
    .map((project, index) => {
      const raw = projectRecords[index];
      const techStack = raw && Array.isArray(raw.tech_stack) ? uniqueStrings(raw.tech_stack).join(' | ') : '';
      return { ...project, subtitle: project.subtitle || techStack || undefined };
    });

  const education = asArrayOfRecords(content.education)
    .map((item) =>
      normalizeEntry(item, {
        titleKeys: ['degree', 'title'],
        subtitleKeys: ['institution', 'school', 'university'],
        metaKeys: ['period', 'dateRange', 'date_range', 'gpa'],
        detailKeys: ['location', 'gpa'],
      }),
    )
    .filter((item): item is ResumeEntry => Boolean(item));

  const certifications = asArrayOfRecords(content.certifications)
    .map((item) =>
      normalizeEntry(item, {
        titleKeys: ['name', 'title'],
        subtitleKeys: ['issuer', 'issuing_org'],
        metaKeys: ['date', 'period'],
        urlKeys: ['url', 'link'],
      }),
    )
    .filter((item): item is ResumeEntry => Boolean(item));

  const researchPapers = asArrayOfRecords(content.researchPapers)
    .map((item) => {
      const authors = Array.isArray(item.authors) ? uniqueStrings(item.authors).join(', ') : cleanText(item.authors);
      const venue = cleanText(item.venue);
      const year = cleanText(item.year);
      const doi = cleanText(item.doi);
      const arxivUrl = cleanText(item.arxivUrl);
      const publicationUrl = cleanText(item.publicationUrl);
      const githubUrl = cleanText(item.githubUrl);
      const keywords = Array.isArray(item.keywords) ? uniqueStrings(item.keywords).join(' | ') : cleanText(item.keywords);
      const links = [
        doi ? `DOI: ${doi}` : '',
        arxivUrl ? `arXiv: ${stripProtocol(arxivUrl)}` : '',
        publicationUrl ? stripProtocol(publicationUrl) : '',
        githubUrl ? `Code: ${stripProtocol(githubUrl)}` : '',
      ].filter(Boolean).join(' | ');
      const entry = normalizeEntry(
        {
          ...item,
          authors,
          venueYear: [venue, year].filter(Boolean).join(' | '),
          links,
          detail: [cleanText(item.description), keywords ? `Keywords: ${keywords}` : ''].filter(Boolean).join(' '),
        },
        {
          titleKeys: ['title', 'name'],
          subtitleKeys: ['authors'],
          metaKeys: ['venueYear'],
          detailKeys: ['detail'],
          urlKeys: ['publicationUrl', 'arxivUrl', 'githubUrl'],
        },
      );
      return entry ? { ...entry, bullets: links ? [links] : entry.bullets } : undefined;
    })
    .filter((item): item is ResumeEntry => Boolean(item));

  return {
    summary: cleanText(content.summary),
    skills: normalizeSkills(content.skills),
    experience,
    projects,
    researchPapers,
    education,
    certifications,
    achievements: dedupeBullets(content.achievements),
  };
};

const renderContact = (
  user: ResumeRenderUser | undefined,
  separator: 'pipe' | 'dot' = 'pipe',
): string => {
  const items: string[] = [];
  if (user?.email) {
    items.push(`<a href="mailto:${escapeHtml(user.email)}">${escapeHtml(user.email)}</a>`);
  }
  if (user?.phone_number) {
    items.push(
      `<a href="tel:${escapeHtml(user.phone_number.replace(/\s+/g, ''))}">${escapeHtml(user.phone_number)}</a>`,
    );
  }
  if (user?.location) items.push(`<span>${escapeHtml(user.location)}</span>`);
  if (user?.linkedin_url) {
    items.push(
      `<a href="${escapeHtml(ensureUrl(user.linkedin_url))}">${escapeHtml(extractLinkedinUsername(user.linkedin_url))}</a>`,
    );
  }
  if (user?.github_url) {
    items.push(
      `<a href="${escapeHtml(ensureUrl(user.github_url))}">${escapeHtml(extractGithubUsername(user.github_url))}</a>`,
    );
  }
  if (user?.portfolio_url) {
    items.push(
      `<a href="${escapeHtml(ensureUrl(user.portfolio_url))}">${escapeHtml(stripProtocol(user.portfolio_url))}</a>`,
    );
  }

  const sep = separator === 'dot' ? '<span class="contact-separator">·</span>' : '<span class="contact-separator">|</span>';
  return items.length ? `<div class="contact-row">${items.join(sep)}</div>` : '';
};

const renderSkills = (
  skills: NormalizedResumeContent['skills'],
  variant: 'rows' | 'inline' = 'rows',
): string => {
  if (skills.length === 0) return '';
  if (variant === 'inline') {
    const items = skills.flatMap((group) => group.items).slice(0, 12);
    return `<p class="strengths">${items.map(escapeHtml).join(' · ')}</p>`;
  }

  return `<div class="skill-list">${skills
    .map(
      (group) =>
        `<p><strong>${escapeHtml(group.category)}:</strong> ${group.items.map(escapeHtml).join(', ')}</p>`,
    )
    .join('')}</div>`;
};

const renderBullets = (bullets: string[]): string =>
  bullets.length ? `<ul>${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>` : '';

const renderEntry = (entry: ResumeEntry, _options: { project?: boolean } = {}): string => {
  const subtitle = entry.subtitle
    ? `<div class="entry-subtitle">${escapeHtml(entry.subtitle)}${entry.url ? ` | ${escapeHtml(stripProtocol(entry.url))}` : ''}</div>`
    : entry.url
      ? `<div class="entry-subtitle">${escapeHtml(stripProtocol(entry.url))}</div>`
      : '';

  return `<article class="entry">
    <div class="entry-heading">
      <div>
        <h3>${escapeHtml(entry.title)}</h3>
        ${subtitle}
      </div>
      ${entry.meta ? `<div class="entry-meta">${escapeHtml(entry.meta)}</div>` : ''}
    </div>
    ${entry.detail ? `<p class="entry-detail">${escapeHtml(entry.detail)}</p>` : ''}
    ${renderBullets(entry.bullets)}
  </article>`;
};

const renderSection = (title: string, html: string): string =>
  html.trim() ? `<section class="section"><h2>${escapeHtml(title)}</h2>${html}</section>` : '';

const baseStyles = `
${ACADEMIC_SERIF_FONT_FACE_CSS}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { width: 210mm; min-height: 297mm; margin: 0; background: #fff; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #111; }
.resume-page { width: 210mm; min-height: 297mm; background: #fff; overflow-wrap: break-word; hyphens: auto; }
a { color: inherit; text-decoration: none; }
.contact-row { display: flex; flex-wrap: wrap; gap: 2pt 5pt; align-items: center; }
.contact-separator { color: #555; }
.section { break-inside: auto; page-break-inside: auto; }
.section h2 { break-after: avoid; page-break-after: avoid; }
.entry { break-inside: auto; page-break-inside: auto; }
.entry-heading { break-inside: avoid; page-break-inside: avoid; break-after: avoid; page-break-after: avoid; }
ul { margin: 4pt 0 0; padding-left: 15pt; }
li { break-inside: avoid; page-break-inside: avoid; }
`;

const primaryStyles = `
.template-primary { padding: 10.5mm; font-family: ${ACADEMIC_SERIF_FONT_STACK}; font-size: 12pt; line-height: 1.2; }
.template-primary header { text-align: center; margin-bottom: 16pt; break-inside: avoid; }
.template-primary h1 { font-size: 25pt; font-weight: 400; line-height: 1.08; margin: 0 0 5pt; }
.template-primary .header-sub { font-size: 11pt; font-style: italic; color: #333; margin-bottom: 5pt; }
.template-primary .contact-row { justify-content: center; color: #003399; font-size: 11.5pt; line-height: 1.2; }
.template-primary .section { margin-top: 15pt; }
.template-primary h2 { font-size: 17pt; font-weight: 500; font-variant: small-caps; text-transform: uppercase; border-bottom: 1px solid #222; padding-bottom: 2pt; margin: 0 0 8pt; line-height: 1.05; }
.template-primary p, .template-primary li { font-size: 11.2pt; line-height: 1.22; }
.template-primary .summary { text-align: justify; }
.template-primary .entry { margin-bottom: 9pt; }
.template-primary .entry-heading { display: flex; justify-content: space-between; gap: 14pt; }
.template-primary h3 { font-size: 11.5pt; margin: 0; }
.template-primary .entry-subtitle { margin-top: 1pt; }
.template-primary .entry-meta { font-style: italic; text-align: right; white-space: nowrap; }
.template-primary .entry-detail { margin: 3pt 0 0; }
.template-primary .skill-list p { margin: 2pt 0; }
`;

const classicStyles = `
.template-classic-professional { padding: 18mm 16mm; font-family: Georgia, "Times New Roman", serif; font-size: 10.2pt; line-height: 1.38; }
.template-classic-professional header { text-align: center; margin-bottom: 13pt; break-inside: avoid; }
.template-classic-professional h1 { font-size: 23pt; letter-spacing: .03em; margin: 0 0 5pt; text-transform: uppercase; }
.template-classic-professional .contact-row { justify-content: center; font-size: 9.6pt; color: #222; }
.template-classic-professional .section { margin-top: 10pt; }
.template-classic-professional h2 { font-size: 11pt; letter-spacing: .08em; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 2pt; margin: 0 0 6pt; }
.template-classic-professional p, .template-classic-professional li { font-size: 10pt; line-height: 1.36; }
.template-classic-professional .entry { margin-bottom: 7pt; }
.template-classic-professional .entry-heading { display: flex; justify-content: space-between; gap: 12pt; }
.template-classic-professional h3 { font-size: 10.3pt; margin: 0; }
.template-classic-professional .entry-meta { text-align: right; white-space: nowrap; }
.template-classic-professional .entry-subtitle { font-style: italic; }
.template-classic-professional .entry-detail { margin: 2pt 0 0; }
.template-classic-professional .skill-list p { margin: 1.5pt 0; }
`;

const technicalStyles = `
.template-technical-modern { padding: 16mm 15mm; font-family: Inter, Arial, Helvetica, system-ui, sans-serif; font-size: 10pt; line-height: 1.38; color: #172033; }
.template-technical-modern header { margin-bottom: 14pt; border-bottom: 2px solid #23395b; padding-bottom: 8pt; break-inside: avoid; }
.template-technical-modern h1 { font-size: 25pt; line-height: 1.05; margin: 0 0 3pt; letter-spacing: 0; }
.template-technical-modern .header-sub { color: #46566f; font-size: 10.8pt; font-weight: 600; margin-bottom: 5pt; }
.template-technical-modern .contact-row { font-size: 9.4pt; color: #46566f; }
.template-technical-modern .section { margin-top: 11pt; }
.template-technical-modern h2 { color: #23395b; font-size: 10.5pt; letter-spacing: .09em; text-transform: uppercase; border-bottom: 1px solid #c9d1df; padding-bottom: 3pt; margin: 0 0 7pt; }
.template-technical-modern p, .template-technical-modern li { font-size: 9.8pt; line-height: 1.38; }
.template-technical-modern .entry { margin-bottom: 8pt; }
.template-technical-modern .entry-heading { display: flex; justify-content: space-between; gap: 12pt; }
.template-technical-modern h3 { font-size: 10.4pt; margin: 0; color: #172033; }
.template-technical-modern .entry-subtitle { color: #40516a; font-weight: 600; }
.template-technical-modern .entry-meta { color: #53627a; text-align: right; white-space: nowrap; }
.template-technical-modern .entry-detail { margin: 2pt 0 0; color: #29354a; }
.template-technical-modern .skill-list p { margin: 2pt 0; }
`;

const executiveStyles = `
.template-executive-minimal { padding: 20mm 17mm; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; font-size: 10.2pt; line-height: 1.45; color: #171717; }
.template-executive-minimal header { margin-bottom: 16pt; border-bottom: 1px solid #d8d8d8; padding-bottom: 10pt; break-inside: avoid; }
.template-executive-minimal h1 { font-family: Georgia, "Times New Roman", serif; font-size: 27pt; font-weight: 400; margin: 0 0 4pt; line-height: 1.06; }
.template-executive-minimal .header-sub { font-size: 10.8pt; color: #444; margin-bottom: 5pt; }
.template-executive-minimal .contact-row { font-size: 9.3pt; color: #444; }
.template-executive-minimal .section { margin-top: 13pt; }
.template-executive-minimal h2 { font-size: 10.5pt; font-weight: 600; letter-spacing: .11em; text-transform: uppercase; color: #333; border-bottom: 1px solid #e4e4e4; padding-bottom: 4pt; margin: 0 0 8pt; }
.template-executive-minimal p, .template-executive-minimal li { font-size: 10pt; line-height: 1.45; }
.template-executive-minimal .summary { max-width: 168mm; }
.template-executive-minimal .strengths { color: #222; letter-spacing: .01em; }
.template-executive-minimal .entry { margin-bottom: 10pt; }
.template-executive-minimal .entry-heading { display: flex; justify-content: space-between; gap: 14pt; }
.template-executive-minimal h3 { font-size: 10.6pt; margin: 0; }
.template-executive-minimal .entry-subtitle { color: #4d4d4d; }
.template-executive-minimal .entry-meta { color: #666; text-align: right; white-space: nowrap; }
.template-executive-minimal .entry-detail { margin: 3pt 0 0; color: #333; }
`;

const templateStyles: Record<ResumeTemplateId, string> = {
  primary: primaryStyles,
  'classic-professional': classicStyles,
  'technical-modern': technicalStyles,
  'executive-minimal': executiveStyles,
};

const buildSections = (
  templateId: ResumeTemplateId,
  content: NormalizedResumeContent,
): string => {
  const summary = content.summary
    ? `<p class="summary">${escapeHtml(content.summary)}</p>`
    : '';
  const skills = renderSkills(content.skills);
  const strengths = renderSkills(content.skills, 'inline');
  const experience = content.experience.map((entry) => renderEntry(entry)).join('');
  const projects = content.projects.map((entry) => renderEntry(entry, { project: true })).join('');
  const researchPapers = content.researchPapers.map((entry) => renderEntry(entry)).join('');
  const education = content.education.map((entry) => renderEntry(entry)).join('');
  const certifications = content.certifications.map((entry) => renderEntry(entry)).join('');
  const achievements = renderBullets(content.achievements);

  if (templateId === 'technical-modern') {
    return [
      renderSection('Technical Summary', summary),
      renderSection('Core Skills', skills),
      renderSection('Selected Projects', projects),
      renderSection('Research Papers', researchPapers),
      renderSection('Experience', experience),
      renderSection('Education', education),
      renderSection('Certifications', certifications),
      renderSection('Achievements', achievements),
    ].join('');
  }

  if (templateId === 'executive-minimal') {
    return [
      renderSection('Professional Profile', summary),
      renderSection('Key Strengths', strengths),
      renderSection('Experience', experience),
      renderSection('Selected Projects', projects),
      renderSection('Research Papers', researchPapers),
      renderSection('Education', education),
      renderSection('Certifications', certifications),
      renderSection('Additional Skills', skills),
      renderSection('Achievements', achievements),
    ].join('');
  }

  if (templateId === 'classic-professional') {
    return [
      renderSection('Summary', summary),
      renderSection('Skills', skills),
      renderSection('Experience', experience),
      renderSection('Projects', projects),
      renderSection('Research Papers', researchPapers),
      renderSection('Education', education),
      renderSection('Certifications', certifications),
      renderSection('Achievements', achievements),
    ].join('');
  }

  return [
    renderSection('Summary', summary),
    renderSection('Experience', experience),
    renderSection('Projects', projects),
    renderSection('Research Papers', researchPapers),
    renderSection('Skills', skills),
    renderSection('Education', education),
    renderSection('Certifications', certifications),
    renderSection('Achievements', achievements),
  ].join('');
};

export const renderResumeHtml = (context: ResumeRenderContext): string => {
  const templateId = normalizeResumeTemplateId(context.templateId);
  const content = normalizeContent(context.content);
  const fullName = cleanText(context.user?.full_name) || 'Resume';
  const subtitle =
    templateId === 'primary'
      ? context.jobTitle
        ? `Tailored for ${cleanText(context.jobTitle)}${context.companyName ? ` at ${cleanText(context.companyName)}` : ''}`
        : ''
      : cleanText(context.jobTitle);
  const contactSeparator = templateId === 'technical-modern' || templateId === 'executive-minimal' ? 'dot' : 'pipe';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(fullName)} Resume</title>
  <style>
    ${baseStyles}
    ${templateStyles[templateId]}
  </style>
</head>
<body>
  <main class="resume-page template-${templateId}">
    <header>
      <h1>${escapeHtml(fullName)}</h1>
      ${subtitle ? `<div class="header-sub">${escapeHtml(subtitle)}</div>` : ''}
      ${renderContact(context.user, contactSeparator)}
    </header>
    ${buildSections(templateId, content)}
  </main>
</body>
</html>`;
};
