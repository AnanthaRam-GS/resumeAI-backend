import { pool } from '../../db/client.js';
import { analyzeJobDescription } from '../ai/jd-analyzer.service.js';
import { listPortfolioItems } from '../portfolio/portfolio.service.js';
import { getProfile } from '../profile/profile.service.js';
import { scorePortfolioItems } from '../ai/portfolio-scorer.service.js';
import { selectPortfolioItems } from '../ai/item-selector.service.js';
import { requestNimJson } from '../../services/nvidia-nim.service.js';
import { renderHtmlToPdfBuffer } from '../../services/pdf-renderer.service.js';
import { uploadFile } from '../../services/storage.service.js';
import { scoreAtsMatch } from '../../services/ats-scorer.service.js';
import { resumeGenerationPrompt } from '../ai/prompts/resume-generation.prompt.js';
import { generateVersionLabel } from '../../utils/version-label.js';
import { ValidationError } from '../../utils/errors.js';
import type { SelectedItem } from '../../types/ai.types.js';

type UserContact = {
  full_name: string;
  email: string;
  phone_number?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  location?: string | null;
};

type GenerateResumeInput = {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  templateId?: string;
  pageLength?: string;
};

type GeneratedResumeContent = {
  summary?: string;
  experience?: Array<{
    company?: string;
    role?: string;
    period?: string;
    bullets?: string[];
  }>;
  projects?: Array<{
    name?: string;
    description?: string;
    tech_stack?: string[];
    bullets?: string[];
  }>;
  skills?: Record<string, string[]>;
  education?: Array<{
    institution?: string;
    degree?: string;
    period?: string;
    gpa?: string;
  }>;
  certifications?: Array<{
    name?: string;
    issuer?: string;
    date?: string;
  }>;
};

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const renderBulletList = (bullets?: string[]): string =>
  `<ul>${(bullets ?? []).map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>`;

const updateJobStatus = async (
  jobId: string,
  status: string,
  stage: string,
  percent: number,
): Promise<void> => {
  await pool.query(
    `UPDATE resume_generation_jobs
     SET status = $1, current_stage = $2, progress_percent = $3
     WHERE id = $4`,
    [status, stage, percent, jobId],
  );
};

