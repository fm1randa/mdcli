/**
 * A failed API response. `message` is still `errorApiRequestFailed`, so callers
 * that only read `error.message` behave as before. `body` is parsed JSON when
 * the response is JSON, the raw text otherwise, so a 422 can be translated
 * without a second request path.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** JSON when the body parses, the raw text when it does not, null when empty. */
export function parseErrorBody(text: string): unknown {
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
