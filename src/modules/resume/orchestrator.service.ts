import { analyzeJobDescription } from '../ai/jd-analyzer.service.js';
import { scorePortfolioItems } from '../ai/portfolio-scorer.service.js';
import { selectPortfolioItems } from '../ai/item-selector.service.js';
import { requestGeminiJson } from '../../services/gemini.service.js';
import { renderResumeToPdf } from '../../services/pdf-renderer.service.js';
import { uploadFile } from '../../services/storage.service.js';
import { scoreAtsMatch } from '../../services/ats-scorer.service.js';
import { resumeGenerationPrompt } from '../ai/prompts/resume-generation.prompt.js';
import {
  updateGenerationJob,
  updateJobTargetEntities,
  fetchPortfolioItems,
  fetchUserProfile,
  createResumeVersion,
  countUserResumeVersions,
} from './resume.service.js';
import { generateVersionLabel } from '../../utils/version-label.js';
import type { GeneratedResumeContent, TemplateId } from '../../types/resume.types.js';
import type { SelectedItem } from '../../types/ai.types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const contentToPlainText = (content: GeneratedResumeContent): string => {
  const parts: string[] = [
    content.summary,
    ...content.experience.flatMap((e) => [e.role, e.company, ...e.bullets]),
    ...content.projects.flatMap((p) => [p.name, ...p.tech, ...p.bullets]),
    ...content.education.flatMap((e) => [e.institution, e.degree, e.fieldOfStudy ?? '']),
    ...Object.values(content.skills).flat(),
    ...(content.certifications ?? []).flatMap((c) => [c.name, c.issuer]),
  ];
  return parts.filter(Boolean).join(' ');
};

const buildGenerationUserPrompt = (
  jobTitle: string,
  companyName: string,
  jobDescription: string,
  selectedItems: SelectedItem[],
  roleCategory: string,
  roleSeniority: string,
): string => {
  const itemsJson = JSON.stringify(
    selectedItems.map((si) => ({
      type: si.item.type,
      title: si.item.title,
      description: si.item.description,
      company_name: si.item.company_name,
      role: si.item.title,
      location: si.item.location,
      start_date: si.item.start_date,
      end_date: si.item.end_date,
      is_current: si.item.is_current,
      tech_stack: si.item.tech_stack,
      project_url: si.item.project_url,
      impact_metrics: si.item.impact_metrics,
      domain_category: si.item.domain_category,
      degree: si.item.degree,
      field_of_study: si.item.field_of_study,
      institution_name: si.item.institution_name,
      gpa: si.item.gpa,
      achievements: si.item.achievements,
      issuing_org: si.item.issuing_org,
      cert_url: si.item.cert_url,
      skill_name: si.item.skill_name,
      matched_skills: si.matchedSkills,
      relevance_score: si.score,
    })),
    null,
    2,
  );

  return `Target Role: ${jobTitle} at ${companyName}
Seniority: ${roleSeniority}
Category: ${roleCategory}

Job Description:
${jobDescription}

Selected Portfolio Items (ordered by relevance):
${itemsJson}`;
};

// ─── Stage Progress Updates ────────────────────────────────────────────────────

const setStage = async (
  jobId: string,
  status: string,
  stage: string,
  percent: number,
): Promise<void> => {
  await updateGenerationJob(jobId, {
    status: status as Parameters<typeof updateGenerationJob>[1]['status'],
    currentStage: stage,
    progressPercent: percent,
  });
};

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface OrchestrationInput {
  userId: string;
  jobId: string;
  jobTargetId: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  templateId: TemplateId;
  pageLength: string;
}

export const runOrchestration = async (input: OrchestrationInput): Promise<void> => {
  const { userId, jobId, jobTargetId, jobTitle, companyName, jobDescription, templateId } = input;

  try {
    // ── Stage 1: Analyse the job description ────────────────────────────────
    await setStage(jobId, 'analyzing_jd', 'Analysing job description', 10);

    const extractedEntities = await analyzeJobDescription(jobDescription);
    await updateJobTargetEntities(jobTargetId, extractedEntities as unknown as Record<string, unknown>);

    await setStage(jobId, 'analyzing_jd', 'Job description analysed', 25);

    // ── Stage 2: Score and select portfolio items ───────────────────────────
    await setStage(jobId, 'scoring_portfolio', 'Scoring portfolio items', 30);

    const portfolioItems = await fetchPortfolioItems(userId);
    const scoredItems = scorePortfolioItems(portfolioItems, extractedEntities, jobDescription);
    const selectedItems = selectPortfolioItems(scoredItems);

    await setStage(jobId, 'scoring_portfolio', 'Portfolio scored', 45);

    // ── Stage 3: Generate resume content via Gemini ─────────────────────────
    await setStage(jobId, 'generating_content', 'Generating resume content', 50);

    const userProfile = await fetchUserProfile(userId);
    const userPrompt = buildGenerationUserPrompt(
      jobTitle,
      companyName,
      jobDescription,
      selectedItems,
      extractedEntities.roleCategory,
      extractedEntities.roleSeniority,
    );

    const generatedContent = await requestGeminiJson<GeneratedResumeContent>({
      systemPrompt: resumeGenerationPrompt,
      userPrompt,
      temperature: 0.35,
      maxTokens: 3000,
    });

    await setStage(jobId, 'generating_content', 'Content generated', 65);

    // ── Stage 4: Render PDF ─────────────────────────────────────────────────
    await setStage(jobId, 'rendering_pdf', 'Rendering PDF', 70);

    const pdfBuffer = await renderResumeToPdf(templateId, {
      user: {
        fullName: userProfile.full_name,
        email: userProfile.email,
        university: userProfile.university,
        graduationYear: userProfile.graduation_year,
      },
      jobTitle,
      companyName,
      content: generatedContent,
    });

    const pdfKey = `users/${userId}/resumes/${jobTargetId}.pdf`;
    await uploadFile(pdfKey, pdfBuffer, 'application/pdf');

    await setStage(jobId, 'rendering_pdf', 'PDF uploaded', 85);

    // ── Stage 5: ATS scoring ────────────────────────────────────────────────
    const resumeText = contentToPlainText(generatedContent);
    const atsResult = scoreAtsMatch({
      jobDescription,
      resumeText,
      extractedEntities,
    });

    // ── Persist final resume version ────────────────────────────────────────
    const versionCount = await countUserResumeVersions(userId);
    const versionLabel = generateVersionLabel(
      userProfile.target_role_category ?? extractedEntities.roleCategory,
      companyName,
      versionCount + 1,
    );

    await createResumeVersion({
      userId,
      jobTargetId,
      generationJobId: jobId,
      versionLabel,
      templateId,
      pageLength: input.pageLength,
      selectedItemIds: selectedItems.map((si) => si.item.id),
      generatedContent,
      atsScore: atsResult.score,
      atsFeedback: {
        foundKeywords: atsResult.foundKeywords,
        missingKeywords: atsResult.missingKeywords,
        suggestions: atsResult.suggestions,
      },
      pdfS3Key: pdfKey,
    });

    // ── Mark completed ──────────────────────────────────────────────────────
    await updateGenerationJob(jobId, {
      status: 'completed',
      currentStage: 'Resume ready',
      progressPercent: 100,
      completedAt: new Date(),
    });
  } catch (error) {
    await updateGenerationJob(jobId, {
      status: 'failed',
      currentStage: 'Failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      completedAt: new Date(),
    });
  }
};