const buildResumeHtml = (
  content: GeneratedResumeContent,
  jobTitle: string,
  companyName: string,
  selected: SelectedItem[],
  contact?: UserContact,
): string => {
  const skillRows = Object.entries(content.skills ?? {})
    .map(([category, skills]) =>
      `<tr><td class="skill-cat">${escapeHtml(category)}</td><td>${skills.map(escapeHtml).join(', ')}</td></tr>`,
    )
    .join('');

  const experienceHtml = (content.experience ?? [])
    .map(
      (exp) => `
      <div class="entry">
        <div class="entry-header">
          <span class="entry-title">${escapeHtml(exp.role)}</span>
          <span class="entry-period">${escapeHtml(exp.period)}</span>
        </div>
        <div class="entry-org">${escapeHtml(exp.company)}</div>
        ${renderBulletList(exp.bullets)}
      </div>`,
    )
    .join('');

  const projectsHtml = (content.projects ?? [])
    .map(
      (proj) => `
      <div class="entry">
        <div class="entry-header">
          <span class="entry-title">${escapeHtml(proj.name)}</span>
          <span class="entry-tech">${(proj.tech_stack ?? []).map(escapeHtml).join(' · ')}</span>
        </div>
        ${proj.description ? `<div class="entry-desc">${escapeHtml(proj.description)}</div>` : ''}
        ${renderBulletList(proj.bullets)}
      </div>`,
    )
    .join('');

  const educationHtml = (content.education ?? [])
    .map(
      (edu) => `
      <div class="entry">
        <div class="entry-header">
          <span class="entry-title">${escapeHtml(edu.degree)}</span>
          <span class="entry-period">${escapeHtml(edu.period)}</span>
        </div>
        <div class="entry-org">${escapeHtml(edu.institution)}${edu.gpa ? ` &mdash; GPA: ${escapeHtml(edu.gpa)}` : ''}</div>
      </div>`,
    )
    .join('');

  const certHtml = (content.certifications ?? [])
    .map(
      (cert) =>
        `<div class="cert-entry"><strong>${escapeHtml(cert.name)}</strong>` +
        (cert.issuer ? ` &mdash; ${escapeHtml(cert.issuer)}` : '') +
        (cert.date ? ` (${escapeHtml(cert.date)})` : '') +
        `</div>`,
    )
    .join('');

  // Fallback: if Gemini returned no structured sections, show selected item titles
  const fallbackSection =
    !content.summary && !content.experience?.length && !content.projects?.length
      ? `<section><h2>Portfolio Highlights</h2>${selected.map((s) => `<div class="entry"><span class="entry-title">${escapeHtml(s.item.title)}</span><p>${escapeHtml(s.item.description)}</p></div>`).join('')}</section>`
      : '';

  // Build contact info row
  const contactItems: string[] = [];
  if (contact?.email) contactItems.push(`<span class="contact-item">Email ${escapeHtml(contact.email)}</span>`);
  if (contact?.phone_number) contactItems.push(`<span class="contact-item">Phone ${escapeHtml(contact.phone_number)}</span>`);
  if (contact?.location) contactItems.push(`<span class="contact-item">${escapeHtml(contact.location)}</span>`);
  if (contact?.linkedin_url) contactItems.push(`<span class="contact-item">in ${escapeHtml(contact.linkedin_url.replace(/^https?:\/\/(www\.)?/, ''))}</span>`);
  if (contact?.github_url) contactItems.push(`<span class="contact-item">GitHub ${escapeHtml(contact.github_url.replace(/^https?:\/\/(www\.)?/, ''))}</span>`);
  if (contact?.portfolio_url) contactItems.push(`<span class="contact-item">${escapeHtml(contact.portfolio_url.replace(/^https?:\/\/(www\.)?/, ''))}</span>`);
  const contactHtml = contactItems.length > 0
    ? `<div class="contact-row">${contactItems.join('<span class="contact-sep">·</span>')}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Resume - ${escapeHtml(jobTitle)} at ${escapeHtml(companyName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10.5pt; color: #1a1a1a; line-height: 1.45; padding: 18mm 16mm; }
    header { border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; margin-bottom: 14px; }
    h1 { font-family: Georgia, serif; font-size: 20pt; font-weight: 700; letter-spacing: -0.3px; color: #111; }
    .header-sub { font-size: 10pt; color: #555; margin-top: 3px; font-style: italic; }
    .contact-row { display: flex; flex-wrap: wrap; gap: 2px 0; margin-top: 7px; font-size: 9pt; color: #444; }
    .contact-item { white-space: nowrap; }
    .contact-sep { margin: 0 8px; color: #aaa; }
    section { margin-top: 13px; }
    h2 { font-size: 9.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 8px; color: #444; }
    .summary { font-size: 10.5pt; color: #222; }
    .entry { margin-bottom: 10px; }
    .entry-header { display: flex; justify-content: space-between; }
    .entry-title { font-weight: 700; font-size: 10.5pt; }
    .entry-period { color: #666; font-size: 9.5pt; font-style: italic; }
    .entry-tech { color: #666; font-size: 9pt; }
    .entry-org { color: #444; font-size: 9.5pt; margin: 2px 0 4px; }
    .entry-desc { color: #555; font-size: 9.5pt; margin-bottom: 4px; }
    ul { padding-left: 16px; }
    li { margin-bottom: 2px; font-size: 10pt; }
    table { width: 100%; border-collapse: collapse; }
    .skill-cat { font-weight: 700; width: 110px; vertical-align: top; padding: 2px 0; font-size: 10pt; }
    td { padding: 2px 0; font-size: 10pt; }
    .cert-entry { font-size: 10pt; margin-bottom: 4px; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(contact?.full_name ?? 'Resume')}</h1>
    ${jobTitle ? `<div class="header-sub">Tailored for ${escapeHtml(jobTitle)}${companyName ? ` at ${escapeHtml(companyName)}` : ''}</div>` : ''}
    ${contactHtml}
  </header>

  ${content.summary ? `<section><h2>Summary</h2><p class="summary">${escapeHtml(content.summary)}</p></section>` : ''}

  ${content.experience?.length ? `<section><h2>Experience</h2>${experienceHtml}</section>` : ''}

  ${content.projects?.length ? `<section><h2>Projects</h2>${projectsHtml}</section>` : ''}

  ${Object.keys(content.skills ?? {}).length > 0 ? `<section><h2>Skills</h2><table>${skillRows}</table></section>` : ''}

  ${content.education?.length ? `<section><h2>Education</h2>${educationHtml}</section>` : ''}

  ${content.certifications?.length ? `<section><h2>Certifications</h2>${certHtml}</section>` : ''}

  ${fallbackSection}
</body>
</html>`;
};

