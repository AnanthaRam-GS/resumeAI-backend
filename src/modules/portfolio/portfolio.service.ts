import { pool } from '../../db/client.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import type {
	CreatePortfolioItemInput,
	PortfolioItemQuery,
	UpdatePortfolioItemInput,
} from './portfolio.schema.js';

type PortfolioItemRow = {
	id: string;
	user_id: string;
	type: 'project' | 'experience' | 'education' | 'skill' | 'certification';
	source: 'manual' | 'upload' | 'github';
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
	extra: Record<string, unknown>;
	created_at: Date;
	updated_at: Date;
};

export type PortfolioItem = Omit<PortfolioItemRow, 'user_id'>;

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

export const createPortfolioItem = async (
	userId: string,
	input: CreatePortfolioItemInput,
): Promise<PortfolioItem> => {
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

	return toPortfolioItem(createdItem);
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
	const entries = Object.entries(input);
	const setClause = entries
		.map(([column], index) => `${column} = $${index + 3}`)
		.join(', ');
	const values = [itemId, userId, ...entries.map(([, value]) => toDbValue(value))];

	const result = await pool.query<PortfolioItemRow>(
		`
			UPDATE portfolio_items
			SET ${setClause}
			WHERE id = $1 AND user_id = $2
			RETURNING ${portfolioSelectColumns}
		`,
		values,
	);

	const item = result.rows[0];

	if (!item) {
		throw new NotFoundError('Portfolio item not found');
	}

	return toPortfolioItem(item);
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
