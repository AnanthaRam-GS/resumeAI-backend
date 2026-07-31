import taxonomy from '../../../data/skills-taxonomy.json' with { type: 'json' };
import type { ParsedSkillItem } from '../resume-import.schema.js';
import type { ParserContext } from './types.js';
import { itemMeta, normalizeTextKey, uniqueByKey } from './utils.js';

const SKILL_ALIASES: Record<string, string> = {
	ai: 'Artificial Intelligence',
	ml: 'Machine Learning',
	js: 'JavaScript',
	reactjs: 'React',
	'react js': 'React',
	'react.js': 'React',
	node: 'Node.js',
	nodejs: 'Node.js',
	'node js': 'Node.js',
	javascript: 'JavaScript',
	postgres: 'PostgreSQL',
	postgresql: 'PostgreSQL',
	'genetic algorithm': 'Genetic Algorithms',
	lstm: 'LSTM',
	gru: 'GRU',
	'c plus plus': 'C++',
};

const collectTaxonomyTerms = (value: unknown): string[] => {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return value.flatMap(collectTaxonomyTerms);
	if (!value || typeof value !== 'object') return [];
	const record = value as Record<string, unknown>;
	return [
		...(typeof record.name === 'string' ? [record.name] : []),
		...(Array.isArray(record.synonyms)
			? record.synonyms.filter((item): item is string => typeof item === 'string')
			: []),
		...Object.entries(record)
			.filter(([key]) => key !== 'name' && key !== 'synonyms')
			.flatMap(([, nested]) => collectTaxonomyTerms(nested)),
	];
};

const taxonomySkills = (): string[] => collectTaxonomyTerms(taxonomy);

const FALLBACK_SKILLS = [
	'JavaScript',
	'TypeScript',
	'Python',
	'Java',
	'C++',
	'C#',
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
	'Artificial Intelligence',
	'Deep Learning',
	'NLP',
	'TensorFlow',
	'PyTorch',
	'Pandas',
	'NumPy',
	'Scikit-learn',
	'LSTM',
	'GRU',
	'Genetic Algorithms',
	'Knowledge Distillation',
];

const SKILL_DICTIONARY = uniqueByKey([...taxonomySkills(), ...FALLBACK_SKILLS], (skill) => skill);

export const normalizeSkillName = (value: string): string | undefined => {
	const trimmed = value.trim().replace(/\s+/g, ' ');
	if (!trimmed || trimmed.length > 40 || trimmed.split(/\s+/).length > 5) return undefined;
	if (/[.!?]$/.test(trimmed) || /\b(and|or|with|using|built|developed|created)\b/i.test(trimmed)) {
		return undefined;
	}
	const key = normalizeTextKey(trimmed).replace(/\./g, '');
	const alias = SKILL_ALIASES[key] ?? SKILL_ALIASES[trimmed.toLowerCase()];
	if (alias) return alias;
	const dictionaryMatch = SKILL_DICTIONARY.find(
		(skill) => normalizeTextKey(skill).replace(/\./g, '') === key,
	);
	return dictionaryMatch ?? trimmed;
};

const extractKnownSkills = (text: string, category = 'Inferred'): ParsedSkillItem[] =>
	SKILL_DICTIONARY.filter((skill) => {
		const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '\\.?');
		return new RegExp(`(^|[^A-Za-z0-9+#])${escaped}([^A-Za-z0-9+#]|$)`, 'i').test(text);
	}).map((skill) => ({
		title: normalizeSkillName(skill) ?? skill,
		skill_name: normalizeSkillName(skill) ?? skill,
		domain_category: category,
		_meta: itemMeta(0.66, 'inferred', skill),
	}));

const rejoinHyphenatedLines = (lines: string[]): string[] => {
	const result: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		if (line.endsWith('-') && i + 1 < lines.length) {
			const next = lines[i + 1]!;
			// Merge when next continues the broken word (lowercase start or starts with closing paren/bracket)
			if (/^[a-z)]/.test(next)) {
				lines[i + 1] = line.slice(0, -1) + next;
				continue;
			}
		}
		result.push(line);
	}
	return result;
};

export const extractSkills = (context: ParserContext): ParsedSkillItem[] => {
	const skillSections = context.sections.filter((section) => section.key === 'skills');
	const explicit = skillSections.flatMap((section) =>
		rejoinHyphenatedLines(section.lines).flatMap((line) => {
			const [categoryPart, skillPart] = line.includes(':')
				? line.split(/:(.+)/).filter(Boolean)
				: ['Skills', line];
			const category = categoryPart?.trim() || 'Skills';
			return (skillPart ?? line)
				.split(/[,;|/]/)
				.map((item) => normalizeSkillName(item))
				.filter((skill): skill is string => Boolean(skill))
				.map((skill) => ({
					title: skill,
					skill_name: skill,
					domain_category: category,
					_meta: itemMeta(0.88, 'skills', line),
				}));
		}),
	);

	const inferred = explicit.length < 8 ? extractKnownSkills(context.text, 'Inferred') : [];
	const deduped = uniqueByKey([...explicit, ...inferred], (skill) => skill.skill_name ?? skill.title);
	if (deduped.length > 45) {
		context.warnings.push({
			code: 'NOISY_SKILLS_FILTERED',
			message: 'A large number of possible skills were detected; noisy candidates were filtered before review.',
			severity: 'warning',
			section: 'skills',
		});
		return deduped.slice(0, 45);
	}
	return deduped;
};
