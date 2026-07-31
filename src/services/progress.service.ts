export interface PipelineProgressEvent {
  type: 'pipeline_progress';
  operationId: string;
  pipelineType: string;
  stage: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress?: number;
  message: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

export const emitProgress = (
  userId: string,
  event: Omit<PipelineProgressEvent, 'type' | 'timestamp'>,
): void => {
  try {
    global.wsEmitToUser?.(userId, {
      type: 'pipeline_progress',
      ...event,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Realtime progress is best effort; polling remains the fallback.
  }
};

