import { pool } from '../../db/client.js';
import { AppError, ConflictError, NotFoundError } from '../../utils/errors.js';
import { recalculatePortfolioQuality } from '../../services/portfolio-quality.service.js';
import { invalidatePortfolioEmbedding } from '../../services/embedding.service.js';
import { defaultJobOptions, embeddingQueue } from '../../workers/queues.js';
import { trackEvent } from '../../services/analytics-events.service.js';
import type {
	CreatePortfolioItemInput,
	PortfolioItemQuery,
	UpdatePortfolioItemInput,
} from './portfolio.schema.js';

type PortfolioItemRow = {
	id: string;
	user_id: string;
	type: 'project' | 'experience' | 'education' | 'skill' | 'certification' | 'research_paper';
	source: 'manual' | 'upload' | 'github' | 'linkedin_import';
	title: string;
	description: string | null;
	start_date: string | null;
	end_date: string | null;
	is_current: boolean;
	tech_stack: string[];
	project_url: string | null;
	impact_metrics: string | null;
	domain_category: string | null;
	company_name: string | null;
	employment_type: string | null;
	location: string | null;
	degree: string | null;
	field_of_study: string | null;
	institution_name: string | null;
	gpa: string | null;
	achievements: string | null;
	issuing_org: string | null;
	cert_url: string | null;
	expiry_date: string | null;
	no_expiry: boolean;
	skill_name: string | null;
	document_s3_key: string | null;
	document_filename: string | null;
	validation_score: string | null;
	validation_score_reasons?: Record<string, unknown>;
	embedding_status?: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
	embedding_error?: string | null;
	embedding_updated_at?: Date | null;
	extra: Record<string, unknown>;
	created_at: Date;
	updated_at: Date;
};

export type PortfolioItem = Omit<PortfolioItemRow, 'user_id'>;

type DuplicateCheckInput = Partial<CreatePortfolioItemInput & UpdatePortfolioItemInput> & {
	type: PortfolioItemRow['type'];
	title: string;
};

const portfolioSelectColumns = `
	id,
	user_id,
	type,
	source,
	title,
	description,
	start_date,
	end_date,
	is_current,
	tech_stack,
	project_url,
	impact_metrics,
	domain_category,
	company_name,
	employment_type,
	location,
	degree,
	field_of_study,
	institution_name,
	gpa,
	achievements,
	issuing_org,
	cert_url,
	expiry_date,
	no_expiry,
	skill_name,
	document_s3_key,
	document_filename,
	validation_score,
	validation_score_reasons,
	embedding_status,
	embedding_error,
	embedding_updated_at,
	extra,
	created_at,
	updated_at
`;

const toPortfolioItem = (row: PortfolioItemRow): PortfolioItem => {
	const { user_id: _userId, ...item } = row;
	void _userId;
	return item;
};

const getPortfolioItemRowById = async (
	userId: string,
	itemId: string,
): Promise<PortfolioItemRow> => {
	const result = await pool.query<PortfolioItemRow>(
		`
			SELECT ${portfolioSelectColumns}
			FROM portfolio_items
			WHERE id = $1 AND user_id = $2
			LIMIT 1
		`,
		[itemId, userId],
	);

	const item = result.rows[0];

	if (!item) {
		throw new NotFoundError('Portfolio item not found');
	}

	return item;
};

const toDbValue = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value;
	}

	if (value !== null && typeof value === 'object') {
		return JSON.stringify(value);
	}

	return value;
};

const duplicateTextExpr = (column: string) =>
	`lower(regexp_replace(btrim(coalesce(${column}, '')), '\\s+', ' ', 'g'))`;

const normalizeTextKey = (value: string | null | undefined): string | null => {
	if (!value) return null;
	const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
	return normalized || null;
};

const normalizeUrlKey = (value: string | null | undefined): string | null => {
	if (!value) return null;
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, '')
		.replace(/^www\./, '')
		.replace(/\/+$/, '');
	return normalized || null;
};

