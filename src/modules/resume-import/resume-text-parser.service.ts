import {
  parsedResumeDataSchema,
  type ParsedResumeData,
  type ParsedEducationItem,
  type ParsedExperienceItem,
  type ParsedProjectItem,
  type ParsedSkillItem,
} from './resume-import.schema.js';

const SECTION_HEADINGS: Record<string, keyof ParsedResumeData> = {
  summary: 'personal',
  profile: 'personal',
  objective: 'personal',
  experience: 'experience',
  'work experience': 'experience',
  employment: 'experience',
  education: 'education',
  skills: 'skills',
  'technical skills': 'skills',
  projects: 'projects',
  'personal projects': 'projects',
  certifications: 'certifications',
  certificates: 'certifications',
};

const NEXT_SECTION_RE =
  /^(summary|profile|objective|experience|work experience|employment|education|skills|technical skills|projects|personal projects|certifications|certificates|awards|publications|languages|interests)$/i;

const MONTHS: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

const COMMON_SKILLS = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Java',
  'C++',
  'C#',
  'Go',
  'Golang',
  'Rust',
  'SQL',
  'HTML',
  'CSS',
  'React',
  'Next.js',
  'Node.js',
  'Express',
  'Fastify',
  'Django',
  'Flask',
  'Spring Boot',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'AWS',
  'Azure',
  'GCP',
  'Docker',
  'Kubernetes',
  'Git',
  'GitHub',
  'CI/CD',
  'REST',
  'GraphQL',
  'Machine Learning',
  'Deep Learning',
  'NLP',
  'TensorFlow',
  'PyTorch',
  'Pandas',
  'NumPy',
  'Scikit-learn',
  'Tableau',
  'Power BI',
  'Excel',
  'Figma',
  'Agile',
  'Scrum',
];

const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim();

