/**
 * Base class for operational HTTP errors. Thrown from route handlers and
 * caught by `errorHandler`, which reads `status` and spreads `details` into
 * the response body — this is what lets every error (validation, not-found,
 * conflict, ...) share one response shape instead of routes hand-rolling
 * their own `res.json({ message })` calls.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
