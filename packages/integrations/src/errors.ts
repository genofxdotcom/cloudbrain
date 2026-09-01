/**
 * Normalized errors for the Composio boundary.
 * Raw provider failures must never leak credentials — messages are sanitized.
 */

export type ComposioErrorKind =
  | 'not_configured'      // BYOK key missing
  | 'auth'                // 401/403 — bad/expired operator key
  | 'rate_limit'          // 429
  | 'not_found'
  | 'connection'          // connected-account problems
  | 'validation'          // bad input to an action
  | 'provider'            // 5xx / network
  | 'timeout'
  | 'unknown';

export class ComposioError extends Error {
  readonly kind: ComposioErrorKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(kind: ComposioErrorKind, message: string, opts?: { status?: number; cause?: unknown }) {
    super(message, opts?.cause ? { cause: opts.cause } : undefined);
    this.name = 'ComposioError';
    this.kind = kind;
    this.status = opts?.status;
    this.retryable = kind === 'rate_limit' || kind === 'provider' || kind === 'timeout';
  }
}

export function toComposioError(status: number, bodyText: string): ComposioError {
  // Never surface raw provider bodies that may echo credentials.
  const safe = bodyText.length > 400 ? bodyText.slice(0, 400) + '…' : bodyText;
  if (status === 401 || status === 403) {
    return new ComposioError('auth', 'Composio rejected the operator API key (check COMPOSIO_API_KEY).', { status });
  }
  if (status === 429) {
    return new ComposioError('rate_limit', 'Composio rate limit reached. Retry shortly.', { status });
  }
  if (status === 404) {
    return new ComposioError('not_found', 'Composio resource not found.', { status });
  }
  if (status === 400 || status === 422) {
    return new ComposioError('validation', `Composio rejected the request: ${safe}`, { status });
  }
  if (status >= 500) {
    return new ComposioError('provider', `Composio provider error (HTTP ${status}).`, { status });
  }
  return new ComposioError('unknown', `Composio request failed (HTTP ${status}): ${safe}`, { status });
}
