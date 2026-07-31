import { pool } from '../../db/client.js';
import { AppError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { createPortfolioItem } from '../portfolio/portfolio.service.js';
import { parseLinkedInZip } from './linkedin-parser.service.js';
import type { ApplyLinkedInImportInput } from './linkedin-import.schema.js';

export const uploadLinkedInImport = async (
  userId: string,
  buffer: Buffer,
  filename: string,
) => {
  const parsed = await parseLinkedInZip(buffer);

  const batchResult = await pool.query<{ id: string }>(
    `INSERT INTO linkedin_import_batches (
       user_id, original_filename, file_size, file_hash, status, validation_errors, parsed_summary
     )
     VALUES ($1,$2,$3,$4,'preview_ready',$5,$6)
     ON CONFLICT (user_id, file_hash) DO UPDATE SET
       status = 'preview_ready',
       validation_errors = EXCLUDED.validation_errors,
       parsed_summary = EXCLUDED.parsed_summary
     RETURNING id`,
    [
      userId,
      filename,
      buffer.length,
      parsed.fileHash,
      JSON.stringify(parsed.warnings),
      JSON.stringify({
        totalRecords: parsed.records.length,
        byType: parsed.records.reduce<Record<string, number>>((acc, record) => {
          acc[record.recordType] = (acc[record.recordType] ?? 0) + 1;
          return acc;
        }, {}),
      }),
    ],
  );
  const batchId = batchResult.rows[0]?.id;
  if (!batchId) throw new AppError('Failed to create LinkedIn import batch', 500);

  await pool.query(`DELETE FROM linkedin_import_records WHERE batch_id = $1`, [batchId]);

  for (const record of parsed.records) {
    const duplicate = await pool.query<{ id: string }>(
      `SELECT id
       FROM portfolio_items
       WHERE user_id = $1
         AND type = $2
         AND lower(title) = lower($3)
       LIMIT 1`,
      [userId, record.recordType, record.data.title],
    );
    await pool.query(
      `INSERT INTO linkedin_import_records (
         batch_id, user_id, record_type, normalized_hash, normalized_data,
         duplicate_portfolio_item_id, status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        batchId,
        userId,
        record.recordType,
        record.normalizedHash,
        JSON.stringify(record.data),
        duplicate.rows[0]?.id ?? null,
        duplicate.rows[0] ? 'skipped_duplicate' : 'preview',
      ],
    );
  }

  return getLinkedInImportBatch(userId, batchId);
};

export const getLinkedInImportBatch = async (userId: string, batchId: string) => {
  const batchResult = await pool.query(
    `SELECT *
     FROM linkedin_import_batches
     WHERE id = $1 AND user_id = $2`,
    [batchId, userId],
  );
  const batch = batchResult.rows[0];
  if (!batch) throw new NotFoundError('LinkedIn import batch not found');

  const records = await pool.query(
    `SELECT *
     FROM linkedin_import_records
     WHERE batch_id = $1 AND user_id = $2
     ORDER BY created_at ASC`,
    [batchId, userId],
  );

  return { batch, records: records.rows };
};

export const applyLinkedInImport = async (
  userId: string,
  batchId: string,
  input: ApplyLinkedInImportInput,
) => {
  const batch = await pool.query<{ id: string; user_id: string; status: string }>(
    `SELECT id, user_id, status FROM linkedin_import_batches WHERE id = $1`,
    [batchId],
  );
  const batchRow = batch.rows[0];
  if (!batchRow) throw new NotFoundError('LinkedIn import batch not found');
  if (batchRow.user_id !== userId) throw new ForbiddenError('LinkedIn import batch does not belong to the current user');

  const records = await pool.query<{
    id: string;
    normalized_data: Record<string, unknown>;
    duplicate_portfolio_item_id: string | null;
  }>(
    `SELECT id, normalized_data, duplicate_portfolio_item_id
     FROM linkedin_import_records
     WHERE batch_id = $1 AND user_id = $2 AND id = ANY($3::uuid[])`,
    [batchId, userId, input.recordIds],
  );

  const created: string[] = [];
  const skippedDuplicates: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const record of records.rows) {
    if (record.duplicate_portfolio_item_id) {
      skippedDuplicates.push(record.id);
      await pool.query(
        `UPDATE linkedin_import_records SET status = 'skipped_duplicate' WHERE id = $1`,
        [record.id],
      );
      continue;
    }

    try {
      const item = await createPortfolioItem(userId, record.normalized_data as never);
      created.push(item.id);
      await pool.query(
        `UPDATE linkedin_import_records
         SET status = 'applied', created_portfolio_item_id = $2
         WHERE id = $1`,
        [record.id, item.id],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ id: record.id, error: message });
      await pool.query(
        `UPDATE linkedin_import_records SET status = 'failed', error_message = $2 WHERE id = $1`,
        [record.id, message.slice(0, 500)],
      );
    }
  }

  await pool.query(
    `UPDATE linkedin_import_batches
     SET status = 'applied', applied_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [batchId, userId],
  );

  return {
    createdCount: created.length,
    skippedDuplicateCount: skippedDuplicates.length,
    failedCount: failed.length,
    created,
    skippedDuplicates,
    failed,
  };
};

export const discardLinkedInImport = async (userId: string, batchId: string): Promise<void> => {
  const result = await pool.query(
    `UPDATE linkedin_import_batches
     SET status = 'discarded'
     WHERE id = $1 AND user_id = $2`,
    [batchId, userId],
  );
  if (result.rowCount === 0) throw new NotFoundError('LinkedIn import batch not found');
};

