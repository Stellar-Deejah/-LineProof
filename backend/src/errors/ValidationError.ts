import { HttpError } from './HttpError.js';

export class ValidationError extends HttpError {
  constructor(message = 'Invalid request', details?: Record<string, unknown>) {
    super(400, message, details);
  }
}
