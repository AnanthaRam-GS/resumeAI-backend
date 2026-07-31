import type { ExtractedLink, ParsedProjectItem } from '../resume-import.schema.js';
import type { ParserContext } from './types.js';
import { parseDateRange } from './dateUtils.js';
import { normalizeSkillName } from './extractSkills.js';
import {
	itemMeta,
	normalizeTextKey,
	normalizeUrl,
	normalizeWhitespace,
	uniqueByKey,
	validUrlOrUndefined,
} from './utils.js';

const LINK_LABEL_RE =
	/\b(?:link to project|project link|view project|source code|repository|live demo)\b/gi;

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;

const ACTION_VERB_RE =
	/^(?:developed|applied|engineered|implemented|integrated|formulated|designed|built|created|optimized|improved|enabled|achieved|secured|mapped|used|utilized|leveraged|trained|deployed|analyzed)\b/i;

const DESCRIPTION_MARKER_RE =
	/\b(?:using|to\s+(?:build|improve|create|map|detect|classify|predict|optimize|enable|support|specific)|that|which|by|for)\b/i;

const RESEARCH_CITATION_RE =
	/\b(?:doi|arxiv|ieee|acm|springer|elsevier|journal|conference|proceedings|accepted|published|submitted|under review)\b/i;

const SKILL_ONLY_TITLE_RE =
	/^(?:javascript|typescript|python|java|c\+\+|sql|react(?:\.js)?|node(?:\.js)?|postgresql|mongodb|docker|aws|machine learning|deep learning|lstm|gru|git|github)$/i;

const PROJECT_TECH_HINTS = [
	'React',
	'Node.js',
	'TypeScript',
	'JavaScript',
	'Python',
	'Fastify',
	'Express',
	'PostgreSQL',
	'MongoDB',
	'Redis',
	'Docker',
	'AWS',
	'PyTorch',
	'TensorFlow',
	'LSTM',
	'GRU',
	'Genetic Algorithms',
	'Knowledge Distillation',
	'Machine Learning',
	'Deep Learning',
	'Finite-State Machine',
	'FSM',
	'Particle Swarm Optimization',
	'PSO',
	'AI',
	'ATS',
];

type ProjectChunk = {
	title: string;
	lines: string[];
	links: ExtractedLink[];
	sourceLines: string[];
};

export const cleanProjectTitle = (title: string): string =>
	normalizeWhitespace(
		title
			.replace(MARKDOWN_LINK_RE, '')
			.replace(LINK_LABEL_RE, '')
			.replace(/(?:https?:\/\/|www\.)[^\s),;]+/gi, '')
			.replace(/\s*[-|:,]\s*$/g, ''),
	);

const repairWrappedText = (text: string): string =>
	text
		.replace(/([A-Za-z])-\s+([a-z])/g, '$1$2')
		.replace(/\s+/g, ' ')
		.trim();

const normalizeProjectLine = (line: string): string =>
	repairWrappedText(line.replace(/^[-•\s]+/, '').replace(/\s+/g, ' '));

const hasProjectLinkMarker = (line: string): boolean => {
	resetMarkdownRegex();
	return MARKDOWN_LINK_RE.test(line) || /\b(link to project|project link|view project|source code|repository|live demo)\b/i.test(line);
};

const resetMarkdownRegex = () => {
	MARKDOWN_LINK_RE.lastIndex = 0;
};

const lineLinks = (line: string, allLinks: ExtractedLink[]): ExtractedLink[] => {
	resetMarkdownRegex();
	const markdownUrls = Array.from(line.matchAll(MARKDOWN_LINK_RE))
		.map((match) => match[2])
		.filter((url): url is string => Boolean(url));
	const plainUrls = Array.from(line.matchAll(/(?:https?:\/\/|www\.)[^\s),;]+/gi)).map((match) => match[0]);
	const urls = [...markdownUrls, ...plainUrls].flatMap((url) => {
		const normalizedUrl = normalizeUrl(url);
		return normalizedUrl ? [normalizedUrl] : [];
	});
	return uniqueByKey(
		urls.flatMap((url) => {
			const matching = allLinks.find((link) => link.normalizedUrl === url);
			if (matching) return [matching];
			return [
				{
					url,
					normalizedUrl: url,
					displayText: url,
					kind: url.includes('github.com') ? ('github_repo' as const) : ('project' as const),
					nearbyText: line,
				},
			];
		}),
		(link) => link.normalizedUrl,
	);
};

