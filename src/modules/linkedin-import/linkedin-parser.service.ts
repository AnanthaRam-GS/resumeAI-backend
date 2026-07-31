import path from 'node:path';
import { promisify } from 'node:util';
import yauzl from 'yauzl';
import { ValidationError } from '../../utils/errors.js';
import { hashNormalizedText, sha256 } from '../../services/content-hash.service.js';
import type { CreatePortfolioItemInput } from '../portfolio/portfolio.schema.js';

const fromBuffer = promisify<Buffer, yauzl.Options, yauzl.ZipFile>(yauzl.fromBuffer);

export interface ParsedLinkedInRecord {
  recordType: CreatePortfolioItemInput['type'];
  normalizedHash: string;
  data: CreatePortfolioItemInput;
}

const MAX_ENTRIES = 80;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

const normalizeEntryName = (entryName: string): string => {
  const normalized = path.posix.normalize(entryName.replace(/\\/g, '/'));
  if (
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.startsWith('/') ||
    normalized === '..'
  ) {
    throw new ValidationError('ZIP contains an unsafe path');
  }
  return normalized;
};

const isSymlink = (entry: yauzl.Entry): boolean => {
  const mode = (entry.externalFileAttributes >> 16) & 0o170000;
  return mode === 0o120000;
};

const readEntry = async (zipFile: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error('Could not read ZIP entry'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_ENTRY_BYTES) {
          stream.destroy(new ValidationError('ZIP entry is too large'));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });

const parseCsv = (text: string): Record<string, string>[] => {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);

  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  );
};

const first = (row: Record<string, string>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const found = Object.entries(row).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase());
    if (found?.[1]) return found[1].trim();
  }
  return undefined;
};

const toDate = (value: string | undefined, fallbackMonth = '01'): string | undefined => {
  if (!value) return undefined;
  const year = value.match(/\b(19|20)\d{2}\b/)?.[0];
  if (!year) return undefined;
  return `${year}-${fallbackMonth}-01`;
};

const makeRecord = (data: CreatePortfolioItemInput): ParsedLinkedInRecord => ({
  recordType: data.type,
  data,
  normalizedHash: hashNormalizedText(JSON.stringify({
    type: data.type,
    title: data.title,
    company: data.company_name ?? data.institution_name ?? data.issuing_org,
    start: data.start_date,
    end: data.end_date,
  })),
});

const mapRows = (fileName: string, rows: Record<string, string>[]): ParsedLinkedInRecord[] => {
  const lower = fileName.toLowerCase();
  if (lower.includes('position') || lower.includes('experience')) {
    return rows.map((row) => makeRecord({
      type: 'experience',
      source: 'linkedin_import',
      title: first(row, ['Title', 'Role', 'Position']) ?? 'LinkedIn experience',
      company_name: first(row, ['Company Name', 'Company']),
      location: first(row, ['Location']),
      description: first(row, ['Description']),
      start_date: toDate([first(row, ['Started On']), first(row, ['Start Date'])].find(Boolean)),
      end_date: toDate([first(row, ['Finished On']), first(row, ['End Date'])].find(Boolean), '12'),
      is_current: !first(row, ['Finished On', 'End Date']),
    }));
  }
  if (lower.includes('education')) {
    return rows.map((row) => makeRecord({
      type: 'education',
      source: 'linkedin_import',
      title: first(row, ['Degree Name', 'Degree']) ?? first(row, ['School Name', 'School']) ?? 'LinkedIn education',
      degree: first(row, ['Degree Name', 'Degree']),
      field_of_study: first(row, ['Field Of Study', 'Field of Study']),
      institution_name: first(row, ['School Name', 'School']),
      description: first(row, ['Notes', 'Description']),
      start_date: toDate(first(row, ['Start Date', 'Started On'])),
      end_date: toDate(first(row, ['End Date', 'Finished On']), '06'),
    }));
  }
  if (lower.includes('skill')) {
    return rows.map((row) => {
      const skill = first(row, ['Name', 'Skill Name', 'Skill']) ?? 'LinkedIn skill';
      return makeRecord({
        type: 'skill',
        source: 'linkedin_import',
        title: skill,
        skill_name: skill,
      });
    });
  }
  if (lower.includes('certification')) {
    return rows.map((row) => makeRecord({
      type: 'certification',
      source: 'linkedin_import',
      title: first(row, ['Name', 'Certification Name']) ?? 'LinkedIn certification',
      issuing_org: first(row, ['Authority', 'Issuing Organization', 'Issuer']),
      cert_url: first(row, ['Url', 'URL']),
      start_date: toDate(first(row, ['Started On', 'Issue Date'])),
      expiry_date: toDate(first(row, ['Finished On', 'Expiration Date'])),
      no_expiry: !first(row, ['Finished On', 'Expiration Date']),
    }));
  }
  if (lower.includes('project')) {
    return rows.map((row) => makeRecord({
      type: 'project',
      source: 'linkedin_import',
      title: first(row, ['Title', 'Name']) ?? 'LinkedIn project',
      description: first(row, ['Description']),
      project_url: first(row, ['Url', 'URL']),
      start_date: toDate(first(row, ['Started On', 'Start Date'])),
      end_date: toDate(first(row, ['Finished On', 'End Date']), '12'),
    }));
  }
  return [];
};

export const parseLinkedInZip = async (
  buffer: Buffer,
): Promise<{ fileHash: string; records: ParsedLinkedInRecord[]; warnings: string[] }> => {
  if (buffer.length > 15 * 1024 * 1024) {
    throw new ValidationError('LinkedIn ZIP file is too large');
  }

  const zipFile = await fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true });
  const records: ParsedLinkedInRecord[] = [];
  const warnings: string[] = [];
  let entryCount = 0;
  let totalBytes = 0;

  await new Promise<void>((resolve, reject) => {
    zipFile.readEntry();
    zipFile.on('entry', async (entry) => {
      try {
        entryCount++;
        if (entryCount > MAX_ENTRIES) throw new ValidationError('ZIP contains too many files');
        const entryName = normalizeEntryName(entry.fileName);
        if (isSymlink(entry)) throw new ValidationError('ZIP contains an unsafe symlink');
        if (/\/$/.test(entryName)) {
          zipFile.readEntry();
          return;
        }
        if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new ValidationError('ZIP entry is too large');
        totalBytes += entry.uncompressedSize;
        if (totalBytes > MAX_TOTAL_BYTES) throw new ValidationError('ZIP uncompressed size is too large');

        const ext = path.posix.extname(entryName).toLowerCase();
        if (ext !== '.csv' && ext !== '.json') {
          zipFile.readEntry();
          return;
        }

        const content = (await readEntry(zipFile, entry)).toString('utf8');
        if (ext === '.csv') {
          records.push(...mapRows(entryName, parseCsv(content)));
        } else {
          warnings.push(`Skipped JSON file ${entryName}; CSV exports are preferred.`);
        }
        zipFile.readEntry();
      } catch (error) {
        reject(error);
      }
    });
    zipFile.on('end', resolve);
    zipFile.on('error', reject);
  });

  if (records.length === 0) {
    throw new ValidationError('No supported LinkedIn export records were found in the ZIP');
  }

  return {
    fileHash: sha256(buffer),
    records,
    warnings,
  };
};

