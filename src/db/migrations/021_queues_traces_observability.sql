-- 021: Queue diagnostics, AI provider circuit state, and pipeline traces.

CREATE TABLE IF NOT EXISTS pipeline_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  pipeline_type TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id UUID,
  operation_id TEXT,
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider TEXT,
  model TEXT,
  latency_ms INT,
  retry_attempts INT NOT NULL DEFAULT 0,
  fallback_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  usage_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  terminal_status TEXT NOT NULL DEFAULT 'started'
    CHECK (terminal_status IN ('started', 'completed', 'failed')),
  safe_error_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pipeline_traces_user_created_idx
  ON pipeline_traces(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pipeline_traces_type_created_idx
  ON pipeline_traces(pipeline_type, created_at DESC);

DROP TRIGGER IF EXISTS pipeline_traces_set_updated_at ON pipeline_traces;
CREATE TRIGGER pipeline_traces_set_updated_at
BEFORE UPDATE ON pipeline_traces
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();

CREATE TABLE IF NOT EXISTS provider_circuit_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  model TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'closed'
    CHECK (state IN ('closed', 'open', 'half_open')),
  failure_count INT NOT NULL DEFAULT 0,
  opened_until TIMESTAMPTZ,
  last_failure_category TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, operation, model)
);

DROP TRIGGER IF EXISTS provider_circuit_state_set_updated_at ON provider_circuit_state;
CREATE TRIGGER provider_circuit_state_set_updated_at
BEFORE UPDATE ON provider_circuit_state
FOR EACH ROW
EXECUTE FUNCTION resumeai_set_updated_at();

CREATE TABLE IF NOT EXISTS queue_job_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,
  job_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  operation_id TEXT,
  status TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  payload_hash TEXT,
  error_category TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(queue_name, job_id)
);

CREATE INDEX IF NOT EXISTS queue_job_diagnostics_queue_status_idx
  ON queue_job_diagnostics(queue_name, status);
