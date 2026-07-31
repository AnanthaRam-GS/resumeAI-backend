import { pool } from '../db/client.js';

export interface PipelineTraceInput {
  userId?: string | null;
  pipelineType: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  operationId?: string | null;
  provider?: string | null;
  model?: string | null;
}

export const startPipelineTrace = async (input: PipelineTraceInput): Promise<string | null> => {
  try {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO pipeline_traces (
         user_id, pipeline_type, related_entity_type, related_entity_id,
         operation_id, provider, model, terminal_status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,'started')
       RETURNING id`,
      [
        input.userId ?? null,
        input.pipelineType,
        input.relatedEntityType ?? null,
        input.relatedEntityId ?? null,
        input.operationId ?? null,
        input.provider ?? null,
        input.model ?? null,
      ],
    );
    return result.rows[0]?.id ?? null;
  } catch {
    return null;
  }
};

export const appendTraceStage = async (
  traceId: string | null,
  stage: Record<string, unknown>,
): Promise<void> => {
  if (!traceId) return;
  try {
    await pool.query(
      `UPDATE pipeline_traces
       SET stages = stages || $2::jsonb
       WHERE id = $1`,
      [traceId, JSON.stringify([{ ...stage, timestamp: new Date().toISOString() }])],
    );
  } catch {
    // Observability must not break product flows.
  }
};

export const completePipelineTrace = async (
  traceId: string | null,
  input: {
    terminalStatus: 'completed' | 'failed';
    latencyMs?: number;
    retryAttempts?: number;
    fallbackTriggered?: boolean;
    usageInfo?: Record<string, unknown>;
    safeErrorCategory?: string | null;
  },
): Promise<void> => {
  if (!traceId) return;
  try {
    await pool.query(
      `UPDATE pipeline_traces
       SET terminal_status = $2,
           latency_ms = COALESCE($3, latency_ms),
           retry_attempts = COALESCE($4, retry_attempts),
           fallback_triggered = COALESCE($5, fallback_triggered),
           usage_info = COALESCE($6, usage_info),
           safe_error_category = $7
       WHERE id = $1`,
      [
        traceId,
        input.terminalStatus,
        input.latencyMs ?? null,
        input.retryAttempts ?? null,
        input.fallbackTriggered ?? null,
        input.usageInfo ? JSON.stringify(input.usageInfo) : null,
        input.safeErrorCategory ?? null,
      ],
    );
  } catch {
    // Observability must not break product flows.
  }
};

