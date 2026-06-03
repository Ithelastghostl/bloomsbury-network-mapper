import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let adminClient: SupabaseClient<any, 'app'> | null = null;

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;

/**
 * A fetch wrapper that bounds every Supabase request with a timeout and retries
 * transient network failures. Without this, an unreachable Supabase host makes
 * supabase-js hang until the platform's (long) socket timeout, which is what
 * turned flaky connectivity into 30s+ page loads. Now a dead request aborts in
 * ~8s and is retried with backoff before giving up.
 */
const resilientFetch: typeof fetch = async (input, init) => {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      lastErr = err;
      // Don't retry if the caller aborted, or after the final attempt.
      if (init?.signal?.aborted || attempt === MAX_RETRIES) break;
      await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
};

export function getAdminClient() {
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { db: { schema: 'app' as const }, global: { fetch: resilientFetch } } as any,
    );
  }
  return adminClient;
}
