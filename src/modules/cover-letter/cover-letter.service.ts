import { pool } from '../../db/client.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';
import { requestNimJson } from '../../services/nvidia-nim.service.js';
import { renderHtmlToPdfBuffer } from '../../services/pdf-renderer.service.js';
import { uploadFile, getSignedUrl } from '../../services/storage.service.js';
import { coverLetterPrompt } from '../ai/prompts/cover-letter.prompt.js';
import type { GenerateCoverLetterInput } from './cover-letter.schema.js';
import type { CoverLetterRow } from '../../types/resume.types.js';
import { assertSupportedOutputLanguage, getLanguageLabel } from '../../services/language.service.js';

type CoverLetterGenerationPayload = {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  whyCompany: string;
  tone: string;
  highlightNote?: string;
  selectedItems: Array<{
    type: string;
    title: string;
    description?: string | null;
    impact_metrics?: string | null;
    tech_stack?: string[] | null;
    company_name?: string | null;
  }>;
  outputLanguage: string;
  outputLanguageLabel: string;
};

type GeneratedCoverLetter = {
  letter_text?: string;
  opening?: string;
  body?: string;
  closing?: string;
};

const buildCoverLetterHtml = (letterText: string, jobTitle: string, companyName: string): string => {
  const paragraphs = letterText
    .split(/\n\n+/)
    .filter(Boolean)
    .map((p) => `<p>${p.trim()}</p>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Cover Letter – ${jobTitle} at ${companyName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 11pt;
      color: #1a1a1a;
      line-height: 1.6;
      padding: 20mm 18mm;
    }
    header { margin-bottom: 28px; }
    h1 { font-size: 13pt; font-weight: 700; }
    .subtitle { color: #555; font-size: 10pt; margin-top: 2px; }
    p { margin-bottom: 14px; }
  </style>
</head>
<body>
  <header>
    <h1>Cover Letter</h1>
    <div class="subtitle">${jobTitle} &mdash; ${companyName}</div>
  </header>
  <main>
    ${paragraphs}
  </main>
</body>
</html>`;
};

export const generateCoverLetter = async (
  userId: string,
  resumeVersionId: string,
  input: GenerateCoverLetterInput,
): Promise<CoverLetterRow & { pdf_signed_url?: string; content?: string }> => {
  const outputLanguage = assertSupportedOutputLanguage(input.outputLanguage);
  const outputLanguageLabel = getLanguageLabel(outputLanguage);
  // Fetch resume version and verify ownership
  const versionResult = await pool.query<{
    id: string;
    user_id: string;
    job_target_id: string | null;
    selected_item_ids: string[];
  }>(
    `SELECT id, user_id, job_target_id, selected_item_ids
     FROM resume_versions WHERE id = $1`,
    [resumeVersionId],
  );

  const version = versionResult.rows[0];
  if (!version) throw new NotFoundError('Resume version not found');
  if (version.user_id !== userId) throw new ForbiddenError('Resume version does not belong to the current user');

  // Fetch job target details
  let jobTitle = 'the role';
  let companyName = 'the company';
  let jobDescription = '';
  if (version.job_target_id) {
    const jtResult = await pool.query<{
      job_title: string;
      company_name: string;
      job_description: string;
    }>(
      `SELECT job_title, company_name, job_description FROM job_targets WHERE id = $1`,
      [version.job_target_id],
    );
    const jt = jtResult.rows[0];
    if (jt) {
      jobTitle = jt.job_title;
      companyName = jt.company_name;
      jobDescription = jt.job_description;
    }
  }

  // Fetch selected portfolio items
  const selectedItems: CoverLetterGenerationPayload['selectedItems'] = [];
  if (version.selected_item_ids.length > 0) {
    const itemsResult = await pool.query<{
      type: string;
      title: string;
      description: string | null;
      impact_metrics: string | null;
      tech_stack: string[] | null;
      company_name: string | null;
    }>(
      `SELECT type, title, description, impact_metrics, tech_stack, company_name
       FROM portfolio_items
       WHERE id = ANY($1) AND user_id = $2`,
      [version.selected_item_ids, userId],
    );
    selectedItems.push(...itemsResult.rows);
  }

  const payload: CoverLetterGenerationPayload = {
    jobTitle,
    companyName,
    jobDescription,
    whyCompany: input.whyCompany,
    tone: input.tone,
    highlightNote: input.highlightNote,
    selectedItems,
    outputLanguage,
    outputLanguageLabel,
  };

  // Generate via Groq
  const generated = await requestNimJson<GeneratedCoverLetter>({
    systemPrompt: `${coverLetterPrompt}\n\nOutput language: ${outputLanguageLabel}. Preserve names, companies, URLs, technologies, product names, code identifiers, and numeric metrics exactly unless normal grammar requires surrounding translated words.`,
    userPrompt: JSON.stringify(payload),
    maxTokens: 1024,
    temperature: 0.4,
  });

  const fallbackParts = [generated.opening, generated.body, generated.closing]
    .filter(Boolean)
    .join('\n\n');
  const letterText = generated.letter_text || fallbackParts || 'Cover letter generation failed. Please try again.';

  // Render to PDF and upload to S3 (best-effort — skip gracefully if unavailable)
  let pdfKey: string | null = null;
  try {
    const html = buildCoverLetterHtml(letterText, jobTitle, companyName);
    const pdfBuffer = await renderHtmlToPdfBuffer(html);
    pdfKey = `users/${userId}/cover-letters/${resumeVersionId}.pdf`;
    await uploadFile(pdfKey, pdfBuffer, 'application/pdf');
  } catch {
    pdfKey = null;
  }

  // Store cover letter in DB
  const clResult = await pool.query<CoverLetterRow>(
    `INSERT INTO cover_letters (user_id, resume_version_id, why_company, tone, highlight_note, content_text, pdf_s3_key, output_language)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [userId, resumeVersionId, input.whyCompany, input.tone, input.highlightNote ?? null, letterText, pdfKey, outputLanguage],
  );
  const coverLetter = clResult.rows[0]!;

  // Link cover letter to resume version
  await pool.query(
    `UPDATE resume_versions SET cover_letter_id = $1 WHERE id = $2 AND user_id = $3`,
    [coverLetter.id, resumeVersionId, userId],
  );

  let pdf_signed_url: string | undefined;
  if (pdfKey) {
    try { pdf_signed_url = await getSignedUrl(pdfKey); } catch { /* S3 unavailable */ }
  }
  return { ...coverLetter, content: coverLetter.content_text ?? undefined, pdf_signed_url };
};

export const getCoverLetter = async (
  userId: string,
  resumeVersionId: string,
): Promise<CoverLetterRow & { pdf_signed_url?: string; content?: string }> => {
  // Verify version ownership
  const versionResult = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM resume_versions WHERE id = $1`,
    [resumeVersionId],
  );
  const version = versionResult.rows[0];
  if (!version) throw new NotFoundError('Resume version not found');
  if (version.user_id !== userId) throw new ForbiddenError('Resume version does not belong to the current user');

  const result = await pool.query<CoverLetterRow>(
    `SELECT * FROM cover_letters WHERE resume_version_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [resumeVersionId, userId],
  );

  const coverLetter = result.rows[0];
  if (!coverLetter) throw new NotFoundError('No cover letter found for this resume version');

  let pdf_signed_url: string | undefined;
  if (coverLetter.pdf_s3_key) {
    try { pdf_signed_url = await getSignedUrl(coverLetter.pdf_s3_key); } catch { /* S3 unavailable */ }
  }

  return { ...coverLetter, content: coverLetter.content_text ?? undefined, pdf_signed_url };
};
