import { pool } from '../../db/client.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { getSignedUrl, deleteFile } from '../../services/storage.service.js';
import { generateVersionLabel } from '../../utils/version-label.js';
import type {
  ResumeVersionRow,
  GenerationJobRow,
  ResumeVersionStatus,
} from '../../types/resume.types.js';

const resumeVersionColumns = `
  id, user_id, job_target_id, generation_job_id,
  version_label, template_id, page_length,
  selected_item_ids, generated_content,
  ats_score, ats_feedback, pdf_s3_key, cover_letter_id,
  status, submitted_at, created_at, updated_at
`;

const assertOwner = (row: { user_id: string }, userId: string, label = 'Resource'): void => {
  if (row.user_id !== userId) {
    throw new ForbiddenError(`${label} does not belong to the current user`);
  }
};

const attachSignedUrl = async (
  version: ResumeVersionRow,
): Promise<ResumeVersionRow & { pdf_signed_url?: string }> => {
  if (!version.pdf_s3_key) return version;
  const pdf_signed_url = await getSignedUrl(version.pdf_s3_key);
  return { ...version, pdf_signed_url };
};

export const getGenerationJobStatus = async (
  userId: string,
  jobId: string,
): Promise<GenerationJobRow> => {
  const result = await pool.query<GenerationJobRow>(
    `SELECT id, user_id, job_target_id, status, current_stage,
            progress_percent, error_message, started_at, completed_at
     FROM resume_generation_jobs
     WHERE id = $1`,
    [jobId],
  );

  const job = result.rows[0];
  if (!job) throw new NotFoundError('Generation job not found');
  assertOwner(job, userId, 'Generation job');
  return job;
};

export const listResumeVersions = async (
  userId: string,
  query: { status?: ResumeVersionStatus; limit?: number; offset?: number },
): Promise<Array<ResumeVersionRow & { pdf_signed_url?: string }>> => {
  const conditions = ['user_id = $1'];
  const values: Array<string | number> = [userId];

  if (query.status) {
    values.push(query.status);
    conditions.push(`status = $${values.length}`);
  }

  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;
  values.push(limit, offset);

  const result = await pool.query<ResumeVersionRow>(
    `SELECT ${resumeVersionColumns}
     FROM resume_versions
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return Promise.all(result.rows.map(attachSignedUrl));
};

export const getResumeVersionById = async (
  userId: string,
  versionId: string,
): Promise<ResumeVersionRow & { pdf_signed_url?: string }> => {
  const result = await pool.query<ResumeVersionRow>(
    `SELECT ${resumeVersionColumns}
     FROM resume_versions
     WHERE id = $1`,
    [versionId],
  );

  const version = result.rows[0];
  if (!version) throw new NotFoundError('Resume version not found');
  assertOwner(version, userId, 'Resume version');
  return attachSignedUrl(version);
};

export const duplicateResumeVersion = async (
  userId: string,
  versionId: string,
): Promise<ResumeVersionRow & { pdf_signed_url?: string }> => {
  const original = await getResumeVersionById(userId, versionId);

  // Count existing versions for same job target to generate the next label
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM resume_versions
     WHERE user_id = $1 AND job_target_id = $2`,
    [userId, original.job_target_id],
  );
  const nextVersion = Number(countResult.rows[0]?.count ?? 0) + 1;

  // Derive job title and company from job_target for label generation
  let jobTitle = 'Job';
  let companyName = 'Company';
  if (original.job_target_id) {
    const jtResult = await pool.query<{ job_title: string; company_name: string }>(
      `SELECT job_title, company_name FROM job_targets WHERE id = $1`,
      [original.job_target_id],
    );
    const jt = jtResult.rows[0];
    if (jt) {
      jobTitle = jt.job_title;
      companyName = jt.company_name;
    }
  }

  const newLabel = generateVersionLabel(jobTitle, companyName, nextVersion);

  const result = await pool.query<ResumeVersionRow>(
    `INSERT INTO resume_versions (
       user_id, job_target_id, template_id, page_length, version_label,
       selected_item_ids, generated_content, ats_score, ats_feedback, pdf_s3_key, status
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft')
     RETURNING ${resumeVersionColumns}`,
    [
      userId,
      original.job_target_id,
      original.template_id,
      original.page_length,
      newLabel,
      original.selected_item_ids,
      JSON.stringify(original.generated_content),
      original.ats_score,
      JSON.stringify(original.ats_feedback),
      original.pdf_s3_key,
    ],
  );

  const created = result.rows[0]!;
  return attachSignedUrl(created);
};

export const updateResumeVersionStatus = async (
  userId: string,
  versionId: string,
  status: ResumeVersionStatus,
): Promise<ResumeVersionRow> => {
  const submittedAt = status === 'submitted' ? 'NOW()' : 'NULL';

  const result = await pool.query<ResumeVersionRow>(
    `UPDATE resume_versions
     SET status = $1, submitted_at = ${submittedAt}
     WHERE id = $2 AND user_id = $3
     RETURNING ${resumeVersionColumns}`,
    [status, versionId, userId],
  );

  const version = result.rows[0];
  if (!version) throw new NotFoundError('Resume version not found');
  return version;
};

export const deleteResumeVersion = async (
  userId: string,
  versionId: string,
): Promise<void> => {
  const result = await pool.query<ResumeVersionRow>(
    `DELETE FROM resume_versions
     WHERE id = $1 AND user_id = $2
     RETURNING id, pdf_s3_key, user_id`,
    [versionId, userId],
  );

  const deleted = result.rows[0];
  if (!deleted) throw new NotFoundError('Resume version not found');

  if (deleted.pdf_s3_key) {
    await deleteFile(deleted.pdf_s3_key).catch(() => {
      // S3 deletion failure should not block DB success
    });
  }
};
