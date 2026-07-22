import { HttpError } from './HttpError.js';

export class ConflictError extends HttpError {
  constructor(message = 'Conflict', details?: Record<string, unknown>) {
    super(409, message, details);
  }
}
