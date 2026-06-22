import { pool } from '../../db/client.js';
import { ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { getSignedUrl, deleteFile, uploadFile } from '../../services/storage.service.js';
import { renderHtmlToPdfBuffer } from '../../services/pdf-renderer.service.js';
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

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const renderList = (items: unknown): string => {
  if (!Array.isArray(items)) return '';
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
};

const buildExportHtml = (args: {
  content: Record<string, unknown>;
  fullName: string;
  email: string;
  jobTitle?: string | null;
  companyName?: string | null;
}): string => {
  const { content } = args;
  const experience = Array.isArray(content.experience) ? content.experience as Array<Record<string, unknown>> : [];
  const projects = Array.isArray(content.projects) ? content.projects as Array<Record<string, unknown>> : [];
  const education = Array.isArray(content.education) ? content.education as Array<Record<string, unknown>> : [];
  const certifications = Array.isArray(content.certifications) ? content.certifications as Array<Record<string, unknown>> : [];
  const skills = content.skills && typeof content.skills === 'object' && !Array.isArray(content.skills)
    ? content.skills as Record<string, unknown>
    : {};

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 10.5pt; color: #1a1a1a; line-height: 1.45; padding: 16mm 14mm; }
    header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
    h1 { font-family: Georgia, serif; font-size: 21pt; margin: 0; }
    h2 { font-size: 9.5pt; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin: 13px 0 7px; }
    .meta { color: #555; margin-top: 3px; }
    .entry { margin-bottom: 9px; }
    .entry-head { display: flex; justify-content: space-between; gap: 16px; font-weight: 700; }
    .muted { color: #666; font-style: italic; font-weight: 400; }
    ul { margin: 4px 0 0; padding-left: 16px; }
    li { margin-bottom: 2px; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(args.fullName)}</h1>
    <div class="meta">${escapeHtml(args.email)}${args.jobTitle ? ` · Tailored for ${escapeHtml(args.jobTitle)}${args.companyName ? ` at ${escapeHtml(args.companyName)}` : ''}` : ''}</div>
  </header>
  ${content.summary ? `<section><h2>Summary</h2><p>${escapeHtml(content.summary)}</p></section>` : ''}
  ${experience.length ? `<section><h2>Experience</h2>${experience.map((item) => `<div class="entry"><div class="entry-head"><span>${escapeHtml(item.role)}${item.company ? ` · ${escapeHtml(item.company)}` : ''}</span><span class="muted">${escapeHtml(item.period)}</span></div>${renderList(item.bullets)}</div>`).join('')}</section>` : ''}
  ${projects.length ? `<section><h2>Projects</h2>${projects.map((item) => `<div class="entry"><div class="entry-head"><span>${escapeHtml(item.name)}</span><span class="muted">${Array.isArray(item.tech_stack) ? (item.tech_stack as unknown[]).map(escapeHtml).join(' · ') : ''}</span></div>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}${renderList(item.bullets)}</div>`).join('')}</section>` : ''}
  ${Object.keys(skills).length ? `<section><h2>Skills</h2>${Object.entries(skills).map(([key, value]) => `<p><strong>${escapeHtml(key)}:</strong> ${Array.isArray(value) ? value.map(escapeHtml).join(', ') : escapeHtml(value)}</p>`).join('')}</section>` : ''}
  ${education.length ? `<section><h2>Education</h2>${education.map((item) => `<div class="entry"><div class="entry-head"><span>${escapeHtml(item.degree)}</span><span class="muted">${escapeHtml(item.period)}</span></div><div>${escapeHtml(item.institution)}${item.gpa ? ` · GPA: ${escapeHtml(item.gpa)}` : ''}</div></div>`).join('')}</section>` : ''}
  ${certifications.length ? `<section><h2>Certifications</h2>${certifications.map((item) => `<p><strong>${escapeHtml(item.name)}</strong>${item.issuer ? ` · ${escapeHtml(item.issuer)}` : ''}${item.date ? ` (${escapeHtml(item.date)})` : ''}</p>`).join('')}</section>` : ''}
</body>
</html>`;
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
): Promise<Array<ResumeVersionRow & { pdf_signed_url?: string; role?: string; updated?: string }>> => {
  const conditions = ['rv.user_id = $1'];
  const values: Array<string | number> = [userId];

  if (query.status) {
    values.push(query.status);
    conditions.push(`rv.status = $${values.length}`);
  }

  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;
  values.push(limit, offset);

  const result = await pool.query<ResumeVersionRow & { role?: string; updated?: string }>(
    `SELECT rv.id, rv.user_id, rv.job_target_id, rv.generation_job_id,
            rv.version_label, rv.template_id, rv.page_length,
            rv.selected_item_ids, rv.generated_content,
            rv.ats_score, rv.ats_feedback, rv.pdf_s3_key, rv.cover_letter_id,
            rv.status, rv.submitted_at, rv.created_at, rv.updated_at,
            jt.job_title AS role,
            rv.updated_at::text AS updated
     FROM resume_versions rv
     LEFT JOIN job_targets jt ON jt.id = rv.job_target_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY rv.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return Promise.all(result.rows.map(attachSignedUrl));
};

export const getResumeVersionById = async (
  userId: string,
  versionId: string,
): Promise<ResumeVersionRow & { pdf_signed_url?: string; job_title?: string; company_name?: string }> => {
  const result = await pool.query<ResumeVersionRow & { job_title?: string; company_name?: string }>(
    `SELECT rv.id, rv.user_id, rv.job_target_id, rv.generation_job_id,
            rv.version_label, rv.template_id, rv.page_length,
            rv.selected_item_ids, rv.generated_content,
            rv.ats_score, rv.ats_feedback, rv.pdf_s3_key, rv.cover_letter_id,
            rv.status, rv.submitted_at, rv.created_at, rv.updated_at,
            jt.job_title, jt.company_name
     FROM resume_versions rv
     LEFT JOIN job_targets jt ON jt.id = rv.job_target_id
     WHERE rv.id = $1`,
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

export const updateResumeContent = async (
  userId: string,
  versionId: string,
  generatedContent: unknown,
): Promise<ResumeVersionRow> => {
  const result = await pool.query<ResumeVersionRow>(
    `UPDATE resume_versions
     SET generated_content = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING ${resumeVersionColumns}`,
    [JSON.stringify(generatedContent), versionId, userId],
  );

  const version = result.rows[0];
  if (!version) throw new NotFoundError('Resume version not found');
  return version;
};

export const exportResumeVersionPdf = async (
  userId: string,
  versionId: string,
): Promise<{ url: string }> => {
  const version = await getResumeVersionById(userId, versionId);
  if (version.pdf_s3_key) {
    return { url: await getSignedUrl(version.pdf_s3_key) };
  }

  const userResult = await pool.query<{ full_name: string; email: string }>(
    `SELECT full_name, email FROM users WHERE id = $1`,
    [userId],
  );
  const user = userResult.rows[0];
  if (!user) throw new NotFoundError('User not found');

  const html = buildExportHtml({
    content: version.generated_content,
    fullName: user.full_name,
    email: user.email,
    jobTitle: version.job_title,
    companyName: version.company_name,
  });
  const pdfBuffer = await renderHtmlToPdfBuffer(html, { format: 'A4', printBackground: true });
  const key = `users/${userId}/resumes/export-${versionId}.pdf`;
  await uploadFile(key, pdfBuffer, 'application/pdf');
  await pool.query(
    `UPDATE resume_versions SET pdf_s3_key = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
    [key, versionId, userId],
  );

  return { url: await getSignedUrl(key) };
};

export const saveEditorHtml = async (
  userId: string,
  versionId: string,
  html: string,
): Promise<{ id: string; editor_updated_at: string }> => {
  const result = await pool.query<{ id: string; editor_updated_at: string }>(
    `UPDATE resume_versions
     SET editor_html = $1, editor_updated_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING id, editor_updated_at`,
    [html, versionId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Resume version not found');
  return row;
};

export const renderAndStorePdf = async (
  userId: string,
  versionId: string,
  html: string,
): Promise<{ url: string }> => {
  const exists = await pool.query<{ id: string }>(
    `SELECT id FROM resume_versions WHERE id = $1 AND user_id = $2`,
    [versionId, userId],
  );
  if (!exists.rows[0]) throw new NotFoundError('Resume version not found');

  const pdfBuffer = await renderHtmlToPdfBuffer(html, { format: 'A4', printBackground: true });
  const key = `users/${userId}/resumes/editor-${versionId}.pdf`;
  await uploadFile(key, pdfBuffer, 'application/pdf');

  await pool.query(
    `UPDATE resume_versions SET pdf_s3_key = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
    [key, versionId, userId],
  );

  const url = await getSignedUrl(key);
  return { url };
};

export const getEditorHtml = async (
  userId: string,
  versionId: string,
): Promise<{ editor_html: string | null }> => {
  const result = await pool.query<{ editor_html: string | null; user_id: string }>(
    `SELECT editor_html, user_id FROM resume_versions WHERE id = $1`,
    [versionId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Resume version not found');
  assertOwner(row, userId, 'Resume version');
  return { editor_html: row.editor_html };
};
