import { pool } from '../../db/client.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { requestGeminiText } from '../../services/gemini.service.js';
import { renderCoverLetterToPdf } from '../../services/pdf-renderer.service.js';
import { uploadFile } from '../../services/storage.service.js';
import { coverLetterPrompt } from '../ai/prompts/cover-letter.prompt.js';
import {
  getResumeVersion,
  fetchUserProfile,
  fetchPortfolioItemsByIds,
} from '../resume/resume.service.js';
import type { CoverLetterRow, JobTargetRow } from '../../types/resume.types.js';
import type { GenerateCoverLetterInput } from './cover-letter.schema.js';

const fetchJobTarget = async (jobTargetId: string): Promise<JobTargetRow> => {
  const result = await pool.query<JobTargetRow>(
    `SELECT * FROM job_targets WHERE id = $1 LIMIT 1`,
    [jobTargetId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Job target not found');
  return row;
};

const buildCoverLetterUserPrompt = (data: {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  candidateName: string;
  selectedItemsSummary: string;
  whyCompany: string;
  tone: string;
  highlightNote?: string;
}): string => {
  return `Candidate: ${data.candidateName}
Target Role: ${data.jobTitle} at ${data.companyName}
Tone: ${data.tone}

Why this company (candidate's own words):
${data.whyCompany}

${data.highlightNote ? `Additional highlight from candidate:\n${data.highlightNote}\n` : ''}
Job Description (excerpt):
${data.jobDescription.slice(0, 1200)}

Relevant portfolio highlights:
${data.selectedItemsSummary}`;
};

const buildPortfolioSummary = (items: Array<{ type: string; title: string; description?: string | null; bullets?: string[]; impact_metrics?: string | null }>): string => {
  return items
    .slice(0, 5)
    .map((item) => {
      const desc = item.description ?? item.impact_metrics ?? '';
      return `- [${item.type}] ${item.title}${desc ? `: ${desc.slice(0, 120)}` : ''}`;
    })
    .join('\n');
};

export const generateCoverLetter = async (
  userId: string,
  resumeVersionId: string,
  input: GenerateCoverLetterInput,
): Promise<CoverLetterRow> => {
  const version = await getResumeVersion(userId, resumeVersionId);

  if (!version.job_target_id) {
    throw new AppError('This resume version has no associated job target', 422);
  }

  const [jobTarget, userProfile, portfolioItems] = await Promise.all([
    fetchJobTarget(version.job_target_id),
    fetchUserProfile(userId),
    fetchPortfolioItemsByIds(version.selected_item_ids),
  ]);

  const userPrompt = buildCoverLetterUserPrompt({
    jobTitle: jobTarget.job_title,
    companyName: jobTarget.company_name,
    jobDescription: jobTarget.job_description,
    candidateName: userProfile.full_name,
    selectedItemsSummary: buildPortfolioSummary(portfolioItems),
    whyCompany: input.whyCompany,
    tone: input.tone,
    highlightNote: input.highlightNote,
  });

  const contentText = await requestGeminiText({
    systemPrompt: coverLetterPrompt,
    userPrompt,
    temperature: 0.55,
    maxTokens: 1000,
  });

  const pdfBuffer = await renderCoverLetterToPdf({
    senderName: userProfile.full_name,
    senderEmail: userProfile.email,
    jobTitle: jobTarget.job_title,
    companyName: jobTarget.company_name,
    contentText,
  });

  const pdfKey = `users/${userId}/cover-letters/${resumeVersionId}.pdf`;
  await uploadFile(pdfKey, pdfBuffer, 'application/pdf');

  const result = await pool.query<CoverLetterRow>(
    `INSERT INTO cover_letters
       (user_id, resume_version_id, why_company, tone, highlight_note, content_text, pdf_s3_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userId,
      resumeVersionId,
      input.whyCompany,
      input.tone,
      input.highlightNote ?? null,
      contentText,
      pdfKey,
    ],
  );

  const coverLetter = result.rows[0];
  if (!coverLetter) throw new AppError('Failed to save cover letter', 500);

  // Link cover letter back to the resume version
  await pool.query(
    `UPDATE resume_versions SET cover_letter_id = $1 WHERE id = $2`,
    [coverLetter.id, resumeVersionId],
  );

  return coverLetter;
};

export const getCoverLetter = async (
  userId: string,
  resumeVersionId: string,
): Promise<CoverLetterRow> => {
  // Validate the resume belongs to the user first
  await getResumeVersion(userId, resumeVersionId);

  const result = await pool.query<CoverLetterRow>(
    `SELECT * FROM cover_letters WHERE resume_version_id = $1 AND user_id = $2 LIMIT 1`,
    [resumeVersionId, userId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Cover letter not found for this resume');
  return row;
};
