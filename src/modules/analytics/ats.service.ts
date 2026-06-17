import { pool } from '../../db/client.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import type { ATSResult } from '../../types/ai.types.js';

export interface AtsVersionResult {
  resumeVersionId: string;
  versionLabel: string | null;
  atsScore: number | null;
  atsFeedback: ATSResult | null;
  jobTitle: string | null;
  companyName: string | null;
  generatedAt: Date;
}

export const getAtsResultForVersion = async (
  userId: string,
  resumeVersionId: string,
): Promise<AtsVersionResult> => {
  const result = await pool.query<{
    id: string;
    user_id: string;
    version_label: string | null;
    ats_score: string | null;
    ats_feedback: ATSResult | null;
    created_at: Date;
    job_title: string | null;
    company_name: string | null;
  }>(
    `SELECT rv.id, rv.user_id, rv.version_label, rv.ats_score,
            rv.ats_feedback, rv.created_at,
            jt.job_title, jt.company_name
     FROM resume_versions rv
     LEFT JOIN job_targets jt ON jt.id = rv.job_target_id
     WHERE rv.id = $1`,
    [resumeVersionId],
  );

  const row = result.rows[0];
  if (!row) throw new NotFoundError('Resume version not found');
  if (row.user_id !== userId) throw new ForbiddenError('Resume version does not belong to the current user');

  return {
    resumeVersionId: row.id,
    versionLabel: row.version_label,
    atsScore: row.ats_score !== null ? Number(row.ats_score) : null,
    atsFeedback: row.ats_feedback,
    jobTitle: row.job_title,
    companyName: row.company_name,
    generatedAt: row.created_at,
  };
};
