import { pool } from '../db/client.js';
import { AppError } from '../utils/errors.js';

type CircuitState = 'closed' | 'open' | 'half_open';

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 5 * 60 * 1000;

const categorizeError = (error: unknown): string => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('rate') || message.includes('429')) return 'rate_limit';
  if (message.includes('timeout')) return 'timeout';
  if (message.includes('401') || message.includes('403') || message.includes('auth')) return 'auth';
  if (message.includes('json') || message.includes('empty')) return 'bad_response';
  return 'provider_error';
};

const getCircuit = async (
  provider: string,
  operation: string,
  model: string,
): Promise<{ state: CircuitState; opened_until: Date | null } | null> => {
  const result = await pool.query<{ state: CircuitState; opened_until: Date | null }>(
    `SELECT state, opened_until
     FROM provider_circuit_state
     WHERE provider = $1 AND operation = $2 AND model = $3`,
    [provider, operation, model],
  );
  return result.rows[0] ?? null;
};

export const isCircuitAvailable = async (
  provider: string,
  operation: string,
  model: string,
): Promise<boolean> => {
  try {
    const circuit = await getCircuit(provider, operation, model);
    if (!circuit || circuit.state === 'closed') return true;
    if (circuit.state === 'half_open') return true;
    if (circuit.opened_until && circuit.opened_until.getTime() <= Date.now()) {
      await pool.query(
        `UPDATE provider_circuit_state SET state = 'half_open' WHERE provider = $1 AND operation = $2 AND model = $3`,
        [provider, operation, model],
      );
      return true;
    }
    return false;
  } catch {
    return true;
  }
};

export const recordProviderSuccess = async (
  provider: string,
  operation: string,
  model: string,
): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO provider_circuit_state (provider, operation, model, state, failure_count)
       VALUES ($1,$2,$3,'closed',0)
       ON CONFLICT (provider, operation, model) DO UPDATE SET
         state = 'closed',
         failure_count = 0,
         opened_until = NULL,
         last_failure_category = NULL,
         last_error_message = NULL`,
      [provider, operation, model],
    );
  } catch {
    // Circuit telemetry should not break the successful provider call.
  }
};

export const recordProviderFailure = async (
  provider: string,
  operation: string,
  model: string,
  error: unknown,
): Promise<string> => {
  const category = categorizeError(error);
  const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
  try {
    await pool.query(
      `INSERT INTO provider_circuit_state (
         provider, operation, model, state, failure_count,
         opened_until, last_failure_category, last_error_message
       )
       VALUES ($1,$2,$3,'closed',1,NULL,$4,$5)
       ON CONFLICT (provider, operation, model) DO UPDATE SET
         failure_count = provider_circuit_state.failure_count + 1,
         state = CASE
           WHEN provider_circuit_state.failure_count + 1 >= $6 THEN 'open'
           ELSE provider_circuit_state.state
         END,
         opened_until = CASE
           WHEN provider_circuit_state.failure_count + 1 >= $6 THEN NOW() + ($7 || ' milliseconds')::interval
           ELSE provider_circuit_state.opened_until
         END,
         last_failure_category = $4,
         last_error_message = $5`,
      [provider, operation, model, category, message, FAILURE_THRESHOLD, COOLDOWN_MS],
    );
  } catch {
    // ignore
  }
  return category;
};

export const withCircuitBreaker = async <T>(
  input: {
    provider: string;
    operation: string;
    model: string;
    fallbackLabel?: string;
  },
  fn: () => Promise<T>,
): Promise<T> => {
  const available = await isCircuitAvailable(input.provider, input.operation, input.model);
  if (!available) {
    throw new AppError('AI provider is temporarily unavailable. A fallback provider will be used when configured.', 503, 'PROVIDER_CIRCUIT_OPEN');
  }

  try {
    const result = await fn();
    await recordProviderSuccess(input.provider, input.operation, input.model);
    return result;
  } catch (error) {
    await recordProviderFailure(input.provider, input.operation, input.model, error);
    throw error;
  }
};

