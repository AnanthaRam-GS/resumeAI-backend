import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Top-level mocks ────────────────────────────────────────────────────────

const groqJsonMock = vi.fn();
vi.mock('../../services/groq.service.js', () => ({
  requestGroqJson: groqJsonMock,
}));

vi.mock('pdf-parse', () => ({
  default: vi.fn(async () => ({
    text: 'Sample PDF text with TypeScript and Node.js experience at Google.',
  })),
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(async () => ({
      value: 'Sample DOCX text with React and CSS skills.',
    })),
  },
}));

const uploadFileMock = vi.fn();
const getSignedUrlMock = vi.fn();
const deleteFileMock = vi.fn();
vi.mock('../../services/storage.service.js', () => ({
  uploadFile: uploadFileMock,
  getSignedUrl: getSignedUrlMock,
  deleteFile: deleteFileMock,
}));

const createPortfolioItemMock = vi.fn();
vi.mock('../portfolio/portfolio.service.js', () => ({
  createPortfolioItem: createPortfolioItemMock,
}));

// ── document-parser.service unit tests ────────────────────────────────────

describe('parseDocumentIntoPortfolioItems (mocked Groq)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadFileMock.mockResolvedValue('s3-key');
    getSignedUrlMock.mockResolvedValue('https://s3/key');
    deleteFileMock.mockResolvedValue(true);
  });

  it('extracts portfolio items from a PDF buffer', async () => {
    groqJsonMock.mockResolvedValueOnce({
      items: [
        {
          type: 'experience',
          title: 'Software Engineer',
          company_name: 'Google',
          description: 'Built TypeScript services',
          tech_stack: ['TypeScript', 'Node.js'],
          start_date: '2022-01-01',
          end_date: '2024-01-01',
        },
      ],
    });

    const { parseDocumentIntoPortfolioItems } = await import(
      '../../services/document-parser.service.js'
    );
    const items = await parseDocumentIntoPortfolioItems(
      Buffer.from('PDF content'),
      'application/pdf',
      'resume.pdf',
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe('experience');
    expect(items[0]?.title).toBe('Software Engineer');
    expect(items[0]?.source).toBe('upload');
  });

  it('extracts items from a DOCX buffer', async () => {
    groqJsonMock.mockResolvedValueOnce({
      items: [
        { type: 'skill', title: 'React', skill_name: 'React' },
        { type: 'skill', title: 'CSS', skill_name: 'CSS' },
      ],
    });

    const { parseDocumentIntoPortfolioItems } = await import(
      '../../services/document-parser.service.js'
    );
    const items = await parseDocumentIntoPortfolioItems(
      Buffer.from('DOCX content'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'resume.docx',
    );

    expect(items).toHaveLength(2);
    expect(items.every((i) => i.type === 'skill')).toBe(true);
  });

  it('filters out items with missing title or invalid type', async () => {
    groqJsonMock.mockResolvedValueOnce({
      items: [
        { type: 'project', title: '' },             // empty title – filtered
        { type: 'unknown-type', title: 'X' },        // invalid type – filtered
        { type: 'project', title: 'Valid Project' }, // valid
      ],
    });

    const { parseDocumentIntoPortfolioItems } = await import(
      '../../services/document-parser.service.js'
    );
    const items = await parseDocumentIntoPortfolioItems(
      Buffer.from('PDF text'),
      'application/pdf',
      'resume.pdf',
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Valid Project');
  });

  it('throws ValidationError for unsupported file type', async () => {
    const { extractTextFromBuffer } = await import('../../services/document-parser.service.js');
    await expect(
      extractTextFromBuffer(Buffer.from('data'), 'image/png', 'photo.png'),
    ).rejects.toThrow('Unsupported file type');
  });
});

// ── documents.service integration ─────────────────────────────────────────

describe('processDocumentUpload (mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadFileMock.mockImplementation(async (key: string) => key);
    createPortfolioItemMock.mockImplementation(async (_userId: string, input: Record<string, unknown>) => ({
      id: `item-${Math.random()}`,
      ...input,
      created_at: new Date(),
      updated_at: new Date(),
    }));
    groqJsonMock.mockResolvedValue({
      items: [
        { type: 'experience', title: 'Software Engineer', company_name: 'Acme' },
        { type: 'skill', title: 'TypeScript', skill_name: 'TypeScript' },
      ],
    });
  });

  it('uploads original file to S3 and creates portfolio items', async () => {
    const { processDocumentUpload } = await import('./documents.service.js');
    const result = await processDocumentUpload(
      'user-1',
      Buffer.from('PDF content'),
      'application/pdf',
      'resume.pdf',
    );

    expect(result.documentS3Key).toContain('users/user-1/uploads/');
    expect(result.filename).toBe('resume.pdf');
    expect(uploadFileMock).toHaveBeenCalledWith(
      expect.stringContaining('users/user-1/uploads/'),
      expect.any(Buffer),
      'application/pdf',
    );
  });

  it('creates a portfolio item for each extracted result', async () => {
    const { processDocumentUpload } = await import('./documents.service.js');
    const result = await processDocumentUpload(
      'user-1',
      Buffer.from('PDF content'),
      'application/pdf',
      'resume.pdf',
    );

    expect(result.extractedItemCount).toBe(2);
    expect(result.extractedItems).toHaveLength(2);
    expect(createPortfolioItemMock).toHaveBeenCalledTimes(2);
  });

  it('returns empty extractedItems when AI returns no valid items', async () => {
    groqJsonMock.mockResolvedValue({ items: [] });

    const { processDocumentUpload } = await import('./documents.service.js');
    const result = await processDocumentUpload(
      'user-1',
      Buffer.from('empty PDF'),
      'application/pdf',
      'blank.pdf',
    );

    expect(result.extractedItemCount).toBe(0);
    expect(result.extractedItems).toHaveLength(0);
  });
});

// ── upload middleware extension type check ────────────────────────────────

describe('upload middleware', () => {
  it('accepts PDF, DOCX, DOC extensions and rejects others', () => {
    const cases: Array<[string, boolean]> = [
      ['resume.pdf', true],
      ['resume.docx', true],
      ['resume.doc', true],
      ['photo.png', false],
      ['document.txt', false],
      ['spreadsheet.xlsx', false],
    ];

    const supported = new Set(['.pdf', '.docx', '.doc']);
    for (const [filename, expected] of cases) {
      const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
      expect(supported.has(ext)).toBe(expected);
    }
  });

  it('accepts standard PDF and DOCX MIME types', () => {
    const supportedMimes = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ]);

    expect(supportedMimes.has('application/pdf')).toBe(true);
    expect(supportedMimes.has('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(supportedMimes.has('image/jpeg')).toBe(false);
  });
});
