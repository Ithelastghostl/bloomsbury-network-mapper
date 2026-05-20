const cache = new Map<string, { response: unknown; status: number; expiresAt: number }>();

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getIdempotencyKey(request: Request): string | null {
  return request.headers.get('idempotency-key');
}

export function getCachedResponse(key: string): Response | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return Response.json(entry.response, { status: entry.status });
}

export function cacheResponse(key: string, body: unknown, status: number): void {
  cache.set(key, { response: body, status, expiresAt: Date.now() + TTL_MS });
}
