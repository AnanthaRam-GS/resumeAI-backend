import { z } from 'zod';

const dateStringSchema = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

const optionalNullableDateStringSchema = dateStringSchema.nullable().optional();

const optionalTextSchema = z.string().trim().nullable().optional();

const optionalUrlSchema = z.preprocess((value) => {
	if (value === null || value === undefined) return value;
	if (typeof value !== 'string') return value;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}, z.string().url('URL must be a valid URL').nullable().optional());

export const portfolioItemTypeSchema = z.enum([
	'project',
	'experience',
	'education',
	'skill',
	'certification',
]);

export const portfolioItemSourceSchema = z.enum(['manual', 'upload', 'github']);

const portfolioItemFields = {
	type: portfolioItemTypeSchema,
	source: portfolioItemSourceSchema,
	title: z.string().trim().min(1, 'Title is required'),
	description: optionalTextSchema,
	start_date: optionalNullableDateStringSchema,
	end_date: optionalNullableDateStringSchema,
	is_current: z.boolean().optional(),
	tech_stack: z.array(z.string().trim().min(1)).optional(),
	project_url: optionalUrlSchema,
	impact_metrics: optionalTextSchema,
	domain_category: optionalTextSchema,
	company_name: optionalTextSchema,
	employment_type: optionalTextSchema,
	location: optionalTextSchema,
	degree: optionalTextSchema,
	field_of_study: optionalTextSchema,
	institution_name: optionalTextSchema,
	gpa: optionalTextSchema,
	achievements: optionalTextSchema,
	issuing_org: optionalTextSchema,
	cert_url: optionalUrlSchema,
	expiry_date: optionalNullableDateStringSchema,
	no_expiry: z.boolean().optional(),
	skill_name: optionalTextSchema,
	document_s3_key: optionalTextSchema,
	document_filename: optionalTextSchema,
	extra: z.record(z.string(), z.unknown()).optional(),
};

export const createPortfolioItemSchema = z.object(portfolioItemFields);

export const updatePortfolioItemSchema = z
	.object({
		type: portfolioItemTypeSchema.optional(),
		source: portfolioItemSourceSchema.optional(),
		title: z.string().trim().min(1, 'Title is required').optional(),
		description: optionalTextSchema,
		start_date: optionalNullableDateStringSchema,
		end_date: optionalNullableDateStringSchema,
		is_current: z.boolean().optional(),
		tech_stack: z.array(z.string().trim().min(1)).optional(),
		project_url: optionalUrlSchema,
		impact_metrics: optionalTextSchema,
		domain_category: optionalTextSchema,
		company_name: optionalTextSchema,
		employment_type: optionalTextSchema,
		location: optionalTextSchema,
		degree: optionalTextSchema,
		field_of_study: optionalTextSchema,
		institution_name: optionalTextSchema,
		gpa: optionalTextSchema,
		achievements: optionalTextSchema,
		issuing_org: optionalTextSchema,
		cert_url: optionalUrlSchema,
		expiry_date: optionalNullableDateStringSchema,
		no_expiry: z.boolean().optional(),
		skill_name: optionalTextSchema,
		document_s3_key: optionalTextSchema,
		document_filename: optionalTextSchema,
		extra: z.record(z.string(), z.unknown()).optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: 'At least one field must be provided',
		path: [],
	});

export const portfolioItemParamsSchema = z.object({
	id: z.uuid('Portfolio item id must be a valid UUID'),
});

export const portfolioItemQuerySchema = z.object({
	type: portfolioItemTypeSchema.optional(),
	source: portfolioItemSourceSchema.optional(),
	limit: z.coerce.number().int().min(1, 'Limit must be at least 1').optional(),
	offset: z.coerce.number().int().min(0, 'Offset must be at least 0').optional(),
});

export type CreatePortfolioItemInput = z.infer<typeof createPortfolioItemSchema>;
export type UpdatePortfolioItemInput = z.infer<typeof updatePortfolioItemSchema>;
export type PortfolioItemParams = z.infer<typeof portfolioItemParamsSchema>;
export type PortfolioItemQuery = z.infer<typeof portfolioItemQuerySchema>;