const nearbyLinksForTitle = (title: string, allLinks: ExtractedLink[]): ExtractedLink[] => {
	const titleKey = normalizeTextKey(title);
	if (!titleKey) return [];
	return uniqueByKey(
		allLinks.filter((link) => {
			const nearby = normalizeTextKey(link.nearbyText ?? '');
			return (
				(link.kind === 'project' || link.kind === 'github_repo' || link.kind === 'demo') &&
				nearby.includes(titleKey)
			);
		}),
		(link) => link.normalizedUrl,
	);
};

const splitTitleAndRemainder = (line: string): { title: string; remainder?: string; links: ExtractedLink[] } => {
	const normalized = normalizeProjectLine(line);
	resetMarkdownRegex();
	const markdown = MARKDOWN_LINK_RE.exec(normalized);
	if (markdown) {
		const before = normalized.slice(0, markdown.index).trim();
		const after = normalized.slice(markdown.index + markdown[0].length).trim();
		const normalizedUrl = normalizeUrl(markdown[2] ?? '');
		return {
			title: cleanProjectTitle(before || normalized),
			remainder: after || undefined,
			links: normalizedUrl
				? [
						{
							displayText: markdown[1]?.trim(),
							url: markdown[2]!,
							normalizedUrl,
							kind: normalizedUrl.includes('github.com') ? 'github_repo' : 'project',
							nearbyText: normalized,
						},
					]
				: [],
		};
	}

	const labelMatch = normalized.match(LINK_LABEL_RE);
	if (labelMatch?.index !== undefined) {
		return {
			title: cleanProjectTitle(normalized.slice(0, labelMatch.index)),
			remainder: normalized.slice(labelMatch.index + labelMatch[0].length).trim() || undefined,
			links: [],
		};
	}

	return { title: cleanProjectTitle(normalized), links: [] };
};

export const isProjectTitleCandidate = (line: string, options: { hasProjectLink?: boolean } = {}): boolean => {
	const cleaned = options.hasProjectLink ? splitTitleAndRemainder(line).title : cleanProjectTitle(line);
	if (!cleaned || cleaned.length < 3 || cleaned.length > 110) return false;
	if (ACTION_VERB_RE.test(cleaned)) return false;
	if (RESEARCH_CITATION_RE.test(cleaned)) return false;
	if (/^[a-z]/.test(cleaned)) return false;
	if (/[.!?]$/.test(cleaned)) return false;
	if ((cleaned.match(/[,:;]/g) ?? []).length > 1) return false;
	if (cleaned.split(/\s+/).length > 12 && !options.hasProjectLink) return false;
	if (DESCRIPTION_MARKER_RE.test(cleaned) && !options.hasProjectLink) return false;
	if (SKILL_ONLY_TITLE_RE.test(cleaned)) return false;
	return /^[A-Z0-9]/.test(cleaned);
};

const startChunk = (chunks: ProjectChunk[], line: string, links: ExtractedLink[]) => {
	const split = splitTitleAndRemainder(line);
	const title = split.title;
	if (!title) return undefined;
	const chunk: ProjectChunk = {
		title,
		lines: split.remainder ? [split.remainder] : [],
		links: uniqueByKey(
			[...split.links, ...lineLinks(line, links), ...nearbyLinksForTitle(title, links)],
			(link) => link.normalizedUrl,
		),
		sourceLines: [line],
	};
	chunks.push(chunk);
	return chunk;
};

const buildChunks = (lines: string[], links: ExtractedLink[]): ProjectChunk[] => {
	const chunks: ProjectChunk[] = [];
	let current: ProjectChunk | undefined;

	for (const rawLine of lines) {
		const line = normalizeProjectLine(rawLine);
		if (!line) continue;
		const strongBoundary = hasProjectLinkMarker(line);
		const titleCandidate = isProjectTitleCandidate(line, { hasProjectLink: strongBoundary });
		if (titleCandidate && (strongBoundary || !current)) {
			current = startChunk(chunks, line, links) ?? current;
			continue;
		}
		if (titleCandidate && current && current.lines.length >= 1) {
			current = startChunk(chunks, line, links) ?? current;
			continue;
		}
		if (!current) {
			continue;
		}
		current.lines.push(line);
		current.sourceLines.push(line);
		current.links = uniqueByKey([...current.links, ...lineLinks(line, links)], (link) => link.normalizedUrl);
	}

	return chunks;
};

