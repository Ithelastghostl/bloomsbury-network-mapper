export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function apiError(code: string, message: string, details?: unknown, status = 400): Response {
  const body: ApiError = { error: { code, message, details } };
  return Response.json(body, { status });
}

export function notFound(message = 'Not found'): Response {
  return apiError('NOT_FOUND', message, undefined, 404);
}

export function forbidden(message = 'Forbidden'): Response {
  return apiError('FORBIDDEN', message, undefined, 403);
}

export function serverError(message = 'Internal server error', details?: unknown): Response {
  return apiError('INTERNAL_ERROR', message, details, 500);
}
