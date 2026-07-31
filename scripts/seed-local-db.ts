import bcrypt from 'bcrypt';
import { env } from '../src/config/env.js';
import { pool } from '../src/db/client.js';

const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'Password123!';
const SEED_EMAIL = process.env.SEED_USER_EMAIL ?? 'student@example.com';

const IDS = {
	user: '11111111-1111-4111-8111-111111111111',
	project: '22222222-2222-4222-8222-222222222222',
	experience: '33333333-3333-4333-8333-333333333333',
	skill: '44444444-4444-4444-8444-444444444444',
	jobTarget: '55555555-5555-4555-8555-555555555555',
	generationJob: '66666666-6666-4666-8666-666666666666',
	resumeVersion: '77777777-7777-4777-8777-777777777777',
	coverLetter: '88888888-8888-4888-8888-888888888888',
	application: '99999999-9999-4999-8999-999999999999',
} as const;

const requireLocalSeedTarget = () => {
	if (env.USE_SUPABASE && !process.argv.includes('--allow-supabase')) {
		throw new Error(
			'Refusing to seed Supabase. Set USE_SUPABASE=false or rerun with --allow-supabase if this is intentional.',
		);
	}
};

const seed = async () => {
	requireLocalSeedTarget();

	const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
	const client = await pool.connect();

	try {
		await client.query('BEGIN');

		const userResult = await client.query<{ id: string }>(
			`
			INSERT INTO users (
				id,
				full_name,
				email,
				password_hash,
				university,
				graduation_year,
				target_role_category,
				career_goal,
				phone_number,
				linkedin_url,
				github_url,
				portfolio_url,
				location,
				onboarding_step,
				onboarding_complete,
				writing_style
			)
			VALUES (
				$1,
				'Student User',
				$2,
				$3,
				'State University',
				2026,
				'Software Engineering',
				'Land an entry-level full-stack engineering role focused on product development.',
				'+1 555 0100',
				'https://www.linkedin.com/in/student-user',
				'https://github.com/student-user',
				'https://student.example.com',
				'San Francisco, CA',
				4,
				true,
				'professional'
			)
			ON CONFLICT (email) DO UPDATE SET
				full_name = EXCLUDED.full_name,
				password_hash = EXCLUDED.password_hash,
				university = EXCLUDED.university,
				graduation_year = EXCLUDED.graduation_year,
				target_role_category = EXCLUDED.target_role_category,
				career_goal = EXCLUDED.career_goal,
				phone_number = EXCLUDED.phone_number,
				linkedin_url = EXCLUDED.linkedin_url,
				github_url = EXCLUDED.github_url,
				portfolio_url = EXCLUDED.portfolio_url,
				location = EXCLUDED.location,
				onboarding_step = EXCLUDED.onboarding_step,
				onboarding_complete = EXCLUDED.onboarding_complete,
				writing_style = EXCLUDED.writing_style
			RETURNING id
			`,
			[IDS.user, SEED_EMAIL.trim().toLowerCase(), passwordHash],
		);
		const userId = userResult.rows[0]?.id;
		if (!userId) {
			throw new Error('Seed user was not created');
		}

		await client.query(
			`
			INSERT INTO portfolio_items (
				id,
				user_id,
				type,
				source,
				title,
				description,
				start_date,
				end_date,
				tech_stack,
				project_url,
				impact_metrics,
				domain_category,
				extra,
				embedding_status
			)
			VALUES (
				$1,
				$2,
				'project',
				'manual',
				'Campus Job Tracker',
				'Built a full-stack job application tracker with saved searches, status analytics, and resume version links.',
				'2025-01-01',
				'2025-05-31',
				$3,
				'https://github.com/student-user/campus-job-tracker',
				'Tracked 120 applications and reduced manual follow-up work by 40%.',
				'Web Application',
				$4::jsonb,
				'skipped'
			)
			ON CONFLICT (id) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				title = EXCLUDED.title,
				description = EXCLUDED.description,
				tech_stack = EXCLUDED.tech_stack,
				project_url = EXCLUDED.project_url,
				impact_metrics = EXCLUDED.impact_metrics,
				domain_category = EXCLUDED.domain_category,
				extra = EXCLUDED.extra,
				embedding_status = EXCLUDED.embedding_status
			`,
			[
				IDS.project,
				userId,
				['React', 'Node.js', 'PostgreSQL', 'TypeScript'],
				JSON.stringify({ role: 'Solo developer', highlights: ['REST API', 'responsive UI'] }),
			],
		);

		await client.query(
			`
			INSERT INTO portfolio_items (
				id,
				user_id,
				type,
				source,
				title,
				description,
				start_date,
				end_date,
				company_name,
				employment_type,
				location,
				achievements,
				embedding_status
			)
			VALUES (
				$1,
				$2,
				'experience',
				'manual',
				'Software Engineering Intern',
				'Implemented dashboard components and backend endpoints for an internal operations product.',
				'2025-06-01',
				'2025-08-31',
				'Acme Labs',
				'internship',
				'Remote',
				'Improved dashboard load time by 25% and added endpoint-level tests for critical flows.',
				'skipped'
			)
			ON CONFLICT (id) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				title = EXCLUDED.title,
				description = EXCLUDED.description,
				company_name = EXCLUDED.company_name,
				employment_type = EXCLUDED.employment_type,
				location = EXCLUDED.location,
				achievements = EXCLUDED.achievements,
				embedding_status = EXCLUDED.embedding_status
			`,
			[IDS.experience, userId],
		);

		await client.query(
			`
			INSERT INTO portfolio_items (
				id,
				user_id,
				type,
				source,
				title,
				skill_name,
				description,
				tech_stack,
				embedding_status
			)
			VALUES (
				$1,
				$2,
				'skill',
				'manual',
				'TypeScript and API Development',
				'TypeScript',
				'Comfortable building typed REST APIs, validation schemas, tests, and PostgreSQL-backed services.',
				$3,
				'skipped'
			)
			ON CONFLICT (id) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				title = EXCLUDED.title,
				skill_name = EXCLUDED.skill_name,
				description = EXCLUDED.description,
				tech_stack = EXCLUDED.tech_stack,
				embedding_status = EXCLUDED.embedding_status
			`,
			[IDS.skill, userId, ['TypeScript', 'Fastify', 'Zod', 'PostgreSQL']],
		);

		await client.query(
			`
			INSERT INTO job_targets (
				id,
				user_id,
				job_title,
				company_name,
				job_description,
				source_url,
				ingested_via,
				source_platform,
				location,
				metadata,
				embedding_status,
				output_language
			)
			VALUES (
				$1,
				$2,
				'Junior Full-Stack Engineer',
				'Northstar Software',
				'Build React and Node.js product features, write tests, collaborate with design, and work with PostgreSQL-backed services.',
				'https://jobs.example.com/northstar-junior-full-stack-engineer',
				'manual',
				'seed',
				'Remote',
				$3::jsonb,
				'skipped',
				'en'
			)
			ON CONFLICT (id) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				job_title = EXCLUDED.job_title,
				company_name = EXCLUDED.company_name,
				job_description = EXCLUDED.job_description,
				source_url = EXCLUDED.source_url,
				source_platform = EXCLUDED.source_platform,
				location = EXCLUDED.location,
				metadata = EXCLUDED.metadata,
				embedding_status = EXCLUDED.embedding_status,
				output_language = EXCLUDED.output_language
			`,
			[IDS.jobTarget, userId, JSON.stringify({ seniority: 'entry-level', remote: true })],
		);

		await client.query(
			`
			INSERT INTO resume_generation_jobs (
				id,
				user_id,
				job_target_id,
				status,
				current_stage,
				progress_percent,
				completed_at
			)
			VALUES ($1, $2, $3, 'completed', 'completed', 100, NOW())
			ON CONFLICT (id) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				job_target_id = EXCLUDED.job_target_id,
				status = EXCLUDED.status,
				current_stage = EXCLUDED.current_stage,
				progress_percent = EXCLUDED.progress_percent,
				completed_at = EXCLUDED.completed_at
			`,
			[IDS.generationJob, userId, IDS.jobTarget],
		);

		await client.query(
			`
			INSERT INTO resume_versions (
				id,
				user_id,
				job_target_id,
				generation_job_id,
				version_label,
				template_id,
				page_length,
				selected_item_ids,
				generated_content,
				ats_score,
				ats_feedback,
				status,
				output_language
			)
			VALUES ($1, $2, $3, $4, 'Seed Resume', 'classic', '1-page', $5, $6::jsonb, 86.50, $7::jsonb, 'draft', 'en')
			ON CONFLICT (id) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				job_target_id = EXCLUDED.job_target_id,
				generation_job_id = EXCLUDED.generation_job_id,
				version_label = EXCLUDED.version_label,
				template_id = EXCLUDED.template_id,
				page_length = EXCLUDED.page_length,
				selected_item_ids = EXCLUDED.selected_item_ids,
				generated_content = EXCLUDED.generated_content,
				ats_score = EXCLUDED.ats_score,
				ats_feedback = EXCLUDED.ats_feedback,
				status = EXCLUDED.status,
				output_language = EXCLUDED.output_language
			`,
			[
				IDS.resumeVersion,
				userId,
				IDS.jobTarget,
				IDS.generationJob,
				[IDS.project, IDS.experience, IDS.skill],
				JSON.stringify({
					summary: 'Full-stack engineering candidate with product-focused project and internship experience.',
					skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
				}),
				JSON.stringify({ strengths: ['Relevant stack match', 'Measured impact'], gaps: ['Add more testing examples'] }),
			],
		);

		await client.query(
			`
			INSERT INTO cover_letters (
				id,
				user_id,
				resume_version_id,
				why_company,
				tone,
				highlight_note,
				content_text
			)
			VALUES (
				$1,
				$2,
				$3,
				'Northstar Software builds product tools similar to my strongest projects.',
				'balanced',
				'Emphasize full-stack project ownership and internship impact.',
				'Dear Hiring Team, I am excited to apply for the Junior Full-Stack Engineer role...'
			)
			ON CONFLICT (id) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				resume_version_id = EXCLUDED.resume_version_id,
				why_company = EXCLUDED.why_company,
				tone = EXCLUDED.tone,
				highlight_note = EXCLUDED.highlight_note,
				content_text = EXCLUDED.content_text
			`,
			[IDS.coverLetter, userId, IDS.resumeVersion],
		);

		await client.query(
			`UPDATE resume_versions SET cover_letter_id = $1 WHERE id = $2`,
			[IDS.coverLetter, IDS.resumeVersion],
		);

		await client.query(
			`
			INSERT INTO gap_analyses (
				user_id,
				career_goal,
				missing_skills,
				suggested_projects,
				learning_resources,
				analysis_mode,
				overall_assessment,
				evidence_data,
				portfolio_snapshot
			)
			VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, 'career_goal', $6, $7::jsonb, $8::jsonb)
			ON CONFLICT (user_id) DO UPDATE SET
				career_goal = EXCLUDED.career_goal,
				missing_skills = EXCLUDED.missing_skills,
				suggested_projects = EXCLUDED.suggested_projects,
				learning_resources = EXCLUDED.learning_resources,
				analysis_mode = EXCLUDED.analysis_mode,
				overall_assessment = EXCLUDED.overall_assessment,
				evidence_data = EXCLUDED.evidence_data,
				portfolio_snapshot = EXCLUDED.portfolio_snapshot
			`,
			[
				userId,
				'Land an entry-level full-stack engineering role focused on product development.',
				JSON.stringify(['CI/CD', 'system design basics']),
				JSON.stringify(['Add deployment pipeline documentation to Campus Job Tracker']),
				JSON.stringify([{ title: 'PostgreSQL indexing guide', url: 'https://www.postgresql.org/docs/current/indexes.html' }]),
				'Strong project alignment with room to add deployment and production operations evidence.',
				JSON.stringify([{ source: 'portfolio', itemId: IDS.project, signal: 'Full-stack project' }]),
				JSON.stringify({ itemCount: 3, strongestStack: ['TypeScript', 'React', 'PostgreSQL'] }),
			],
		);

		await client.query(
			`
			INSERT INTO subscriptions (user_id, tier, status)
			VALUES ($1, 'starter', 'inactive')
			ON CONFLICT (user_id) DO UPDATE SET
				tier = EXCLUDED.tier,
				status = EXCLUDED.status
			`,
			[userId],
		);

		await client.query(
			`
			INSERT INTO applications (
				id,
				user_id,
				company,
				role,
				source_url,
				job_target_id,
				resume_version_id,
				status,
				application_date,
				notes,
				follow_up_date
			)
			VALUES ($1, $2, 'Northstar Software', 'Junior Full-Stack Engineer', $3, $4, $5, 'preparing', CURRENT_DATE, $6, CURRENT_DATE + INTERVAL '7 days')
			ON CONFLICT (id) DO UPDATE SET
				user_id = EXCLUDED.user_id,
				company = EXCLUDED.company,
				role = EXCLUDED.role,
				source_url = EXCLUDED.source_url,
				job_target_id = EXCLUDED.job_target_id,
				resume_version_id = EXCLUDED.resume_version_id,
				status = EXCLUDED.status,
				application_date = EXCLUDED.application_date,
				notes = EXCLUDED.notes,
				follow_up_date = EXCLUDED.follow_up_date
			`,
			[
				IDS.application,
				userId,
				'https://jobs.example.com/northstar-junior-full-stack-engineer',
				IDS.jobTarget,
				IDS.resumeVersion,
				'Seed application for local development workflows.',
			],
		);

		await client.query(
			`
			INSERT INTO ats_benchmark_aggregates (role_category, score_bucket, sample_count, average_score)
			VALUES
				('Software Engineering', 80, 42, 84.25),
				('Software Engineering', 90, 18, 91.10)
			ON CONFLICT (role_category, score_bucket) DO UPDATE SET
				sample_count = EXCLUDED.sample_count,
				average_score = EXCLUDED.average_score,
				updated_at = NOW()
			`,
		);

		await client.query('COMMIT');

		console.log(`Seed complete for ${env.DATABASE_PROVIDER} database.`);
		console.log(`Login: ${SEED_EMAIL} / ${SEED_PASSWORD}`);
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
		await pool.end();
	}
};

void seed().catch((error: unknown) => {
	console.error('Database seed failed', error);
	process.exit(1);
});
