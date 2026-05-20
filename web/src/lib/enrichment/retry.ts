/**
 * Retry with exponential backoff per PRD R4.9.
 *
 * Backoff schedule: 1s, 4s, 16s, then mark failed_retryable.
 * Rate limit handling: respect Retry-After headers.
 * Failure logging.
 */

/** Backoff delays in milliseconds (1s, 4s, 16s) per R4.9 */
export const BACKOFF_DELAYS_MS = [1_000, 4_000, 16_000] as const;

/** Maximum retry attempts before marking failed_retryable */
export const MAX_RETRIES = BACKOFF_DELAYS_MS.length;

export interface RetryOptions {
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Custom backoff delays in ms (default: [1000, 4000, 16000]) */
  backoffDelays?: readonly number[];
  /** Called on each retry attempt for logging */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  /** Called when all retries exhausted */
  onExhausted?: (error: unknown) => void;
}

/** Result of a retry operation */
export type RetryResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; error: unknown; attempts: number; retryable: boolean };

/**
 * Determine whether an error is a rate limit (HTTP 429).
 */
export function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 429;
  }
  return false;
}

/**
 * Extract Retry-After value from an error or response (in milliseconds).
 * Returns null if not present.
 */
export function extractRetryAfterMs(error: unknown): number | null {
  if (error && typeof error === 'object' && 'headers' in error) {
    const headers = (error as { headers: Record<string, string> }).headers;
    const retryAfter = headers?.['retry-after'];
    if (retryAfter) {
      const seconds = parseFloat(retryAfter);
      if (!isNaN(seconds)) return seconds * 1000;
    }
  }
  return null;
}

/**
 * Calculate backoff delay for a given attempt (0-indexed).
 * Uses the configured backoff schedule or falls back to the default.
 */
export function getBackoffDelay(
  attempt: number,
  backoffDelays: readonly number[] = BACKOFF_DELAYS_MS,
): number {
  if (attempt < 0) return backoffDelays[0];
  if (attempt >= backoffDelays.length) return backoffDelays[backoffDelays.length - 1];
  return backoffDelays[attempt];
}

/**
 * Sleep for a given number of milliseconds.
 * Extracted for testability.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async function with retry and exponential backoff.
 *
 * Per R4.9: retries at 1s, 4s, 16s, then marks failed_retryable.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const {
    maxRetries = MAX_RETRIES,
    backoffDelays = BACKOFF_DELAYS_MS,
    onRetry,
    onExhausted,
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const value = await fn();
      return { ok: true, value, attempts: attempt + 1 };
    } catch (error) {
      if (attempt >= maxRetries) {
        onExhausted?.(error);
        return { ok: false, error, attempts: attempt + 1, retryable: true };
      }

      // Determine delay: prefer Retry-After for rate limits, else use backoff schedule
      let delayMs = getBackoffDelay(attempt, backoffDelays);
      if (isRateLimitError(error)) {
        const retryAfter = extractRetryAfterMs(error);
        if (retryAfter !== null) {
          delayMs = retryAfter;
        }
      }

      onRetry?.(attempt + 1, error, delayMs);
      await sleep(delayMs);
    }
  }

  // Should not reach here, but satisfy TypeScript
  return { ok: false, error: new Error('Retry loop exited unexpectedly'), attempts: maxRetries + 1, retryable: false };
}