export const generateResumeForJob = async (userId: string, input: GenerateResumeInput) => {
  // Fetch user contact info for the PDF header
  let userContact: UserContact | undefined;
  try {
    userContact = await getProfile(userId) as UserContact;
  } catch {
    // non-blocking — resume generates without contact info
  }

  // Create job_target row
  const jobTargetResult = await pool.query<{ id: string; job_title: string; company_name: string }>(
    `INSERT INTO job_targets (user_id, job_title, company_name, job_description)
     VALUES ($1, $2, $3, $4)
     RETURNING id, job_title, company_name`,
    [userId, input.jobTitle, input.companyName, input.jobDescription],
  );
  const jobTarget = jobTargetResult.rows[0]!;

  // Create generation job
  const generationJobResult = await pool.query<{ id: string }>(
    `INSERT INTO resume_generation_jobs (user_id, job_target_id, status, current_stage, progress_percent)
     VALUES ($1, $2, 'queued', 'created', 0)
     RETURNING id`,
    [userId, jobTarget.id],
  );
  const generationJob = generationJobResult.rows[0]!;

  // Stage 1: Analyze JD
  await updateJobStatus(generationJob.id, 'analyzing_jd', 'analyzing_jd', 10);
  const extractedEntities = await analyzeJobDescription(input.jobDescription);

  await pool.query(
    `UPDATE job_targets SET extracted_entities = $1 WHERE id = $2`,
    [JSON.stringify(extractedEntities), jobTarget.id],
  );

  // Stage 2: Score portfolio
  await updateJobStatus(generationJob.id, 'scoring_portfolio', 'scoring_portfolio', 25);
  const portfolioItems = await listPortfolioItems(userId, { limit: 200 });
  if (portfolioItems.length === 0) {
    await pool.query(
      `UPDATE resume_generation_jobs
       SET status = 'failed', current_stage = 'failed', progress_percent = 100,
           error_message = $1, completed_at = NOW()
       WHERE id = $2`,
      ['Add at least one portfolio item before generating a resume.', generationJob.id],
    );
    throw new ValidationError('Add at least one portfolio item before generating a resume.');
  }
  const scored = scorePortfolioItems(portfolioItems as never, extractedEntities, input.jobDescription);
  const selected = selectPortfolioItems(scored);
  const selectedIds = selected.map((s) => s.item.id);

  // Stage 3: Generate content via Gemini
  await updateJobStatus(generationJob.id, 'generating_content', 'generating_content', 50);

  const generationPayload = {
    jobTitle: input.jobTitle,
    companyName: input.companyName,
    extractedEntities,
    selectedItems: selected.map((s) => ({
      type: s.item.type,
      title: s.item.title,
      description: s.item.description,
      tech_stack: s.item.tech_stack,
      impact_metrics: s.item.impact_metrics,
      company_name: s.item.company_name,
      role: s.item.title,
      period:
        s.item.start_date || s.item.end_date
          ? `${s.item.start_date ?? ''} – ${s.item.is_current ? 'Present' : (s.item.end_date ?? '')}`
          : undefined,
      institution_name: s.item.institution_name,
      degree: s.item.degree,
      gpa: s.item.gpa,
      skill_name: s.item.skill_name,
      issuing_org: s.item.issuing_org,
    })),
  };

  const generatedContent = await requestNimJson<GeneratedResumeContent>({
    systemPrompt: resumeGenerationPrompt,
    userPrompt: JSON.stringify(generationPayload),
    maxTokens: 2048,
    temperature: 0.3,
  });

  // Stage 4: Render PDF (best-effort — skip gracefully if renderer or storage unavailable)
  await updateJobStatus(generationJob.id, 'rendering_pdf', 'rendering_pdf', 75);

  let pdfKey: string | null = null;
  try {
    const html = buildResumeHtml(generatedContent, input.jobTitle, input.companyName, selected, userContact);
    const pdfBuffer = await renderHtmlToPdfBuffer(html);
    pdfKey = `users/${userId}/resumes/${generationJob.id}.pdf`;
    await uploadFile(pdfKey, pdfBuffer, 'application/pdf');
  } catch {
    pdfKey = null;
  }

  // Stage 5: ATS scoring
  const resumeText = JSON.stringify(generatedContent);
  const ats = scoreAtsMatch({ jobDescription: input.jobDescription, resumeText, extractedEntities });

  // Determine version label
  const existingVersions = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM resume_versions
     WHERE user_id = $1 AND job_target_id = $2`,
    [userId, jobTarget.id],
  );
  const versionNumber = Number(existingVersions.rows[0]?.count ?? 0) + 1;
  const versionLabel = generateVersionLabel(input.jobTitle, input.companyName, versionNumber);

  // Persist resume version
  const resumeVersionResult = await pool.query<{ id: string; pdf_s3_key: string | null; ats_score: string; version_label: string }>(
    `INSERT INTO resume_versions (
       user_id, job_target_id, generation_job_id,
       template_id, page_length, version_label,
       selected_item_ids, generated_content,
       ats_score, ats_feedback, pdf_s3_key
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, pdf_s3_key, ats_score, version_label`,
    [
      userId,
      jobTarget.id,
      generationJob.id,
      input.templateId ?? 'modern',
      input.pageLength ?? '1-page',
      versionLabel,
      selectedIds,
      JSON.stringify(generatedContent),
      ats.score,
      JSON.stringify(ats),
      pdfKey,
    ],
  );
  const resumeVersion = resumeVersionResult.rows[0]!;

  // Mark job completed
  await pool.query(
    `UPDATE resume_generation_jobs
     SET status = 'completed', current_stage = 'done', progress_percent = 100, completed_at = NOW()
     WHERE id = $1`,
    [generationJob.id],
  );

  return {
    generationJobId: generationJob.id,
    jobTarget,
    resumeVersion: {
      id: resumeVersion.id,
      version_label: resumeVersion.version_label,
      pdf_s3_key: resumeVersion.pdf_s3_key,
      ats_score: resumeVersion.ats_score,
    },
  };
};
