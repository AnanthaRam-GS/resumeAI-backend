import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQueryMock = vi.fn();
const recalculatePortfolioQualityMock = vi.fn();
const invalidatePortfolioEmbeddingMock = vi.fn();
const embeddingQueueAddMock = vi.fn();
const trackEventMock = vi.fn();

vi.mock('../../src/db/client.js', () => ({ pool: { query: poolQueryMock } }));
vi.mock('../../src/services/portfolio-quality.service.js', () => ({
	recalculatePortfolioQuality: recalculatePortfolioQualityMock,
}));
vi.mock('../../src/services/embedding.service.js', () => ({
	invalidatePortfolioEmbedding: invalidatePortfolioEmbeddingMock,
}));
vi.mock('../../src/workers/queues.js', () => ({
	defaultJobOptions: {},
	embeddingQueue: { add: embeddingQueueAddMock },
}));
vi.mock('../../src/services/analytics-events.service.js', () => ({
	trackEvent: trackEventMock,
}));

const baseRow = {
	id: '550e8400-e29b-41d4-a716-446655440000',
	user_id: 'user-123',
	type: 'skill',
	source: 'manual',
	title: 'TypeScript',
	description: null,
	start_date: null,
	end_date: null,
	is_current: false,
	tech_stack: [],
	project_url: null,
	impact_metrics: null,
	domain_category: null,
	company_name: null,
	employment_type: null,
	location: null,
	degree: null,
	field_of_study: null,
	institution_name: null,
	gpa: null,
	achievements: null,
	issuing_org: null,
	cert_url: null,
	expiry_date: null,
	no_expiry: false,
	skill_name: 'TypeScript',
	document_s3_key: null,
	document_filename: null,
	validation_score: null,
	validation_score_reasons: {},
	embedding_status: 'pending',
	embedding_error: null,
	embedding_updated_at: null,
	extra: {},
	created_at: new Date('2026-01-01T00:00:00Z'),
	updated_at: new Date('2026-01-01T00:00:00Z'),
};

describe('portfolio service duplicate prevention', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		recalculatePortfolioQualityMock.mockResolvedValue(null);
		embeddingQueueAddMock.mockResolvedValue({ id: 'job-1' });
		trackEventMock.mockResolvedValue(undefined);
		invalidatePortfolioEmbeddingMock.mockResolvedValue(undefined);
	});

	it('rejects duplicate skills by normalized skill name before inserting', async () => {
		poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });
		const { createPortfolioItem } = await import('../../src/modules/portfolio/portfolio.service.js');

		await expect(
			createPortfolioItem('user-123', {
				type: 'skill',
				source: 'manual',
				title: ' typescript ',
				skill_name: '  TypeScript  ',
			}),
		).rejects.toMatchObject({
			statusCode: 409,
			code: 'DUPLICATE_PORTFOLIO_ITEM',
		});

		expect(poolQueryMock).toHaveBeenCalledTimes(1);
		expect(String(poolQueryMock.mock.calls[0]?.[0])).toContain('lower(regexp_replace');
		expect(poolQueryMock.mock.calls[0]?.[1]).toEqual(['user-123', 'skill', 'typescript']);
	});

	it('creates a non-duplicate portfolio item and returns the inserted item', async () => {
		poolQueryMock
			.mockResolvedValueOnce({ rows: [] })
			.mockResolvedValueOnce({ rows: [baseRow] })
			.mockResolvedValueOnce({ rows: [baseRow] });
		const { createPortfolioItem } = await import('../../src/modules/portfolio/portfolio.service.js');

		const result = await createPortfolioItem('user-123', {
			type: 'skill',
			source: 'manual',
			title: 'TypeScript',
			skill_name: 'TypeScript',
		});

		expect(result).toMatchObject({
			id: baseRow.id,
			title: 'TypeScript',
			skill_name: 'TypeScript',
		});
		expect(poolQueryMock).toHaveBeenCalledTimes(3);
		expect(recalculatePortfolioQualityMock).toHaveBeenCalledWith(baseRow.id, 'user-123');
		expect(embeddingQueueAddMock).toHaveBeenCalled();
		expect(trackEventMock).toHaveBeenCalledWith('user-123', 'portfolio_item_created', {
			source: 'manual',
		});
	});

	it('rejects updates that would duplicate another project URL', async () => {
		const existingProject = {
			...baseRow,
			type: 'project',
			title: 'Portfolio Site',
			project_url: 'https://example.com/portfolio',
			skill_name: null,
		};
		poolQueryMock
			.mockResolvedValueOnce({ rows: [existingProject] })
			.mockResolvedValueOnce({ rows: [{ id: 'other-project-id' }] });
		const { updatePortfolioItem } = await import('../../src/modules/portfolio/portfolio.service.js');

		await expect(
			updatePortfolioItem('user-123', baseRow.id, {
				project_url: 'https://www.example.com/portfolio/',
			}),
		).rejects.toMatchObject({
			statusCode: 409,
			code: 'DUPLICATE_PORTFOLIO_ITEM',
		});

		expect(poolQueryMock).toHaveBeenCalledTimes(2);
		expect(String(poolQueryMock.mock.calls[1]?.[0])).toContain('id <> $5');
		expect(poolQueryMock.mock.calls[1]?.[1]).toEqual([
			'user-123',
			'project',
			'portfolio site',
			'example.com/portfolio',
			baseRow.id,
		]);
	});

	it('rejects duplicate research papers by publication identifiers before inserting', async () => {
		poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 'existing-paper-id' }] });
		const { createPortfolioItem } = await import('../../src/modules/portfolio/portfolio.service.js');

		await expect(
			createPortfolioItem('user-123', {
				type: 'research_paper',
				source: 'manual',
				title: 'Efficient Edge-Cloud Sepsis Prediction',
				description: 'Preserved abstract text.',
				project_url: 'https://ieeexplore.ieee.org/document/1',
				extra: {
					doi: 'https://doi.org/10.1109/HEALTHAI.2025.1234567',
					arxivUrl: 'https://arxiv.org/abs/2501.12345',
					publicationUrl: 'https://ieeexplore.ieee.org/document/1',
					year: '2025',
				},
			}),
		).rejects.toMatchObject({
			statusCode: 409,
			code: 'DUPLICATE_PORTFOLIO_ITEM',
		});

		expect(poolQueryMock).toHaveBeenCalledTimes(1);
		const duplicateSql = String(poolQueryMock.mock.calls[0]?.[0]);
		expect(duplicateSql).toContain("extra->>'doi'");
		expect(duplicateSql).toContain("extra->>'arxivUrl'");
		expect(duplicateSql).toContain("extra->>'publicationUrl'");
		expect(duplicateSql).toContain("extra->>'year'");
		expect(poolQueryMock.mock.calls[0]?.[1]).toEqual([
			'user-123',
			'research_paper',
			'ieeexplore.ieee.org/document/1',
			'10.1109/healthai.2025.1234567',
			'2501.12345',
			'ieeexplore.ieee.org/document/1',
			'efficient edge-cloud sepsis prediction',
			'2025',
		]);
	});
});
