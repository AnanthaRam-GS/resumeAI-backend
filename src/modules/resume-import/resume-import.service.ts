import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../../db/client.js';
import { deleteFile, downloadFile, uploadFile } from '../../services/storage.service.js';
import { AppError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { computeSimhash, findNearestSimhash } from '../../utils/simhash.js';
import {
	parseResumeBuffer,
	RESUME_PARSER_VERSION,
	extractResumeDocument,
} from './parser/index.js';
import { isProjectTitleCandidate } from './parser/extractProjects.js';
import type { ApplyResumeInput, ParsedResumeData } from './resume-import.schema.js';

export interface ResumeDocument {
	id: string;
	user_id: string;
	original_filename: string;
	storage_key: string;
	mime_type: string;
	file_size: number;
	file_hash: string;
	canonical_content_hash: string | null;
	simhash_fingerprint: string | null;
	parsing_status: 'pending' | 'processing' | 'completed' | 'failed';
	parsing_error: string | null;
	parsed_data: ParsedResumeData | null;
	extracted_text: string | null;
	parser_version: string;
	parse_warnings: unknown[];
	parse_duration_ms: number | null;
	applied_at: Date | null;
	apply_summary: ApplySummary | null;
	version_number: number;
	is_active: boolean;
	created_at: Date;
	updated_at: Date;
}

export interface UploadAcceptedResult {
	docId: string;
	filename: string;
	status: 'processing' | 'completed';
	parserVersion: string;
	cached?: boolean;
	parsedData?: ParsedResumeData;
	warnings?: ParsedResumeData['warnings'];
	confidence?: ParsedResumeData['confidence'];
	nearDuplicateWarning?: {
		existingDocId: string;
		message: string;
	};
}

export interface DocumentStatusResult {
	docId: string;
	status: ResumeDocument['parsing_status'];
	parsedData?: ParsedResumeData;
	parsingError?: string;
	filename: string;
	parserVersion: string;
	warnings?: ParsedResumeData['warnings'];
	confidence?: ParsedResumeData['confidence'];
	parseDurationMs?: number;
}

export interface ApplySummary {
	applied: {
		profileFields: number;
		education: number;
		experience: number;
		projects: number;
		researchPapers: number;
		skills: number;
		certifications: number;
	};
	skipped: {
		duplicates: number;
		invalid: number;
	};
	warnings: string[];
}

const sha256 = (input: Buffer | string): string => createHash('sha256').update(input).digest('hex');

const normalizeForFingerprint = (text: string): string =>
	text
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.replace(/[^\w\s@.+\-/]/g, '')
		.trim();

type ImportDuplicateCheckInput =
	| { type: 'project'; title: string; project_url?: string }
	| {
			type: 'research_paper';
			title: string;
			year?: string;
			doi?: string;
			arxivUrl?: string;
			publicationUrl?: string;
	  }
	| {
			type: 'experience';
			title: string;
			company_name?: string;
			start_date?: string;
			end_date?: string;
			is_current?: boolean;
	  }
	| {
			type: 'education';
			title: string;
			degree?: string;
			field_of_study?: string;
			institution_name?: string;
			start_date?: string;
			end_date?: string;
			is_current?: boolean;
	  }
	| { type: 'skill'; title: string; skill_name?: string }
	| { type: 'certification'; title: string; issuing_org?: string; cert_url?: string };

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

const addOptionalTextMatch = (
	conditions: string[],
	values: unknown[],
	column: string,
	value: string | null | undefined,
) => {
	const normalized = normalizeTextKey(value);
	if (!normalized) return;
	values.push(normalized);
	conditions.push(`${duplicateTextExpr(column)} = $${values.length}`);
};

const addOptionalUrlMatch = (
	conditions: string[],
	values: unknown[],
	column: string,
	value: string | null | undefined,
) => {
	const normalized = normalizeUrlKey(value);
	if (!normalized) return;
	values.push(normalized);
	conditions.push(
		`regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(${column}, ''))), '^https?://', ''), '^www\\.', ''), '/+$', '') = $${values.length}`,
	);
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

const duplicateConditionsForImport = (
	input: ImportDuplicateCheckInput,
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
		case 'research_paper': {
			addOptionalUrlMatch(conditions, values, 'project_url', input.publicationUrl ?? input.arxivUrl);
			const doi = normalizeTextKey(input.doi);
			if (doi) {
				values.push(doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, ''));
				conditions.push(
					`lower(regexp_replace(btrim(coalesce(extra->>'doi', '')), '^https?://(dx\\.)?doi\\.org/', '', 'i')) = $${values.length}`,
				);
			}
			const arxiv = normalizeUrlKey(input.arxivUrl);
			if (arxiv) {
				values.push(arxiv.replace(/^arxiv\.org\/(?:abs|pdf)\//i, '').replace(/\.pdf$/i, ''));
				conditions.push(
					`regexp_replace(regexp_replace(lower(btrim(coalesce(extra->>'arxivUrl', ''))), '^https?://(www\\.)?arxiv\\.org/(abs|pdf)/', ''), '\\.pdf$', '') = $${values.length}`,
				);
			}
			const publicationUrl = normalizeUrlKey(input.publicationUrl);
			if (publicationUrl) {
				values.push(publicationUrl);
				conditions.push(
					`regexp_replace(regexp_replace(regexp_replace(lower(btrim(coalesce(extra->>'publicationUrl', project_url, ''))), '^https?://', ''), '^www\\.', ''), '/+$', '') = $${values.length}`,
				);
			}
			const titleYear: string[] = [];
			addOptionalTextMatch(titleYear, values, 'title', input.title);
			if (input.year) {
				values.push(input.year);
				titleYear.push(`btrim(coalesce(extra->>'year', '')) = $${values.length}`);
			}
			if (titleYear.length > 1) conditions.push(`(${titleYear.join(' AND ')})`);
			break;
		}
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
	}
	return conditions;
};

const portfolioDuplicateExists = async (
	client: PoolClient,
	userId: string,
	input: ImportDuplicateCheckInput,
): Promise<boolean> => {
	const values: unknown[] = [userId, input.type];
	const conditions = duplicateConditionsForImport(input, values);
	if (conditions.length === 0) return false;
	const result = await client.query<{ id: string }>(
		`
			SELECT id
			FROM portfolio_items
			WHERE user_id = $1
			  AND type = $2
			  AND (${conditions.join(' OR ')})
			LIMIT 1
		`,
		values,
	);
	return Boolean(result.rows[0]);
};

export const parseAndUpdateDocument = async (
	docId: string,
	buffer?: Buffer,
	mimetype?: string,
	filename?: string,
): Promise<void> => {
	const doc = await getResumeDocumentByIdOnly(docId);
	await pool.query(
		`UPDATE resume_documents
		    SET parsing_status = 'processing',
		        parsing_error = NULL,
		        parser_version = $2,
		        updated_at = NOW()
		  WHERE id = $1`,
		[docId, RESUME_PARSER_VERSION],
	);

	const started = Date.now();
	try {
		const parseBuffer = buffer ?? (await downloadFile(doc.storage_key));
		const parsedData = await parseResumeBuffer(
			parseBuffer,
			mimetype ?? doc.mime_type,
			filename ?? doc.original_filename,
		);
		const extracted = await extractResumeDocument(parseBuffer, mimetype ?? doc.mime_type, filename ?? doc.original_filename);
		const contentHash = sha256(normalizeForFingerprint(extracted.text));
		const simhash = extracted.text.length >= 50 ? computeSimhash(extracted.text) : null;
		const duration = Date.now() - started;
		logger.info(
			{
				docId,
				fileType: parsedData.sourceFile?.fileType,
				fileSize: doc.file_size,
				parserVersion: RESUME_PARSER_VERSION,
				linkCount: parsedData.extractedLinks.length,
				educationCount: parsedData.education?.length ?? 0,
				projectCount: parsedData.projects?.length ?? 0,
				researchPaperCount: parsedData.researchPapers?.length ?? 0,
				skillCount: parsedData.skills?.length ?? 0,
				warningCount: parsedData.warnings.length,
				parseDurationMs: duration,
			},
			'Resume import parse completed',
		);
		await pool.query(
			`UPDATE resume_documents
			   SET parsing_status = 'completed',
			       parsed_data = $2,
			       parsing_error = NULL,
			       extracted_text = NULL,
			       canonical_content_hash = $3,
			       simhash_fingerprint = $4,
			       parser_version = $5,
			       parse_warnings = $6,
			       parse_duration_ms = $7,
			       updated_at = NOW()
			 WHERE id = $1`,
			[
				docId,
				JSON.stringify(parsedData),
				contentHash,
				simhash,
				RESUME_PARSER_VERSION,
				JSON.stringify(parsedData.warnings),
				duration,
			],
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.warn({ err, docId, parserVersion: RESUME_PARSER_VERSION }, 'Resume import parse failed');
		await pool.query(
			`UPDATE resume_documents
			   SET parsing_status = 'failed',
			       parsing_error = $2,
			       parse_duration_ms = $3,
			       updated_at = NOW()
			 WHERE id = $1`,
			[docId, message, Date.now() - started],
		);
	}
};

export const uploadResumeInitial = async (
	userId: string,
	buffer: Buffer,
	mimetype: string,
	filename: string,
	uploadSource: 'portfolio' | 'onboarding' = 'portfolio',
): Promise<UploadAcceptedResult & { buffer?: Buffer; mimetype?: string }> => {
	const fileHash = sha256(buffer);

	const cached = await pool.query<{
		id: string;
		original_filename: string;
		parsed_data: ParsedResumeData;
		parse_warnings: ParsedResumeData['warnings'];
	}>(
		`SELECT id, original_filename, parsed_data, parse_warnings
		   FROM resume_documents
		  WHERE user_id = $1
		    AND file_hash = $2
		    AND parser_version = $3
		    AND parsing_status = 'completed'
		    AND parsed_data IS NOT NULL
		  ORDER BY created_at DESC
		  LIMIT 1`,
		[userId, fileHash, RESUME_PARSER_VERSION],
	);
	if (cached.rows[0]) {
		return {
			docId: cached.rows[0].id,
			filename: cached.rows[0].original_filename,
			status: 'completed',
			parserVersion: RESUME_PARSER_VERSION,
			cached: true,
			parsedData: cached.rows[0].parsed_data,
			warnings: cached.rows[0].parsed_data.warnings,
			confidence: cached.rows[0].parsed_data.confidence,
			nearDuplicateWarning: {
				existingDocId: cached.rows[0].id,
				message: 'This exact resume was already parsed. We reused the previous parse result.',
			},
		};
	}

	let extractedText = '';
	let nearDuplicateWarning: UploadAcceptedResult['nearDuplicateWarning'];
	try {
		const extracted = await extractResumeDocument(buffer, mimetype, filename);
		extractedText = extracted.text;
	} catch (error) {
		if (error instanceof ValidationError) throw error;
		throw new ValidationError('Could not read this document. Please upload a valid text-based PDF or DOCX.');
	}

	const dupFile = await pool.query<{ id: string }>(
		`SELECT id FROM resume_documents WHERE user_id = $1 AND file_hash = $2 LIMIT 1`,
		[userId, fileHash],
	);
	if (dupFile.rows[0]) {
		nearDuplicateWarning = {
			existingDocId: dupFile.rows[0].id,
			message:
				'This exact resume file was uploaded before. We will parse it again because the parser has changed; duplicates will be skipped when you apply it.',
		};
	}

	const contentHash = extractedText ? sha256(normalizeForFingerprint(extractedText)) : null;
	const simhash = extractedText.length >= 50 ? computeSimhash(extractedText) : null;

	if (!nearDuplicateWarning && contentHash) {
		const dupContent = await pool.query<{ id: string }>(
			`SELECT id FROM resume_documents WHERE user_id = $1 AND canonical_content_hash = $2 LIMIT 1`,
			[userId, contentHash],
		);
		if (dupContent.rows[0]) {
			nearDuplicateWarning = {
				existingDocId: dupContent.rows[0].id,
				message:
					'This resume content was uploaded before. Already-saved portfolio entries will be skipped when you apply it.',
			};
		}
	}

	if (!nearDuplicateWarning && simhash) {
		const existingSimhashes = await pool.query<{ id: string; simhash_fingerprint: string }>(
			`SELECT id, simhash_fingerprint
			   FROM resume_documents
			  WHERE user_id = $1 AND simhash_fingerprint IS NOT NULL`,
			[userId],
		);
		const nearest = findNearestSimhash(
			simhash,
			existingSimhashes.rows.map((row) => ({ id: row.id, simhash: row.simhash_fingerprint })),
		);
		if (nearest) {
			nearDuplicateWarning = {
				existingDocId: nearest.id,
				message:
					'This resume looks very similar to one you already uploaded. Check the review step before applying it.',
			};
		}
	}

	const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
	const storageKey = `users/${userId}/resumes/${Date.now()}_${safeFilename}`;
	await uploadFile(storageKey, buffer, mimetype);

	const result = await pool.query<{ id: string }>(
		`INSERT INTO resume_documents
		  (user_id, original_filename, storage_key, mime_type, file_size,
		   file_hash, canonical_content_hash, simhash_fingerprint,
		   extracted_text, parsing_status, upload_source, parser_version)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,'pending',$9,$10)
		 RETURNING id`,
		[
			userId,
			filename,
			storageKey,
			mimetype,
			buffer.length,
			fileHash,
			contentHash,
			simhash,
			uploadSource,
			RESUME_PARSER_VERSION,
		],
	);
	const row = result.rows[0];
	if (!row) throw new AppError('Failed to persist resume document', 500);

	return {
		docId: row.id,
		filename,
		status: 'processing',
		parserVersion: RESUME_PARSER_VERSION,
		nearDuplicateWarning,
		buffer,
		mimetype,
	};
};

export const getDocumentStatus = async (
	userId: string,
	docId: string,
): Promise<DocumentStatusResult> => {
	const result = await pool.query<{
		id: string;
		original_filename: string;
		parsing_status: ResumeDocument['parsing_status'];
		parsed_data: ParsedResumeData | null;
		parsing_error: string | null;
		parser_version: string;
		parse_duration_ms: number | null;
	}>(
		`SELECT id, original_filename, parsing_status, parsed_data, parsing_error,
		        parser_version, parse_duration_ms
		   FROM resume_documents
		  WHERE id = $1 AND user_id = $2`,
		[docId, userId],
	);
	const doc = result.rows[0];
	if (!doc) throw new NotFoundError('Resume document not found');
	return {
		docId: doc.id,
		status: doc.parsing_status,
		filename: doc.original_filename,
		parserVersion: doc.parser_version,
		...(doc.parse_duration_ms ? { parseDurationMs: doc.parse_duration_ms } : {}),
		...(doc.parsing_status === 'completed' && doc.parsed_data
			? {
					parsedData: doc.parsed_data,
					warnings: doc.parsed_data.warnings,
					confidence: doc.parsed_data.confidence,
				}
			: {}),
		...(doc.parsing_status === 'failed' && doc.parsing_error ? { parsingError: doc.parsing_error } : {}),
	};
};

export const retryParsing = async (
	userId: string,
	docId: string,
): Promise<{ docId: string; status: 'processing' }> => {
	const result = await pool.query<{ id: string; parsing_status: string }>(
		`SELECT id, parsing_status
		   FROM resume_documents
		  WHERE id = $1 AND user_id = $2`,
		[docId, userId],
	);
	const doc = result.rows[0];
	if (!doc) throw new NotFoundError('Resume document not found');
	if (doc.parsing_status === 'processing') throw new AppError('Parsing is already in progress', 409);
	await pool.query(
		`UPDATE resume_documents
		    SET parsing_status = 'pending',
		        parsing_error = NULL,
		        parser_version = $2,
		        updated_at = NOW()
		  WHERE id = $1`,
		[docId, RESUME_PARSER_VERSION],
	);
	return { docId, status: 'processing' };
};

const getResumeDocumentByIdOnly = async (docId: string): Promise<ResumeDocument> => {
	const result = await pool.query<ResumeDocument>(
		`SELECT id, user_id, original_filename, storage_key, mime_type, file_size,
		        file_hash, canonical_content_hash, simhash_fingerprint,
		        parsing_status, parsing_error, parsed_data, extracted_text,
		        parser_version, parse_warnings, parse_duration_ms, applied_at, apply_summary,
		        version_number, is_active, created_at, updated_at
		   FROM resume_documents
		  WHERE id = $1`,
		[docId],
	);
	const doc = result.rows[0];
	if (!doc) throw new NotFoundError('Resume document not found');
	return doc;
};

export const getResumeDocument = async (userId: string, docId: string): Promise<ResumeDocument> => {
	const doc = await getResumeDocumentByIdOnly(docId);
	if (doc.user_id !== userId) throw new NotFoundError('Resume document not found');
	return doc;
};

export const deleteResumeDocument = async (
	userId: string,
	docId: string,
): Promise<{ deleted: true }> => {
	const result = await pool.query<{ storage_key: string }>(
		`DELETE FROM resume_documents
		  WHERE id = $1 AND user_id = $2
		  RETURNING storage_key`,
		[docId, userId],
	);
	const deleted = result.rows[0];
	if (!deleted) throw new NotFoundError('Resume document not found');
	await deleteFile(deleted.storage_key).catch(() => undefined);
	return { deleted: true };
};

const initialApplySummary = (): ApplySummary => ({
	applied: {
		profileFields: 0,
		education: 0,
		experience: 0,
		projects: 0,
		researchPapers: 0,
		skills: 0,
		certifications: 0,
	},
	skipped: { duplicates: 0, invalid: 0 },
	warnings: [],
});

const addProfileUpdates = (personal: ApplyResumeInput['personal']): Record<string, string> => {
	const updates: Record<string, string> = {};
	if (!personal) return updates;
	if (personal.full_name) updates.full_name = personal.full_name;
	if (personal.phone) updates.phone_number = personal.phone;
	if (personal.location) updates.location = personal.location;
	if (personal.linkedin_url) updates.linkedin_url = personal.linkedin_url;
	if (personal.github_url) updates.github_url = personal.github_url;
	if (personal.portfolio_url) updates.portfolio_url = personal.portfolio_url;
	if (personal.summary) updates.career_goal = personal.summary;
	return updates;
};

export const applyParsedResume = async (
	userId: string,
	docId: string,
	approved: ApplyResumeInput,
): Promise<ApplySummary> => {
	const doc = await getResumeDocument(userId, docId);
	if (doc.parsing_status !== 'completed') throw new ValidationError('Resume parsing is not complete yet.');

	const client = await pool.connect();
	const summary = initialApplySummary();
	try {
		await client.query('BEGIN');

		const profileUpdates = addProfileUpdates(approved.personal);
		const profileEntries = Object.entries(profileUpdates);
		if (profileEntries.length > 0) {
			const setClause = profileEntries.map(([column], index) => `${column} = $${index + 2}`).join(', ');
			await client.query(`UPDATE users SET ${setClause} WHERE id = $1`, [
				userId,
				...profileEntries.map(([, value]) => value),
			]);
			summary.applied.profileFields = profileEntries.length;
		}

		for (const exp of approved.experience ?? []) {
			if (!exp.title) {
				summary.skipped.invalid++;
				continue;
			}
			if (
				await portfolioDuplicateExists(client, userId, {
					type: 'experience',
					title: exp.title,
					company_name: exp.company_name,
					start_date: exp.start_date,
					end_date: exp.end_date,
					is_current: exp.is_current,
				})
			) {
				summary.skipped.duplicates++;
				continue;
			}
			await client.query(
				`INSERT INTO portfolio_items
				  (user_id, type, source, title, company_name, location, start_date, end_date,
				   is_current, description, tech_stack, achievements, employment_type,
				   document_s3_key, document_filename)
				 VALUES ($1,'experience','upload',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
				[
					userId,
					exp.title,
					exp.company_name ?? null,
					exp.location ?? null,
					exp.start_date ?? null,
					exp.end_date ?? null,
					exp.is_current ?? false,
					exp.description ?? exp.bullets?.join('\n') ?? null,
					exp.tech_stack ?? [],
					exp.achievements ?? exp.bullets?.join('\n') ?? null,
					exp.employment_type ?? null,
					doc.storage_key,
					doc.original_filename,
				],
			);
			summary.applied.experience++;
		}

		for (const edu of approved.education ?? []) {
			if (!edu.degree && !edu.institution_name) {
				summary.skipped.invalid++;
				continue;
			}
			if (
				await portfolioDuplicateExists(client, userId, {
					type: 'education',
					title: edu.title,
					degree: edu.degree,
					field_of_study: edu.field_of_study,
					institution_name: edu.institution_name,
					start_date: edu.start_date,
					end_date: edu.end_date,
					is_current: edu.is_current,
				})
			) {
				summary.skipped.duplicates++;
				continue;
			}
			await client.query(
				`INSERT INTO portfolio_items
				  (user_id, type, source, title, degree, field_of_study, institution_name,
				   location, start_date, end_date, is_current, gpa, description,
				   document_s3_key, document_filename)
				 VALUES ($1,'education','upload',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
				[
					userId,
					edu.title,
					edu.degree ?? null,
					edu.field_of_study ?? null,
					edu.institution_name ?? null,
					edu.location ?? null,
					edu.start_date ?? null,
					edu.end_date ?? null,
					edu.is_current ?? false,
					edu.gpa ?? null,
					edu.description ?? edu.details?.join('\n') ?? null,
					doc.storage_key,
					doc.original_filename,
				],
			);
			summary.applied.education++;
		}

		for (const skill of approved.skills ?? []) {
			const skillName = skill.skill_name ?? skill.title;
			if (!skillName) {
				summary.skipped.invalid++;
				continue;
			}
			if (await portfolioDuplicateExists(client, userId, { type: 'skill', title: skill.title, skill_name: skillName })) {
				summary.skipped.duplicates++;
				continue;
			}
			await client.query(
				`INSERT INTO portfolio_items
				  (user_id, type, source, title, skill_name, domain_category,
				   document_s3_key, document_filename)
				 VALUES ($1,'skill','upload',$2,$3,$4,$5,$6)`,
				[userId, skillName, skillName, skill.domain_category ?? null, doc.storage_key, doc.original_filename],
			);
			summary.applied.skills++;
		}

		for (const proj of approved.projects ?? []) {
			if (
				!proj.title ||
				!isProjectTitleCandidate(proj.title, {
					hasProjectLink: Boolean(proj.project_url ?? proj.github_url ?? proj.live_url),
				})
			) {
				summary.skipped.invalid++;
				continue;
			}
			if (
				await portfolioDuplicateExists(client, userId, {
					type: 'project',
					title: proj.title,
					project_url: proj.project_url ?? proj.github_url ?? proj.live_url,
				})
			) {
				summary.skipped.duplicates++;
				continue;
			}
			await client.query(
				`INSERT INTO portfolio_items
				  (user_id, type, source, title, description, tech_stack, project_url,
				   start_date, end_date, achievements, impact_metrics,
				   document_s3_key, document_filename, extra)
				 VALUES ($1,'project','upload',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
				[
					userId,
					proj.title,
					proj.description ?? proj.bullets?.join('\n') ?? null,
					proj.tech_stack ?? [],
					proj.project_url ?? proj.github_url ?? proj.live_url ?? null,
					proj.start_date ?? null,
					proj.end_date ?? null,
					proj.achievements ?? null,
					proj.impact_metrics ?? null,
					doc.storage_key,
					doc.original_filename,
					JSON.stringify({
						resume_import_links: {
							github_url: proj.github_url ?? null,
							live_url: proj.live_url ?? null,
							links: proj.links ?? [],
						},
					}),
				],
			);
			summary.applied.projects++;
		}

		for (const paper of approved.researchPapers ?? []) {
			if (!paper.title) {
				summary.skipped.invalid++;
				continue;
			}
			const primaryUrl = paper.publicationUrl ?? paper.arxivUrl ?? (paper.doi ? `https://doi.org/${paper.doi}` : undefined);
			if (
				await portfolioDuplicateExists(client, userId, {
					type: 'research_paper',
					title: paper.title,
					year: paper.year,
					doi: paper.doi,
					arxivUrl: paper.arxivUrl,
					publicationUrl: paper.publicationUrl ?? primaryUrl,
				})
			) {
				summary.skipped.duplicates++;
				continue;
			}
			await client.query(
				`INSERT INTO portfolio_items
				  (user_id, type, source, title, description, tech_stack, project_url,
				   domain_category, document_s3_key, document_filename, extra)
				 VALUES ($1,'research_paper','upload',$2,$3,$4,$5,$6,$7,$8,$9)`,
				[
					userId,
					paper.title,
					paper.abstract ?? null,
					paper.keywords ?? [],
					primaryUrl ?? null,
					paper.publicationType ?? null,
					doc.storage_key,
					doc.original_filename,
					JSON.stringify({
						authors: paper.authors ?? [],
						venue: paper.venue ?? null,
						publisher: paper.publisher ?? null,
						year: paper.year ?? null,
						date: paper.date ?? null,
						doi: paper.doi ?? null,
						arxivUrl: paper.arxivUrl ?? null,
						publicationUrl: paper.publicationUrl ?? null,
						githubUrl: paper.githubUrl ?? null,
						keywords: paper.keywords ?? [],
						status: paper.status ?? 'unknown',
						confidence: paper._meta?.confidence ?? null,
						warnings: paper._meta?.warnings ?? [],
						sourceText: paper._meta?.sourceText ?? null,
						links: paper.links ?? [],
						source: 'resume_upload',
					}),
				],
			);
			summary.applied.researchPapers++;
		}

		for (const cert of approved.certifications ?? []) {
			if (!cert.title) {
				summary.skipped.invalid++;
				continue;
			}
			if (
				await portfolioDuplicateExists(client, userId, {
					type: 'certification',
					title: cert.title,
					issuing_org: cert.issuing_org,
					cert_url: cert.cert_url,
				})
			) {
				summary.skipped.duplicates++;
				continue;
			}
			await client.query(
				`INSERT INTO portfolio_items
				  (user_id, type, source, title, issuing_org, cert_url,
				   start_date, end_date, document_s3_key, document_filename)
				 VALUES ($1,'certification','upload',$2,$3,$4,$5,$6,$7,$8)`,
				[
					userId,
					cert.title,
					cert.issuing_org ?? null,
					cert.cert_url ?? null,
					cert.start_date ?? null,
					cert.end_date ?? null,
					doc.storage_key,
					doc.original_filename,
				],
			);
			summary.applied.certifications++;
		}

		await client.query(
			`UPDATE resume_documents
			    SET applied_at = NOW(),
			        apply_summary = $3,
			        updated_at = NOW()
			  WHERE id = $1 AND user_id = $2`,
			[docId, userId, JSON.stringify(summary)],
		);
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
	return summary;
};

export interface ResumeListItem {
	id: string;
	original_filename: string;
	mime_type: string;
	file_size: number;
	parsing_status: string;
	parser_version: string;
	parse_duration_ms: number | null;
	apply_summary: ApplySummary | null;
	version_number: number;
	is_active: boolean;
	created_at: Date;
	parsed_data: ParsedResumeData | null;
}

export const listResumeDocuments = async (userId: string): Promise<ResumeListItem[]> => {
	const result = await pool.query<ResumeListItem>(
		`SELECT id, original_filename, mime_type, file_size, parsing_status,
		        parser_version, parse_duration_ms, apply_summary,
		        version_number, is_active, created_at, parsed_data
		   FROM resume_documents
		  WHERE user_id = $1
		  ORDER BY created_at DESC`,
		[userId],
	);
	return result.rows;
};
