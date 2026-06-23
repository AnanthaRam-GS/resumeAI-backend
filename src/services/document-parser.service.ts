import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { requestNimJson } from './nvidia-nim.service.js';
import { documentParserPrompt } from '../modules/ai/prompts/document-parser.prompt.js';
import { ValidationError } from '../utils/errors.js';
import {
	createPortfolioItemSchema,
	type CreatePortfolioItemInput,
} from '../modules/portfolio/portfolio.schema.js';

type ParsedDocumentItem = Partial<CreatePortfolioItemInput> & {
  type: CreatePortfolioItemInput['type'];
  title: string;
};

type DocumentParserOutput = {
  items?: ParsedDocumentItem[];
};

const ALLOWED_TYPES = new Set<string>([
  'project',
  'experience',
  'education',
  'skill',
  'certification',
]);

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const extractTextFromBuffer = async (
  buffer: Buffer,
  mimetype: string,
  filename: string,
): Promise<string> => {
  const lower = filename.toLowerCase();

  if (mimetype === PDF_MIME || lower.endsWith('.pdf')) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return result.text.trim();
  }

  if (
    mimetype === DOCX_MIME ||
    lower.endsWith('.docx')
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  throw new ValidationError('Unsupported file type. Please upload a PDF or DOCX file.');
};

const normalizeItem = (raw: ParsedDocumentItem): CreatePortfolioItemInput | null => {
	if (!raw.title?.trim()) return null;
	if (!raw.type || !ALLOWED_TYPES.has(raw.type)) return null;

  const base: CreatePortfolioItemInput = {
    type: raw.type,
    source: 'upload',
    title: raw.title.trim(),
  };

  if (raw.description) base.description = raw.description.trim();
  if (raw.start_date) base.start_date = raw.start_date;
  if (raw.end_date) base.end_date = raw.end_date;
  if (raw.is_current !== undefined) base.is_current = raw.is_current;
  if (raw.tech_stack?.length) base.tech_stack = raw.tech_stack;
  if (raw.impact_metrics) base.impact_metrics = raw.impact_metrics.trim();
  if (raw.domain_category) base.domain_category = raw.domain_category.trim();
  if (raw.company_name) base.company_name = raw.company_name.trim();
  if (raw.employment_type) base.employment_type = raw.employment_type.trim();
  if (raw.location) base.location = raw.location.trim();
  if (raw.degree) base.degree = raw.degree.trim();
  if (raw.field_of_study) base.field_of_study = raw.field_of_study.trim();
  if (raw.institution_name) base.institution_name = raw.institution_name.trim();
  if (raw.gpa) base.gpa = raw.gpa.trim();
  if (raw.achievements) base.achievements = raw.achievements.trim();
  if (raw.issuing_org) base.issuing_org = raw.issuing_org.trim();
  if (raw.cert_url) base.cert_url = raw.cert_url.trim();
  if (raw.skill_name) base.skill_name = raw.skill_name.trim();

	return base;
};

const validateNormalizedItem = (
	item: CreatePortfolioItemInput | null,
): CreatePortfolioItemInput | null => {
	if (!item) {
		return null;
	}

	const parsed = createPortfolioItemSchema.safeParse(item);
	return parsed.success ? parsed.data : null;
};

export const parseDocumentIntoPortfolioItems = async (
  buffer: Buffer,
  mimetype: string,
  filename: string,
): Promise<CreatePortfolioItemInput[]> => {
  const rawText = await extractTextFromBuffer(buffer, mimetype, filename);

  if (rawText.length < 20) {
    throw new ValidationError('Could not extract readable text from the uploaded document');
  }

  const truncatedText = rawText.length > 8000 ? rawText.slice(0, 8000) : rawText;

  const parsed = await requestNimJson<DocumentParserOutput>({
    systemPrompt: documentParserPrompt,
    userPrompt: truncatedText,
    maxTokens: 2000,
    temperature: 0.1,
  });

	const items = (parsed.items ?? [])
		.map(normalizeItem)
		.map(validateNormalizedItem)
		.filter((item): item is CreatePortfolioItemInput => item !== null);

	if (items.length === 0) {
		throw new ValidationError('No valid portfolio items could be extracted');
	}

	return items;
};
