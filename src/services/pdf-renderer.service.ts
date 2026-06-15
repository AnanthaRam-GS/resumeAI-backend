import puppeteer from 'puppeteer';
import { AppError } from '../utils/errors.js';
import type { ResumeRenderData, TemplateId } from '../types/resume.types.js';
import type { CoverLetterRenderData } from '../templates/cover-letter.template.js';
import { modernTemplate } from '../templates/modern.template.js';
import { academicTemplate } from '../templates/academic.template.js';
import { minimalTemplate } from '../templates/minimal.template.js';
import { coverLetterTemplate } from '../templates/cover-letter.template.js';

const RESUME_TEMPLATES: Record<TemplateId, (data: ResumeRenderData) => string> = {
  modern: modernTemplate,
  academic: academicTemplate,
  minimal: minimalTemplate,
};

const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
];

const htmlToPdfBuffer = async (html: string): Promise<Buffer> => {
  const browser = await puppeteer.launch({ headless: true, args: PUPPETEER_ARGS });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
};

export const renderResumeToPdf = async (
  templateId: TemplateId,
  data: ResumeRenderData,
): Promise<Buffer> => {
  const templateFn = RESUME_TEMPLATES[templateId];
  const html = templateFn(data);
  try {
    return await htmlToPdfBuffer(html);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Resume PDF rendering failed', 502);
  }
};

export const renderCoverLetterToPdf = async (data: CoverLetterRenderData): Promise<Buffer> => {
  const html = coverLetterTemplate(data);
  try {
    return await htmlToPdfBuffer(html);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Cover letter PDF rendering failed', 502);
  }
};
