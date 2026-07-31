import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { ConflictError, NotFoundError } from '../../src/utils/errors.js';

const createPortfolioItemMock = vi.fn();
const listPortfolioItemsMock = vi.fn();
const getPortfolioItemByIdMock = vi.fn();
const updatePortfolioItemMock = vi.fn();
const deletePortfolioItemMock = vi.fn();

vi.mock('../../src/modules/portfolio/portfolio.service.js', () => {
	return {
		createPortfolioItem: createPortfolioItemMock,
		listPortfolioItems: listPortfolioItemsMock,
		getPortfolioItemById: getPortfolioItemByIdMock,
		updatePortfolioItem: updatePortfolioItemMock,
		deletePortfolioItem: deletePortfolioItemMock,
	};
});

const loadApp = async () => {
	const { buildApp } = await import('../../src/app.js');
	return buildApp();
};

const item = {
	id: '550e8400-e29b-41d4-a716-446655440000',
	type: 'project',
	source: 'manual',
	title: 'ResumeAI Backend',
	description: 'Backend service for resume generation',
	start_date: '2026-01-01',
	end_date: null,
	is_current: true,
	tech_stack: ['TypeScript', 'Fastify'],
	project_url: 'https://example.com/project',
	impact_metrics: 'Reduced tailoring time by 80%',
	domain_category: 'Web',
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
	skill_name: null,
	document_s3_key: null,
	document_filename: null,
	validation_score: null,
	extra: {},
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
};

const createToken = (userId = 'user-123', email = 'test@example.com') => {
	return jwt.sign({ userId, email }, env.JWT_SECRET, { expiresIn: '1h' });
};

