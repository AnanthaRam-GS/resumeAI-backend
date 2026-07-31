import { pool } from '../../db/client.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { trackEvent } from '../../services/analytics-events.service.js';
import type { ApplicationBody, ApplicationQuery, ApplicationUpdate } from './applications.schema.js';

const applicationColumns = `
  id, user_id, company, role, source_url, job_target_id, resume_version_id,
  status, application_date, notes, follow_up_date, created_at, updated_at
`;

const assertLinkedOwner = async (
  userId: string,
  jobTargetId?: string | null,
  resumeVersionId?: string | null,
): Promise<void> => {
  if (jobTargetId) {
    const result = await pool.query(`SELECT id FROM job_targets WHERE id = $1 AND user_id = $2`, [jobTargetId, userId]);
    if (!result.rows[0]) throw new ForbiddenError('Job target does not belong to the current user');
  }
  if (resumeVersionId) {
    const result = await pool.query(`SELECT id FROM resume_versions WHERE id = $1 AND user_id = $2`, [resumeVersionId, userId]);
    if (!result.rows[0]) throw new ForbiddenError('Resume version does not belong to the current user');
  }
};

export const createApplication = async (userId: string, input: ApplicationBody) => {
  await assertLinkedOwner(userId, input.job_target_id, input.resume_version_id);
  const result = await pool.query(
    `INSERT INTO applications (
       user_id, company, role, source_url, job_target_id, resume_version_id,
       status, application_date, notes, follow_up_date
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING ${applicationColumns}`,
    [
      userId,
      input.company,
      input.role,
      input.source_url ?? null,
      input.job_target_id ?? null,
      input.resume_version_id ?? null,
      input.status ?? 'saved',
      input.application_date ?? null,
      input.notes ?? null,
      input.follow_up_date ?? null,
    ],
  );
  await trackEvent(userId, 'application_status_changed', { status: input.status ?? 'saved' });
  return result.rows[0];
};

export const listApplications = async (userId: string, query: ApplicationQuery) => {
  const values: Array<string | number> = [userId];
  const conditions = ['user_id = $1'];
  if (query.status) {
    values.push(query.status);
    conditions.push(`status = $${values.length}`);
  }
  values.push(query.limit ?? 50, query.offset ?? 0);
  const result = await pool.query(
    `SELECT ${applicationColumns}
     FROM applications
     WHERE ${conditions.join(' AND ')}
     ORDER BY COALESCE(follow_up_date, application_date, created_at::date) DESC NULLS LAST, created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return result.rows;
};

export const getApplication = async (userId: string, id: string) => {
  const result = await pool.query(
    `SELECT ${applicationColumns} FROM applications WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Application not found');
  return row;
};

export const updateApplication = async (userId: string, id: string, input: ApplicationUpdate) => {
  await assertLinkedOwner(userId, input.job_target_id, input.resume_version_id);
  const entries = Object.entries(input);
  const setClause = entries.map(([key], index) => `${key} = $${index + 3}`).join(', ');
  const values = [id, userId, ...entries.map(([, value]) => value ?? null)];
  const result = await pool.query(
    `UPDATE applications
     SET ${setClause}
     WHERE id = $1 AND user_id = $2
     RETURNING ${applicationColumns}`,
    values,
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Application not found');
  if (input.status) await trackEvent(userId, 'application_status_changed', { status: input.status });
  return row;
};

export const deleteApplication = async (userId: string, id: string): Promise<void> => {
  const result = await pool.query(`DELETE FROM applications WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (result.rowCount === 0) throw new NotFoundError('Application not found');
};