const cleanLine = (line: string): string =>
  normalizeWhitespace(
    line.replace(/^[\s*#|>\-+.,:;()[\]{}]+/, '').replace(/\s*[|]{2,}\s*/g, ' | '),
  );

const uniqueByKey = <T>(items: T[], keyFor: (item: T) => string | undefined): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFor(item)?.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const isPresent = <T>(item: T | null | undefined): item is T => item !== null && item !== undefined;

const linesFromText = (text: string): string[] =>
  text.replace(/\r/g, '\n').split('\n').map(cleanLine).filter(Boolean);

const inferSections = (lines: string[]) => {
  const sections = new Map<keyof ParsedResumeData, string[]>();
  let current: keyof ParsedResumeData | null = null;

  for (const line of lines) {
    const normalizedHeading = line
      .replace(/[:-]+$/, '')
      .trim()
      .toLowerCase();
    const mapped = SECTION_HEADINGS[normalizedHeading];
    if (mapped) {
      current = mapped;
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }

    if (current) {
      sections.get(current)?.push(line);
    }
  }

  return sections;
};

const firstMatch = (text: string, regex: RegExp): string | undefined => text.match(regex)?.[0];

const normalizeUrl = (url: string): string => {
  const trimmed = url.trim().replace(/[),.;]+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const parseContact = (lines: string[], text: string): NonNullable<ParsedResumeData['personal']> => {
  const topLines = lines.slice(0, 12);
  const topText = topLines.join(' ');
  const email = firstMatch(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phone = firstMatch(
    topText,
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{4}\b/,
  );
  const urls = Array.from(
    text.matchAll(/(?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s),;]*)?/gi),
    (match) => normalizeUrl(match[0]),
  );

  const linkedInUrl = urls.find((url) => /linkedin\.com/i.test(url));
  const githubUrl = urls.find((url) => /github\.com/i.test(url));
  const portfolioUrl = urls.find((url) => !/linkedin\.com|github\.com/i.test(url));
  const fullName = topLines.find((line) => {
    if (line.length > 70 || /@|https?:|www\.|\d{4}/i.test(line)) return false;
    if (NEXT_SECTION_RE.test(line)) return false;
    const words = line.split(/\s+/);
    return (
      words.length >= 2 &&
      words.length <= 5 &&
      words.every((word) => /^[A-Za-z][A-Za-z'.-]*$/.test(word))
    );
  });
  const location = topLines.find((line) => {
    if (line === fullName || line.includes('@') || /https?:|www\./i.test(line)) return false;
    return (
      /[A-Za-z]+,\s*[A-Za-z]{2,}/.test(line) ||
      /\b(remote|india|usa|united states|canada|uk)\b/i.test(line)
    );
  });

  return {
    ...(fullName ? { full_name: fullName } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone: phone.trim() } : {}),
    ...(location ? { location } : {}),
    ...(linkedInUrl ? { linkedin_url: linkedInUrl } : {}),
    ...(githubUrl ? { github_url: githubUrl } : {}),
    ...(portfolioUrl ? { portfolio_url: portfolioUrl } : {}),
  };
};

const parseMonthYear = (value: string): string | undefined => {
  const normalized = value.trim().toLowerCase().replace(/[,]/g, '');
  const monthYear = normalized.match(
    /\b(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+((?:19|20)\d{2})\b/i,
  );
  if (monthYear) return `${monthYear[2]}-${MONTHS[monthYear[1]!.toLowerCase()] ?? '01'}-01`;

  const numericMonthYear = normalized.match(/\b((?:19|20)\d{2})[-/](0?[1-9]|1[0-2])\b/);
  if (numericMonthYear) return `${numericMonthYear[1]}-${numericMonthYear[2]!.padStart(2, '0')}-01`;

  const year = normalized.match(/\b((?:19|20)\d{2})\b/);
  if (year) return `${year[1]}-01-01`;
  return undefined;
};

const parseDateRange = (
  line: string,
): { start_date?: string; end_date?: string; is_current?: boolean } => {
  const range = line.match(
    /((?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(?:19|20)\d{2})\s*(?:-|to|–|—)\s*((?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(?:19|20)\d{2}|present|current|now|ongoing)/i,
  );
  if (!range) return {};
  const isCurrent = /present|current|now|ongoing/i.test(range[2] ?? '');
  return {
    start_date: parseMonthYear(range[1] ?? ''),
    ...(isCurrent ? { is_current: true } : { end_date: parseMonthYear(range[2] ?? '') }),
  };
};

const splitChunks = (sectionLines: string[]): string[][] => {
  const chunks: string[][] = [];
  let current: string[] = [];

  for (const line of sectionLines) {
    const currentHasDate = current.some((item) =>
      /\b(?:19|20)\d{2}\b.*(?:-|to|–|—).*(?:\b(?:19|20)\d{2}\b|present|current|now|ongoing)/i.test(
        item,
      ),
    );
    const startsNew =
      current.length > 1 &&
      currentHasDate &&
      !/\b(?:19|20)\d{2}\b.*(?:-|to|–|—)/i.test(line) &&
      !line.includes(':') &&
      /^[A-Z][A-Za-z0-9 .&'/-]{2,80}\s*(?:\||-|,| at )?/i.test(line);
    if (startsNew) {
      chunks.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) chunks.push(current);
  return chunks;
};

const extractKnownSkills = (text: string, category = 'Other'): ParsedSkillItem[] => {
  const skills = COMMON_SKILLS.filter((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '\\.?');
    return new RegExp(`(^|[^A-Za-z0-9+#])${escaped}([^A-Za-z0-9+#]|$)`, 'i').test(text);
  }).map((skill) => ({ title: skill, skill_name: skill, domain_category: category }));
  return uniqueByKey(skills, (skill) => skill.skill_name ?? skill.title);
};

const parseSkills = (sectionLines: string[], fullText: string): ParsedSkillItem[] => {
  const explicit = sectionLines.flatMap((line) => {
    const [categoryPart, skillPart] = line.includes(':')
      ? line.split(/:(.+)/).filter(Boolean)
      : ['Other', line];
    const category = normalizeWhitespace(categoryPart ?? 'Other') || 'Other';
    return (skillPart ?? line)
      .split(/[,;|]/)
      .map(cleanLine)
      .filter((item) => item.length >= 2 && item.length <= 40)
      .map((skill) => ({ title: skill, skill_name: skill, domain_category: category }));
  });

  return uniqueByKey(
    [...explicit, ...extractKnownSkills(fullText)],
    (skill) => skill.skill_name ?? skill.title,
  );
};

const parseEducation = (sectionLines: string[]): ParsedEducationItem[] =>
  uniqueByKey(
    splitChunks(sectionLines)
      .map((chunk): ParsedEducationItem | null => {
        const joined = chunk.join(' ');
        const dateLine = chunk.find((line) => /\b(?:19|20)\d{2}\b/.test(line)) ?? '';
        const dates = parseDateRange(dateLine);
        const gpa = joined.match(/\bGPA[:\s]*([0-9.]+(?:\s*\/\s*[0-9.]+)?)/i)?.[1]?.trim();
        const degreeLine = chunk.find((line) =>
          /\b(bachelor|master|ph\.?d|doctor|associate|b\.?s\.?|m\.?s\.?|b\.?tech|m\.?tech|mba|degree|diploma)\b/i.test(
            line,
          ),
        );
        const institutionLine =
          chunk.find((line) => /\b(university|college|institute|school|academy)\b/i.test(line)) ??
          chunk.find((line) => !line.includes('@') && !/\b(?:19|20)\d{2}\b/.test(line));
        const field = degreeLine?.match(/\bin\s+([^,|;-]+)/i)?.[1]?.trim();
        const title = degreeLine ?? institutionLine;
        if (!title) return null;

        return {
          title,
          ...(degreeLine ? { degree: degreeLine } : {}),
          ...(field ? { field_of_study: field } : {}),
          ...(institutionLine && institutionLine !== degreeLine
            ? { institution_name: institutionLine }
            : {}),
          ...(gpa ? { gpa } : {}),
          ...dates,
          ...(chunk.slice(1).join(' ') ? { description: chunk.slice(1).join(' ') } : {}),
        };
      })
      .filter(isPresent),
    (item) => `${item.title}:${item.institution_name ?? ''}`,
  );

const parseExperienceHeader = (chunk: string[]) => {
  const header =
    chunk.find((line) => !/\b(?:19|20)\d{2}\b/.test(line) && !line.startsWith('-')) ??
    chunk[0] ??
    '';
  const atMatch = header.match(/^(.+?)\s+at\s+(.+)$/i);
  if (atMatch) return { title: cleanLine(atMatch[1]!), company_name: cleanLine(atMatch[2]!) };

  const parts = header
    .split(/\s*(?:\|| - |,)\s*/)
    .map(cleanLine)
    .filter(Boolean);
  if (parts.length >= 2) {
    const titleIndex = parts.findIndex((part) =>
      /\b(engineer|developer|manager|analyst|designer|consultant|intern|lead|director|specialist|associate)\b/i.test(
        part,
      ),
    );
    if (titleIndex >= 0) {
      return {
        title: parts[titleIndex],
        company_name: parts.find((_, index) => index !== titleIndex),
      };
    }
    return { title: parts[0], company_name: parts[1] };
  }
  return { title: header };
};

const parseExperience = (sectionLines: string[], fullText: string): ParsedExperienceItem[] =>
  uniqueByKey(
    splitChunks(sectionLines)
      .map((chunk): ParsedExperienceItem | null => {
        const header = parseExperienceHeader(chunk);
        if (!header.title || NEXT_SECTION_RE.test(header.title)) return null;
        const dateLine = chunk.find((line) => /\b(?:19|20)\d{2}\b.*(?:-|to|–|—)/i.test(line)) ?? '';
        const details = chunk.filter(
          (line) => line !== header.title && line !== header.company_name && line !== dateLine,
        );
        const joined = chunk.join(' ');
        return {
          title: header.title,
          ...(header.company_name ? { company_name: header.company_name } : {}),
          ...parseDateRange(dateLine),
          ...(details.length ? { description: details.join(' ') } : {}),
          ...(details.length ? { achievements: details.join(' ') } : {}),
          tech_stack: extractKnownSkills(joined || fullText).map(
            (skill) => skill.skill_name ?? skill.title,
          ),
        };
      })
      .filter((item): item is ParsedExperienceItem => item !== null),
    (item) => `${item.title}:${item.company_name ?? ''}:${item.start_date ?? ''}`,
  );

const parseProjects = (sectionLines: string[]): ParsedProjectItem[] =>
  uniqueByKey(
    splitChunks(sectionLines)
      .map((chunk): ParsedProjectItem | null => {
        const title = chunk.find(
          (line) => !/\b(?:19|20)\d{2}\b/.test(line) && !/https?:|www\./i.test(line),
        );
        if (!title || NEXT_SECTION_RE.test(title)) return null;
        const joined = chunk.join(' ');
        const url = joined.match(
          /(?:https?:\/\/)?(?:www\.)?(?:github\.com|gitlab\.com|[a-z0-9.-]+\.[a-z]{2,})\/[^\s),;]*/i,
        )?.[0];
        const parsedDates = parseDateRange(joined);
        const dates = {
          ...(parsedDates.start_date ? { start_date: parsedDates.start_date } : {}),
          ...(parsedDates.end_date ? { end_date: parsedDates.end_date } : {}),
        };
        return {
          title,
          ...(chunk.slice(1).join(' ') ? { description: chunk.slice(1).join(' ') } : {}),
          ...(url ? { project_url: normalizeUrl(url) } : {}),
          tech_stack: extractKnownSkills(joined).map((skill) => skill.skill_name ?? skill.title),
          ...dates,
        };
      })
      .filter(isPresent),
    (item) => item.title,
  );

const parseSummary = (sectionLines: string[]): string | undefined => {
  const summary = normalizeWhitespace(sectionLines.slice(0, 6).join(' '));
  return summary.length >= 30 ? summary.slice(0, 800) : undefined;
};

export const parseResumeTextDeterministically = (text: string): ParsedResumeData => {
  const lines = linesFromText(text);
  const sections = inferSections(lines);
  const personal = parseContact(lines, text);
  const summary = parseSummary(sections.get('personal') ?? []);
  const skills = parseSkills(sections.get('skills') ?? [], text);
  const parsed = {
    personal: Object.keys({ ...personal, ...(summary ? { summary } : {}) }).length
      ? { ...personal, ...(summary ? { summary } : {}) }
      : undefined,
    experience: parseExperience(sections.get('experience') ?? [], text),
    education: parseEducation(sections.get('education') ?? []),
    skills,
    projects: parseProjects(sections.get('projects') ?? []),
    certifications: parseProjects(sections.get('certifications') ?? []).map((item) => ({
      title: item.title,
      issuing_org: item.description,
      cert_url: item.project_url,
      start_date: item.start_date,
      end_date: item.end_date,
    })),
  };

  const withoutEmptyArrays = Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => !Array.isArray(value) || value.length > 0),
  );
  const validated = parsedResumeDataSchema.safeParse(withoutEmptyArrays);
  return validated.success
    ? validated.data
    : {
        experience: undefined,
        education: undefined,
        skills: undefined,
        projects: undefined,
        researchPapers: undefined,
        certifications: undefined,
        extractedLinks: [],
        warnings: [],
        confidence: {
          overall: 0.5,
          personalInfo: 0.5,
          education: 0.5,
          experience: 0.5,
          projects: 0.5,
          researchPapers: 0.5,
          skills: 0.5,
          certifications: 0.5,
        },
      };
};

export const mergeParsedResumeData = (
  primary: ParsedResumeData,
  fallback: ParsedResumeData,
): ParsedResumeData => ({
  sourceFile: primary.sourceFile ?? fallback.sourceFile,
  personal:
    primary.personal || fallback.personal
      ? { ...fallback.personal, ...primary.personal }
      : undefined,
  personalInfo: primary.personalInfo ?? fallback.personalInfo,
  experience: primary.experience?.length ? primary.experience : fallback.experience,
  education: primary.education?.length ? primary.education : fallback.education,
  skills: primary.skills?.length
    ? uniqueByKey(
        [...(primary.skills ?? []), ...(fallback.skills ?? [])],
        (skill) => skill.skill_name ?? skill.title,
      )
    : fallback.skills,
  projects: primary.projects?.length ? primary.projects : fallback.projects,
  researchPapers: primary.researchPapers?.length ? primary.researchPapers : fallback.researchPapers,
  certifications: primary.certifications?.length ? primary.certifications : fallback.certifications,
  achievements: primary.achievements?.length ? primary.achievements : fallback.achievements,
  publications: primary.publications?.length ? primary.publications : fallback.publications,
  extractedLinks: primary.extractedLinks?.length ? primary.extractedLinks : fallback.extractedLinks,
  warnings: [...(fallback.warnings ?? []), ...(primary.warnings ?? [])],
  confidence: primary.confidence ?? fallback.confidence,
});