const primaryProjectUrl = (links: ExtractedLink[], text: string): string | undefined => {
	const repo = links.find((link) => link.kind === 'github_repo')?.normalizedUrl;
	const demo = links.find((link) => link.kind === 'demo')?.normalizedUrl;
	const project = links.find((link) => link.kind === 'project')?.normalizedUrl;
	const plain = text.match(/(?:https?:\/\/|www\.)[^\s),;]+/i)?.[0];
	return repo ?? demo ?? project ?? validUrlOrUndefined(plain);
};

const techStackFromText = (text: string): string[] =>
	uniqueByKey(
		PROJECT_TECH_HINTS.filter((skill) => {
			const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '\\.?');
			return new RegExp(`(^|[^A-Za-z0-9+#])${escaped}([^A-Za-z0-9+#]|$)`, 'i').test(text);
		})
			.map((skill) => normalizeSkillName(skill))
			.filter((skill): skill is string => Boolean(skill)),
		(skill) => skill,
	).slice(0, 12);

const chunkToProject = (chunk: ProjectChunk, heading: string): ParsedProjectItem | undefined => {
	const joined = normalizeWhitespace([chunk.title, ...chunk.lines].join(' '));
	const links = uniqueByKey(chunk.links, (link) => link.normalizedUrl);
	const projectUrl = primaryProjectUrl(links, joined);
	const githubUrl = links.find((link) => link.kind === 'github_repo')?.normalizedUrl;
	const liveUrl = links.find((link) => link.kind === 'demo')?.normalizedUrl;
	const bullets = uniqueByKey(
		chunk.lines
			.map((line) => cleanProjectTitle(line.replace(/(?:https?:\/\/|www\.)[^\s),;]+/gi, '')))
			.map(repairWrappedText)
			.filter((line) => line.length > 8),
		(line) => line,
	);
	const title = cleanProjectTitle(chunk.title);
	if (!title || ACTION_VERB_RE.test(title)) return undefined;
	return {
		title,
		...(bullets.length ? { description: bullets.join('\n'), bullets } : {}),
		...(projectUrl ? { project_url: normalizeUrl(projectUrl) ?? projectUrl } : {}),
		...(githubUrl ? { github_url: githubUrl } : {}),
		...(liveUrl ? { live_url: liveUrl } : {}),
		...(links.length ? { links } : {}),
		tech_stack: techStackFromText(joined),
		...parseDateRange(joined),
		_meta: itemMeta(0.84, heading, joined),
	};
};

export const hasProjectParsingIssues = (projects: ParsedProjectItem[]): boolean => {
	if (projects.some((project) => ACTION_VERB_RE.test(project.title))) return true;
	if (projects.some((project) => !isProjectTitleCandidate(project.title, { hasProjectLink: Boolean(project.project_url ?? project.github_url ?? project.live_url) }))) return true;
	if (projects.length > 6) return true;
	const linkOwners = new Map<string, number>();
	for (const project of projects) {
		for (const link of project.links ?? []) {
			linkOwners.set(link.normalizedUrl, (linkOwners.get(link.normalizedUrl) ?? 0) + 1);
		}
	}
	return Array.from(linkOwners.values()).some((count) => count > 1);
};

export const extractProjects = (context: ParserContext): ParsedProjectItem[] => {
	const projects = context.sections
		.filter((section) => section.key === 'projects')
		.flatMap((section) =>
			buildChunks(section.lines, context.links)
				.map((chunk) => chunkToProject(chunk, section.heading))
				.filter((project): project is ParsedProjectItem => Boolean(project)),
		);

	return uniqueByKey(
		projects,
		(item) => `${normalizeTextKey(item.title)}:${item.project_url ?? item.github_url ?? ''}`,
	);
};
