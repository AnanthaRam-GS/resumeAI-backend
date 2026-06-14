import { pool } from '../../db/client.js';
import { analyzeJobDescription } from '../ai/jd-analyzer.service.js';
import { listPortfolioItems } from '../portfolio/portfolio.service.js';
import { scorePortfolioItems } from '../ai/portfolio-scorer.service.js';
import { selectPortfolioItems } from '../ai/item-selector.service.js';
import { requestGeminiJson } from '../../services/gemini.service.js';
import { renderHtmlToPdfBuffer } from '../../services/pdf-renderer.service.js';
import { uploadFile } from '../../services/storage.service.js';
import { scoreAtsMatch } from '../../services/ats-scorer.service.js';

type GenerateResumeInput = {
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  templateId?: string;
  pageLength?: string;
};

export const generateResumeForJob = async (userId: string, input: GenerateResumeInput) => {
  const client = pool;

  // Create a job_target row (initially empty extracted_entities)
  const jobTargetResult = await client.query(
    `
      INSERT INTO job_targets (user_id, job_title, company_name, job_description)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [userId, input.jobTitle, input.companyName, input.jobDescription],
  );

  const jobTarget = jobTargetResult.rows[0];

  // Create a generation job referencing the job target
  const generationJobResult = await client.query(
    `
      INSERT INTO resume_generation_jobs (user_id, job_target_id, status, current_stage, progress_percent)
      VALUES ($1, $2, 'queued', 'created', 0)
      RETURNING *
    `,
    [userId, jobTarget.id],
  );

  const generationJob = generationJobResult.rows[0];

  // Stage: analyzing job description
  await client.query(
    `
      UPDATE resume_generation_jobs SET status = 'analyzing_jd', current_stage = 'analyzing_jd', progress_percent = 5
      WHERE id = $1
    `,
    [generationJob.id],
  );

  const extractedEntities = await analyzeJobDescription(input.jobDescription);

  // Persist extracted entities on the job_target
  await client.query(
    `
      UPDATE job_targets SET extracted_entities = $1
      WHERE id = $2
    `,
    [extractedEntities, jobTarget.id],
  );

  // Stage: score portfolio
  await client.query(
    `
      UPDATE resume_generation_jobs SET status = 'scoring_portfolio', current_stage = 'scoring_portfolio', progress_percent = 15
      WHERE id = $1
    `,
    [generationJob.id],
  );

  const portfolioItems = await listPortfolioItems(userId, { limit: 200 });
  const scored = scorePortfolioItems(portfolioItems as any, extractedEntities, input.jobDescription);
  const selected = selectPortfolioItems(scored);
  const selectedIds = selected.map((s) => s.item.id);

  // Stage: generate resume content
  await client.query(
    `
      UPDATE resume_generation_jobs SET status = 'generating_resume', current_stage = 'generating_resume', progress_percent = 45
      WHERE id = $1
    `,
    [generationJob.id],
  );

  const geminiPayload = {
    jobTitle: input.jobTitle,
    companyName: input.companyName,
    extractedEntities,
    selectedItems: selected.map((s) => ({ id: s.item.id, title: s.item.title, description: s.item.description })),
  };

  const generatedContent = await requestGeminiJson<Record<string, unknown>>({
    userPrompt: JSON.stringify(geminiPayload),
  });

  // Stage: render PDF
  await client.query(
    `
      UPDATE resume_generation_jobs SET status = 'rendering_pdf', current_stage = 'rendering_pdf', progress_percent = 75
      WHERE id = $1
    `,
    [generationJob.id],
  );

  // Create a simple HTML from generated content for rendering
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Resume</title></head><body><pre>${
    JSON.stringify(generatedContent, null, 2)
  }</pre></body></html>`;

  const pdfBuffer = await renderHtmlToPdfBuffer(html);

  const key = `resumes/${userId}/${Date.now()}.pdf`;
  await uploadFile(key, pdfBuffer, 'application/pdf');

  // Stage: ATS scoring
  await client.query(
    `
      UPDATE resume_generation_jobs SET status = 'scoring_ats', current_stage = 'scoring_ats', progress_percent = 90
      WHERE id = $1
    `,
    [generationJob.id],
  );

  const resumeText = JSON.stringify(generatedContent);
  const ats = scoreAtsMatch({ jobDescription: input.jobDescription, resumeText, extractedEntities });

  // Persist resume version
  const resumeVersionResult = await client.query(
    `
      INSERT INTO resume_versions (
        user_id,
        job_target_id,
        generation_job_id,
        template_id,
        page_length,
        selected_item_ids,
        generated_content,
        ats_score,
        ats_feedback,
        pdf_s3_key
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `,
    [
      userId,
      jobTarget.id,
      generationJob.id,
      input.templateId ?? 'default',
      input.pageLength ?? '1-page',
      selectedIds,
      generatedContent,
      ats.score,
      ats,
      key,
    ],
  );

  const resumeVersion = resumeVersionResult.rows[0];

  // Mark job completed
  await client.query(
    `
      UPDATE resume_generation_jobs
      SET status = 'completed', current_stage = 'done', progress_percent = 100, completed_at = NOW()
      WHERE id = $1
    `,
    [generationJob.id],
  );

  return {
    job: generationJob,
    jobTarget,
    resumeVersion,
  };
};

export default {};
export {};