describe('portfolio endpoints', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST /portfolio/items', () => {
		it('creates a portfolio item successfully', async () => {
			createPortfolioItemMock.mockResolvedValueOnce(item);
			const app = await loadApp();
			await app.ready();

			const payload = {
				type: 'project',
				source: 'manual',
				title: 'ResumeAI Backend',
				description: 'Backend service for resume generation',
			};

			const response = await app.inject({
				method: 'POST',
				url: '/portfolio/items',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload,
			});

			expect(response.statusCode).toBe(201);
			expect(response.json()).toEqual({
				success: true,
				message: 'Portfolio item created',
				data: item,
			});
			expect(createPortfolioItemMock).toHaveBeenCalledWith('user-123', payload);

			await app.close();
		});

		it('returns 422 for an invalid create payload', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'POST',
				url: '/portfolio/items',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload: {
					type: 'project',
					source: 'manual',
				},
			});

			expect(response.statusCode).toBe(422);
			expect(response.json()).toMatchObject({
				success: false,
				message: expect.stringContaining('Invalid body payload'),
			});

			await app.close();
		});

		it('returns 409 when a duplicate portfolio item is detected', async () => {
			createPortfolioItemMock.mockRejectedValueOnce(
				new ConflictError('This skill already exists in your portfolio.', 'DUPLICATE_PORTFOLIO_ITEM'),
			);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'POST',
				url: '/portfolio/items',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload: {
					type: 'skill',
					source: 'manual',
					title: 'TypeScript',
					skill_name: 'TypeScript',
				},
			});

			expect(response.statusCode).toBe(409);
			expect(response.json()).toEqual({
				success: false,
				message: 'This skill already exists in your portfolio.',
				code: 'DUPLICATE_PORTFOLIO_ITEM',
			});

			await app.close();
		});

		it('creates a research paper portfolio item with publication metadata', async () => {
			const researchPaper = {
				...item,
				type: 'research_paper',
				title: 'Efficient Edge-Cloud Sepsis Prediction',
				description: 'Preserved abstract text.',
				project_url: 'https://ieeexplore.ieee.org/document/1',
				domain_category: 'conference',
				extra: {
					authors: ['Ada Lovelace', 'Grace Hopper'],
					venue: 'IEEE Health AI Conference',
					year: '2025',
					doi: '10.1109/example.2025.1',
					arxivUrl: 'https://arxiv.org/abs/2501.12345',
					publicationUrl: 'https://ieeexplore.ieee.org/document/1',
					githubUrl: 'https://github.com/example/paper-code',
					status: 'published',
				},
			};
			const payload = {
				type: 'research_paper',
				source: 'manual',
				title: 'Efficient Edge-Cloud Sepsis Prediction',
				description: 'Preserved abstract text.',
				project_url: 'https://ieeexplore.ieee.org/document/1',
				domain_category: 'conference',
				extra: researchPaper.extra,
			};
			createPortfolioItemMock.mockResolvedValueOnce(researchPaper);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'POST',
				url: '/portfolio/items',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload,
			});

			expect(response.statusCode).toBe(201);
			expect(response.json()).toMatchObject({
				success: true,
				data: {
					type: 'research_paper',
					title: 'Efficient Edge-Cloud Sepsis Prediction',
				},
			});
			expect(createPortfolioItemMock).toHaveBeenCalledWith('user-123', payload);

			await app.close();
		});

		it('rejects invalid research paper URLs and DOI values', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'POST',
				url: '/portfolio/items',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload: {
					type: 'research_paper',
					source: 'manual',
					title: 'Broken Paper',
					extra: {
						doi: 'not-a-doi',
						arxivUrl: 'https://example.com/not-arxiv',
						year: '3025',
					},
				},
			});

			expect(response.statusCode).toBe(422);
			expect(response.json()).toMatchObject({
				success: false,
				message: expect.stringContaining('Invalid body payload'),
			});

			await app.close();
		});

		it('returns 401 when the token is missing', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'POST',
				url: '/portfolio/items',
				payload: {
					type: 'project',
					source: 'manual',
					title: 'ResumeAI Backend',
				},
			});

			expect(response.statusCode).toBe(401);
			expect(response.json()).toEqual({
				success: false,
				message: 'Missing bearer token',
			});

			await app.close();
		});
	});

	describe('GET /portfolio/items', () => {
		it('lists portfolio items successfully', async () => {
			listPortfolioItemsMock.mockResolvedValueOnce([item]);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: '/portfolio/items?type=project&source=manual&limit=10&offset=0',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Portfolio items retrieved',
				data: [item],
			});
			expect(listPortfolioItemsMock).toHaveBeenCalledWith('user-123', {
				type: 'project',
				source: 'manual',
				limit: 10,
				offset: 0,
			});

			await app.close();
		});

		it('validates query filters', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: '/portfolio/items?limit=0',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
			});

			expect(response.statusCode).toBe(422);
			expect(response.json()).toMatchObject({
				success: false,
				message: expect.stringContaining('Invalid query payload'),
			});

			await app.close();
		});
	});

	describe('GET /portfolio/items/:id', () => {
		it('gets a portfolio item successfully', async () => {
			getPortfolioItemByIdMock.mockResolvedValueOnce(item);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: `/portfolio/items/${item.id}`,
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Portfolio item retrieved',
				data: item,
			});
			expect(getPortfolioItemByIdMock).toHaveBeenCalledWith('user-123', item.id);

			await app.close();
		});

		it('returns 422 for an invalid UUID', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: '/portfolio/items/not-a-uuid',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
			});

			expect(response.statusCode).toBe(422);
			expect(response.json()).toMatchObject({
				success: false,
				message: expect.stringContaining('Invalid params payload'),
			});

			await app.close();
		});

		it('returns 404 when the item is not found', async () => {
			getPortfolioItemByIdMock.mockRejectedValueOnce(
				new NotFoundError('Portfolio item not found'),
			);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'GET',
				url: `/portfolio/items/${item.id}`,
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
			});

			expect(response.statusCode).toBe(404);
			expect(response.json()).toEqual({
				success: false,
				message: 'Portfolio item not found',
			});

			await app.close();
		});
	});

	describe('PATCH /portfolio/items/:id', () => {
		it('updates a portfolio item successfully', async () => {
			updatePortfolioItemMock.mockResolvedValueOnce(item);
			const app = await loadApp();
			await app.ready();

			const payload = {
				title: 'ResumeAI Backend Updated',
			};

			const response = await app.inject({
				method: 'PATCH',
				url: `/portfolio/items/${item.id}`,
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload,
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Portfolio item updated',
				data: item,
			});
			expect(updatePortfolioItemMock).toHaveBeenCalledWith('user-123', item.id, payload);

			await app.close();
		});

		it('returns 422 for an invalid update payload', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'PATCH',
				url: `/portfolio/items/${item.id}`,
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload: {},
			});

			expect(response.statusCode).toBe(422);
			expect(response.json()).toMatchObject({
				success: false,
				message: expect.stringContaining('Invalid body payload'),
			});

			await app.close();
		});

		it('returns 404 when the item to update is not found', async () => {
			updatePortfolioItemMock.mockRejectedValueOnce(
				new NotFoundError('Portfolio item not found'),
			);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'PATCH',
				url: `/portfolio/items/${item.id}`,
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
				payload: {
					title: 'ResumeAI Backend Updated',
				},
			});

			expect(response.statusCode).toBe(404);
			expect(response.json()).toEqual({
				success: false,
				message: 'Portfolio item not found',
			});

			await app.close();
		});
	});

	describe('DELETE /portfolio/items/:id', () => {
		it('deletes a portfolio item successfully', async () => {
			deletePortfolioItemMock.mockResolvedValueOnce(item.id);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'DELETE',
				url: `/portfolio/items/${item.id}`,
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
			});

			expect(response.statusCode).toBe(200);
			expect(response.json()).toEqual({
				success: true,
				message: 'Portfolio item deleted',
			});
			expect(deletePortfolioItemMock).toHaveBeenCalledWith('user-123', item.id);

			await app.close();
		});

		it('returns 422 for an invalid UUID on delete', async () => {
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'DELETE',
				url: '/portfolio/items/not-a-uuid',
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
			});

			expect(response.statusCode).toBe(422);
			expect(response.json()).toMatchObject({
				success: false,
				message: expect.stringContaining('Invalid params payload'),
			});

			await app.close();
		});

		it('returns 404 when the item to delete is not found', async () => {
			deletePortfolioItemMock.mockRejectedValueOnce(
				new NotFoundError('Portfolio item not found'),
			);
			const app = await loadApp();
			await app.ready();

			const response = await app.inject({
				method: 'DELETE',
				url: `/portfolio/items/${item.id}`,
				headers: {
					authorization: `Bearer ${createToken()}`,
				},
			});

			expect(response.statusCode).toBe(404);
			expect(response.json()).toEqual({
				success: false,
				message: 'Portfolio item not found',
			});

			await app.close();
		});
	});
});
