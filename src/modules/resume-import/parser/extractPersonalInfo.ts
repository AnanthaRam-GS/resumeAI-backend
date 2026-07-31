import type { ParsedPersonal, ParsedPersonalInfo } from '../resume-import.schema.js';
import type { ParserContext } from './types.js';
import { field, normalizeUrl, warning } from './utils.js';

const TECH_OR_SUMMARY_WORDS =
	/\b(development|engineering|deep learning|framework|specializing|seeking|developed|built|designed|experienced|passionate|machine learning|software|frontend|backend|full[- ]stack)\b/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{4}\b/;

export const isValidLocationCandidate = (line: string): boolean => {
	const trimmed = line.trim();
	if (!trimmed || trimmed.length > 60) return false;
	if (EMAIL_RE.test(trimmed) || /https?:|www\./i.test(trimmed)) return false;
	if (TECH_OR_SUMMARY_WORDS.test(trimmed)) return false;
	if (/\b(is|am|are|was|were|be|being|been|specializing|seeking|developed|built)\b/i.test(trimmed)) {
		return false;
	}
	if (trimmed.split(',').length > 3) return false;
	return (
		/[A-Za-z][A-Za-z .'-]+,\s*[A-Za-z][A-Za-z .'-]+/.test(trimmed) ||
		/\b(remote|india|usa|united states|canada|uk|coimbatore|bangalore|bengaluru|chennai|hyderabad|mumbai|delhi|san francisco|new york)\b/i.test(
			trimmed,
		)
	);
};

const firstNameCandidate = (lines: string[]): string | undefined =>
	lines.find((line) => {
		if (line.length > 70 || /@|https?:|www\.|\d{4}/i.test(line)) return false;
		if (/^(summary|profile|objective|education|experience|projects|skills)$/i.test(line)) return false;
		const words = line.split(/\s+/);
		return (
			words.length >= 2 &&
			words.length <= 5 &&
			words.every((word) => /^[A-Za-z][A-Za-z'.-]*$/.test(word))
		);
	});

export const extractPersonalInfo = (
	context: ParserContext,
): { personal: ParsedPersonal; personalInfo: ParsedPersonalInfo } => {
	const header = context.sections.find((section) => section.key === 'header');
	const summarySection = context.sections.find((section) => section.key === 'summary');
	const topLines = (header?.lines.length ? header.lines : context.lines.slice(0, 12)).slice(0, 14);
	const topText = topLines.join(' ');
	const fullName = firstNameCandidate(topLines);
	const email = context.text.match(EMAIL_RE)?.[0];
	const phone = topText.match(PHONE_RE)?.[0]?.trim();
	const location = topLines.find((line) => line !== fullName && isValidLocationCandidate(line));
	const linkedInUrl = context.links.find((link) => link.kind === 'linkedin')?.normalizedUrl;
	const githubUrl = context.links.find((link) => link.kind === 'github_profile')?.normalizedUrl;
	const portfolioUrl = context.links.find((link) => link.kind === 'portfolio')?.normalizedUrl;
	const summary = summarySection?.text ? summarySection.text.replace(/\n+/g, ' ').trim().slice(0, 900) : undefined;

	if (!location) {
		const rejected = topLines.find((line) => line !== fullName && TECH_OR_SUMMARY_WORDS.test(line));
		if (rejected) {
			context.warnings.push(
				warning(
					'LOCATION_REJECTED',
					'Rejected a location candidate because it looked like summary text.',
					'info',
					'location',
					'header',
				),
			);
		}
	}

	const safePortfolio = portfolioUrl && !/gmail\.com/i.test(portfolioUrl) ? normalizeUrl(portfolioUrl) : undefined;
	if (portfolioUrl && !safePortfolio) {
		context.warnings.push(
			warning('INVALID_PORTFOLIO_URL', 'Rejected an invalid portfolio URL candidate.', 'warning', 'portfolioUrl'),
		);
	}

	const personal: ParsedPersonal = {
		...(fullName ? { full_name: fullName } : {}),
		...(email ? { email } : {}),
		...(phone ? { phone } : {}),
		...(location ? { location } : {}),
		...(linkedInUrl ? { linkedin_url: linkedInUrl } : {}),
		...(githubUrl ? { github_url: githubUrl } : {}),
		...(safePortfolio ? { portfolio_url: safePortfolio } : {}),
		...(summary && summary.length >= 30 ? { summary } : {}),
	};

	const personalInfo: ParsedPersonalInfo = {
		fullName: field(fullName, 0.86, 'header', fullName),
		email: field(email, 0.98, 'header', email),
		phone: field(phone, 0.86, 'header', phone),
		location: field(location, location ? 0.72 : 0, 'header', location),
		linkedinUrl: field(linkedInUrl, 0.94, 'header', linkedInUrl),
		githubUrl: field(githubUrl, 0.9, 'header', githubUrl),
		portfolioUrl: field(safePortfolio, 0.72, 'header', safePortfolio),
		professionalSummary: field(summary && summary.length >= 30 ? summary : undefined, 0.78, 'summary', summary),
	};

	return { personal, personalInfo };
};
