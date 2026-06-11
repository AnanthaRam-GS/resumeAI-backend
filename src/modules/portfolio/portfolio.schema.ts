import { z } from 'zod';

const dateStringSchema = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

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
	description: z.string().trim().optional(),
	start_date: dateStringSchema.optional(),
	end_date: dateStringSchema.optional(),
	is_current: z.boolean().optional(),
	tech_stack: z.array(z.string().trim().min(1)).optional(),
	project_url: z.string().trim().url('Project URL must be a valid URL').optional(),
	impact_metrics: z.string().trim().optional(),
	domain_category: z.string().trim().optional(),
	company_name: z.string().trim().optional(),
	employment_type: z.string().trim().optional(),
	location: z.string().trim().optional(),
	degree: z.string().trim().optional(),
	field_of_study: z.string().trim().optional(),
	institution_name: z.string().trim().optional(),
	gpa: z.string().trim().optional(),
	achievements: z.string().trim().optional(),
	issuing_org: z.string().trim().optional(),
	cert_url: z.string().trim().url('Certification URL must be a valid URL').optional(),
	expiry_date: dateStringSchema.optional(),
	no_expiry: z.boolean().optional(),
	skill_name: z.string().trim().optional(),
	document_s3_key: z.string().trim().optional(),
	document_filename: z.string().trim().optional(),
	extra: z.record(z.string(), z.unknown()).optional(),
};

export const createPortfolioItemSchema = z.object(portfolioItemFields);

export const updatePortfolioItemSchema = z
	.object({
		type: portfolioItemTypeSchema.optional(),
		source: portfolioItemSourceSchema.optional(),
		title: z.string().trim().min(1, 'Title is required').optional(),
		description: z.string().trim().optional(),
		start_date: dateStringSchema.optional(),
		end_date: dateStringSchema.optional(),
		is_current: z.boolean().optional(),
		tech_stack: z.array(z.string().trim().min(1)).optional(),
		project_url: z.string().trim().url('Project URL must be a valid URL').optional(),
		impact_metrics: z.string().trim().optional(),
		domain_category: z.string().trim().optional(),
		company_name: z.string().trim().optional(),
		employment_type: z.string().trim().optional(),
		location: z.string().trim().optional(),
		degree: z.string().trim().optional(),
		field_of_study: z.string().trim().optional(),
		institution_name: z.string().trim().optional(),
		gpa: z.string().trim().optional(),
		achievements: z.string().trim().optional(),
		issuing_org: z.string().trim().optional(),
		cert_url: z.string().trim().url('Certification URL must be a valid URL').optional(),
		expiry_date: dateStringSchema.optional(),
		no_expiry: z.boolean().optional(),
		skill_name: z.string().trim().optional(),
		document_s3_key: z.string().trim().optional(),
		document_filename: z.string().trim().optional(),
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
