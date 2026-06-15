import { pool } from '../../db/client.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import type {
  GenerationJobRow,
  GenerationJobStatus,
  ResumeVersionRow,
  ResumeVersionStatus,
  JobTargetRow,
  UserProfileRow,
  GeneratedResumeContent,
} from '../../types/resume.types.js';
import type { PortfolioItemRecord } from '../../types/ai.types.js';
import type { ATSFeedback } from '../../types/ai.types.js';
import type { GenerateResumeInput } from './resume.schema.js';

// ─── Job Targets ──────────────────────────────────────────────────────────────

export const createJobTarget = async (
  userId: string,
  input: Pick<GenerateResumeInput, 'jobTitle' | 'companyName' | 'jobDescription'>,
): Promise<JobTargetRow> => {
  const result = await pool.query<JobTargetRow>(
    `INSERT INTO job_targets (user_id, job_title, company_name, job_description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, input.jobTitle, input.companyName, input.jobDescription],
  );
  const row = result.rows[0];
  if (!row) throw new AppError('Failed to create job target', 500);
  return row;
};

export const updateJobTargetEntities = async (
  jobTargetId: string,
  extractedEntities: Record<string, unknown>,
): Promise<void> => {
  await pool.query(
    `UPDATE job_targets SET extracted_entities = $1 WHERE id = $2`,
    [JSON.stringify(extractedEntities), jobTargetId],
  );
};

// ─── Generation Jobs ──────────────────────────────────────────────────────────

export const createGenerationJob = async (
  userId: string,
  jobTargetId: string,
): Promise<GenerationJobRow> => {
  const result = await pool.query<GenerationJobRow>(
    `INSERT INTO resume_generation_jobs (user_id, job_target_id)
     VALUES ($1, $2)
     RETURNING *`,
    [userId, jobTargetId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError('Failed to create generation job', 500);
  return row;
};

export const updateGenerationJob = async (
  jobId: string,
  data: {
    status?: GenerationJobStatus;
    currentStage?: string;
    progressPercent?: number;
    errorMessage?: string | null;
    completedAt?: Date | null;
  },
): Promise<void> => {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.status !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(data.status);
  }
  if (data.currentStage !== undefined) {
    fields.push(`current_stage = $${idx++}`);
    values.push(data.currentStage);
  }
  if (data.progressPercent !== undefined) {
    fields.push(`progress_percent = $${idx++}`);
    values.push(data.progressPercent);
  }
  if (data.errorMessage !== undefined) {
    fields.push(`error_message = $${idx++}`);
    values.push(data.errorMessage);
  }
  if (data.completedAt !== undefined) {
    fields.push(`completed_at = $${idx++}`);
    values.push(data.completedAt);
  }

  if (fields.length === 0) return;

  values.push(jobId);
  await pool.query(
    `UPDATE resume_generation_jobs SET ${fields.join(', ')} WHERE id = $${idx}`,
    values,
  );
};

export const getGenerationJob = async (
  userId: string,
  jobId: string,
): Promise<GenerationJobRow> => {
  const result = await pool.query<GenerationJobRow>(
    `SELECT * FROM resume_generation_jobs WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [jobId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Generation job not found');
  return row;
};

// ─── User Profile ─────────────────────────────────────────────────────────────

export const fetchUserProfile = async (userId: string): Promise<UserProfileRow> => {
  const result = await pool.query<UserProfileRow>(
    `SELECT id, full_name, email, university, graduation_year, target_role_category, career_goal
     FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('User not found');
  return row;
};

// ─── Portfolio Items ──────────────────────────────────────────────────────────

export const fetchPortfolioItems = async (userId: string): Promise<PortfolioItemRecord[]> => {
  const result = await pool.query<PortfolioItemRecord>(
    `SELECT id, user_id, type, source, title, description, start_date, end_date, is_current,
            tech_stack, project_url, impact_metrics, domain_category, company_name,
            employment_type, location, degree, field_of_study, institution_name, gpa,
            achievements, issuing_org, cert_url, expiry_date, no_expiry, skill_name,
            document_s3_key, document_filename, validation_score, extra, created_at, updated_at
     FROM portfolio_items
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows;
};

export const fetchPortfolioItemsByIds = async (itemIds: string[]): Promise<PortfolioItemRecord[]> => {
  if (itemIds.length === 0) return [];
  const result = await pool.query<PortfolioItemRecord>(
    `SELECT id, user_id, type, source, title, description, start_date, end_date, is_current,
            tech_stack, project_url, impact_metrics, domain_category, company_name,
            employment_type, location, degree, field_of_study, institution_name, gpa,
            achievements, issuing_org, cert_url, expiry_date, no_expiry, skill_name,
            document_s3_key, document_filename, validation_score, extra, created_at, updated_at
     FROM portfolio_items
     WHERE id = ANY($1::uuid[])`,
    [itemIds],
  );
  return result.rows;
};

// ─── Resume Versions ──────────────────────────────────────────────────────────

export const countUserResumeVersions = async (userId: string): Promise<number> => {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM resume_versions WHERE user_id = $1`,
    [userId],
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
};

export const createResumeVersion = async (data: {
  userId: string;
  jobTargetId: string;
  generationJobId: string;
  versionLabel: string;
  templateId: string;
  pageLength: string;
  selectedItemIds: string[];
  generatedContent: GeneratedResumeContent;
  atsScore: number;
  atsFeedback: ATSFeedback;
  pdfS3Key: string;
}): Promise<ResumeVersionRow> => {
  const result = await pool.query<ResumeVersionRow>(
    `INSERT INTO resume_versions
       (user_id, job_target_id, generation_job_id, version_label, template_id, page_length,
        selected_item_ids, generated_content, ats_score, ats_feedback, pdf_s3_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      data.userId,
      data.jobTargetId,
      data.generationJobId,
      data.versionLabel,
      data.templateId,
      data.pageLength,
      data.selectedItemIds,
      JSON.stringify(data.generatedContent),
      data.atsScore,
      JSON.stringify(data.atsFeedback),
      data.pdfS3Key,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new AppError('Failed to create resume version', 500);
  return row;
};

export const listResumeVersions = async (userId: string): Promise<ResumeVersionRow[]> => {
  const result = await pool.query<ResumeVersionRow>(
    `SELECT * FROM resume_versions WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows;
};

export const getResumeVersion = async (
  userId: string,
  versionId: string,
): Promise<ResumeVersionRow> => {
  const result = await pool.query<ResumeVersionRow>(
    `SELECT * FROM resume_versions WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [versionId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Resume version not found');
  return row;
};

export const updateResumeVersionStatus = async (
  userId: string,
  versionId: string,
  status: ResumeVersionStatus,
): Promise<ResumeVersionRow> => {
  const submittedAt = status === 'submitted' ? new Date() : null;
  const result = await pool.query<ResumeVersionRow>(
    `UPDATE resume_versions
     SET status = $1, submitted_at = COALESCE($2, submitted_at)
     WHERE id = $3 AND user_id = $4
     RETURNING *`,
    [status, submittedAt, versionId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Resume version not found');
  return row;
};

export const deleteResumeVersion = async (userId: string, versionId: string): Promise<void> => {
  const result = await pool.query<{ id: string }>(
    `DELETE FROM resume_versions WHERE id = $1 AND user_id = $2 RETURNING id`,
    [versionId, userId],
  );
  if (!result.rows[0]) throw new NotFoundError('Resume version not found');
};