const extraString = (extra: unknown, key: string): string | undefined => {
	if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return undefined;
	const value = (extra as Record<string, unknown>)[key];
	return typeof value === 'string' ? value : undefined;
};

const duplicateMessageByType: Record<PortfolioItemRow['type'], string> = {
	project: 'A project with the same title or URL already exists in your portfolio.',
	experience: 'An experience with the same role, company, and dates already exists in your portfolio.',
	education: 'An education entry with the same school, degree, field, and dates already exists in your portfolio.',
	skill: 'This skill already exists in your portfolio.',
	certification: 'A certification with the same name, issuer, or URL already exists in your portfolio.',
	research_paper: 'A research paper with the same title or publication link already exists in your portfolio.',
};

const addOptionalTextMatch = (
	conditions: string[],
	values: unknown[],
	column: string,
	value: string | null | undefined,
) => {
	const normalized = normalizeTextKey(value);
	if (normalized) {
		values.push(normalized);
		conditions.push(`${duplicateTextExpr(column)} = $${values.length}`);
	}
};

const addOptionalUrlMatch = (
	conditions: string[],
	values: unknown[],
	column: string,
	value: string | null | undefined,
) => {
	const normalized = normalizeUrlKey(value);
	if (normalized) {
		values.push(normalized);
		conditions.push(
			`regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(${column}, ''))), '^https?://', ''), '^www\\.', ''), '/+$', '') = $${values.length}`,
		);
	}
};

const addDateMatch = (
	conditions: string[],
	values: unknown[],
	column: string,
	value: string | null | undefined,
) => {
	values.push(value ?? null);
	conditions.push(`${column} IS NOT DISTINCT FROM $${values.length}`);
};

