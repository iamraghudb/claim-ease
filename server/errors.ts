/** An error we want the browser to see, with the HTTP status to send. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Anything that is not already an HttpError becomes a generic 500 (provider adapters map their own errors). */
export function toHttpError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  return new HttpError(500, e instanceof Error ? e.message : 'Unexpected server error');
}
