import { getIdempotencyKey, getCachedResponse, cacheResponse } from './idempotency';

export function withIdempotency<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>
): (request: Request, ...args: Args) => Promise<Response> {
  return async (request: Request, ...args: Args) => {
    const key = getIdempotencyKey(request);
    if (key) {
      const cached = getCachedResponse(key);
      if (cached) return cached;
    }

    const response = await handler(request, ...args);

    if (key) {
      const cloned = response.clone();
      const body = await cloned.json();
      cacheResponse(key, body, response.status);
    }

    return response;
  };
}