const buildDuplicateConditions = (
	input: DuplicateCheckInput,
	values: unknown[],
): string[] => {
	const conditions: string[] = [];

	switch (input.type) {
		case 'skill':
			addOptionalTextMatch(conditions, values, 'skill_name', input.skill_name ?? input.title);
			break;
		case 'project':
			addOptionalTextMatch(conditions, values, 'title', input.title);
			addOptionalUrlMatch(conditions, values, 'project_url', input.project_url);
			break;
		case 'experience': {
			const composite: string[] = [];
			addOptionalTextMatch(composite, values, 'title', input.title);
			addOptionalTextMatch(composite, values, 'company_name', input.company_name);
			addDateMatch(composite, values, 'start_date', input.start_date);
			addDateMatch(composite, values, 'end_date', input.is_current ? null : input.end_date);
			if (composite.length > 1) conditions.push(`(${composite.join(' AND ')})`);
			break;
		}
		case 'education': {
			const composite: string[] = [];
			addOptionalTextMatch(composite, values, 'institution_name', input.institution_name);
			addOptionalTextMatch(composite, values, 'degree', input.degree ?? input.title);
			addOptionalTextMatch(composite, values, 'field_of_study', input.field_of_study);
			addDateMatch(composite, values, 'start_date', input.start_date);
			addDateMatch(composite, values, 'end_date', input.is_current ? null : input.end_date);
			if (composite.length > 1) conditions.push(`(${composite.join(' AND ')})`);
			break;
		}
		case 'certification': {
			const titleIssuer: string[] = [];
			addOptionalTextMatch(titleIssuer, values, 'title', input.title);
			addOptionalTextMatch(titleIssuer, values, 'issuing_org', input.issuing_org);
			if (titleIssuer.length > 1) conditions.push(`(${titleIssuer.join(' AND ')})`);
			addOptionalUrlMatch(conditions, values, 'cert_url', input.cert_url);
			break;
		}
		case 'research_paper':
			addOptionalUrlMatch(conditions, values, 'project_url', input.project_url);
			{
				const doi = normalizeTextKey(extraString(input.extra, 'doi'))?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '');
				if (doi) {
					values.push(doi);
					conditions.push(
						`lower(regexp_replace(btrim(coalesce(extra->>'doi', '')), '^https?://(dx\\.)?doi\\.org/', '', 'i')) = $${values.length}`,
					);
				}
				const arxiv = normalizeUrlKey(extraString(input.extra, 'arxivUrl'));
				if (arxiv) {
					values.push(arxiv.replace(/^arxiv\.org\/(?:abs|pdf)\//i, '').replace(/\.pdf$/i, ''));
					conditions.push(
						`regexp_replace(regexp_replace(lower(btrim(coalesce(extra->>'arxivUrl', ''))), '^https?://(www\\.)?arxiv\\.org/(abs|pdf)/', ''), '\\.pdf$', '') = $${values.length}`,
					);
				}
				const publicationUrl = normalizeUrlKey(extraString(input.extra, 'publicationUrl'));
				if (publicationUrl) {
					values.push(publicationUrl);
					conditions.push(
						`regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(extra->>'publicationUrl', project_url, ''))), '^https?://', ''), '^www\\.', ''), '/+$', '') = $${values.length}`,
					);
				}
				const titleYear: string[] = [];
				addOptionalTextMatch(titleYear, values, 'title', input.title);
				const year = extraString(input.extra, 'year');
				if (year) {
					values.push(year);
					titleYear.push(`btrim(coalesce(extra->>'year', '')) = $${values.length}`);
				}
				if (titleYear.length > 1) conditions.push(`(${titleYear.join(' AND ')})`);
				if (conditions.length === 0) addOptionalTextMatch(conditions, values, 'title', input.title);
			}
			break;
	}

	return conditions;
};

const ensureNoDuplicatePortfolioItem = async (
	userId: string,
	input: DuplicateCheckInput,
	excludeItemId?: string,
): Promise<void> => {
	const values: unknown[] = [userId, input.type];
	const duplicateConditions = buildDuplicateConditions(input, values);

	if (duplicateConditions.length === 0) return;

	const excludeClause = excludeItemId ? `AND id <> $${values.length + 1}` : '';
	if (excludeItemId) values.push(excludeItemId);

	const result = await pool.query<{ id: string }>(
		`
			SELECT id
			FROM portfolio_items
			WHERE user_id = $1
				AND type = $2
				${excludeClause}
				AND (${duplicateConditions.join(' OR ')})
			LIMIT 1
		`,
		values,
	);

	if (result.rows[0]) {
		throw new ConflictError(duplicateMessageByType[input.type], 'DUPLICATE_PORTFOLIO_ITEM');
	}
};

const SEMANTIC_FIELDS = new Set([
	'title',
	'description',
	'tech_stack',
	'impact_metrics',
	'domain_category',
	'company_name',
	'degree',
	'field_of_study',
	'institution_name',
	'achievements',
	'issuing_org',
	'skill_name',
	'extra',
]);

const enqueuePortfolioEmbedding = async (userId: string, itemId: string): Promise<void> => {
	await embeddingQueue.add(
		`portfolio-${itemId}`,
		{ userId, entityType: 'portfolio_item', entityId: itemId },
		{ ...defaultJobOptions, jobId: `portfolio-embedding-${itemId}` },
	).catch(() => undefined);
};

export const createPortfolioItem = async (
	userId: string,
	input: CreatePortfolioItemInput,
): Promise<PortfolioItem> => {
	await ensureNoDuplicatePortfolioItem(userId, input);

	const entries = Object.entries(input);
	const columns = ['user_id', ...entries.map(([column]) => column)];
	const placeholders = columns.map((_, index) => `$${index + 1}`);
	const values = [userId, ...entries.map(([, value]) => toDbValue(value))];

	const result = await pool.query<PortfolioItemRow>(
		`
			INSERT INTO portfolio_items (${columns.join(', ')})
			VALUES (${placeholders.join(', ')})
			RETURNING ${portfolioSelectColumns}
		`,
		values,
	);

	const createdItem = result.rows[0];

	if (!createdItem) {
		throw new AppError('Failed to create portfolio item', 500);
	}

	await recalculatePortfolioQuality(createdItem.id, userId);
	await enqueuePortfolioEmbedding(userId, createdItem.id);
	await trackEvent(userId, 'portfolio_item_created', {
		source: createdItem.source,
	});

	return getPortfolioItemById(userId, createdItem.id);
};

export const listPortfolioItems = async (
	userId: string,
	query: PortfolioItemQuery,
): Promise<PortfolioItem[]> => {
	const conditions = ['user_id = $1'];
	const values: Array<string | number> = [userId];

	if (query.type) {
		values.push(query.type);
		conditions.push(`type = $${values.length}`);
	}

	if (query.source) {
		values.push(query.source);
		conditions.push(`source = $${values.length}`);
	}

	let limitOffsetClause = '';

	if (query.limit !== undefined) {
		values.push(query.limit);
		limitOffsetClause += ` LIMIT $${values.length}`;
	}

	if (query.offset !== undefined) {
		values.push(query.offset);
		limitOffsetClause += ` OFFSET $${values.length}`;
	}

	const result = await pool.query<PortfolioItemRow>(
		`
			SELECT ${portfolioSelectColumns}
			FROM portfolio_items
			WHERE ${conditions.join(' AND ')}
			ORDER BY created_at DESC
			${limitOffsetClause}
		`,
		values,
	);

	return result.rows.map(toPortfolioItem);
};

export const getPortfolioItemById = async (
	userId: string,
	itemId: string,
): Promise<PortfolioItem> => {
	const item = await getPortfolioItemRowById(userId, itemId);
	return toPortfolioItem(item);
};

export const updatePortfolioItem = async (
	userId: string,
	itemId: string,
	input: UpdatePortfolioItemInput,
): Promise<PortfolioItem> => {
	const existingItem = await getPortfolioItemRowById(userId, itemId);
	const duplicateCheckInput = {
		...existingItem,
		...input,
		type: input.type ?? existingItem.type,
		title: input.title ?? existingItem.title,
	};
	await ensureNoDuplicatePortfolioItem(userId, duplicateCheckInput, itemId);

	const entries = Object.entries(input);
	const semanticChanged = entries.some(([column]) => SEMANTIC_FIELDS.has(column));
	const setClause = entries
		.map(([column], index) => `${column} = $${index + 3}`)
		.join(', ');
	const values = [itemId, userId, ...entries.map(([, value]) => toDbValue(value))];

	const result = await pool.query<PortfolioItemRow>(
		`
			UPDATE portfolio_items
			SET ${setClause}${semanticChanged ? ', manually_edited_at = NOW()' : ''}
			WHERE id = $1 AND user_id = $2
			RETURNING ${portfolioSelectColumns}
		`,
		values,
	);

	const item = result.rows[0];

	if (!item) {
		throw new NotFoundError('Portfolio item not found');
	}

	if (semanticChanged) {
		await recalculatePortfolioQuality(item.id, userId);
		await invalidatePortfolioEmbedding(userId, item.id);
		await enqueuePortfolioEmbedding(userId, item.id);
	}

	await trackEvent(userId, 'portfolio_item_updated', {
		source: item.source,
	});

	return getPortfolioItemById(userId, item.id);
};

export const deletePortfolioItem = async (
	userId: string,
	itemId: string,
): Promise<string> => {
	const result = await pool.query<{ id: string }>(
		`
			DELETE FROM portfolio_items
			WHERE id = $1 AND user_id = $2
			RETURNING id
		`,
		[itemId, userId],
	);

	const deletedItem = result.rows[0];

	if (!deletedItem) {
		throw new NotFoundError('Portfolio item not found');
	}

	return deletedItem.id;
};
