import { HttpError } from './HttpError.js';

export class NotFoundError extends HttpError {
  constructor(message = 'Not found', details?: Record<string, unknown>) {
    super(404, message, details);
  }
}
