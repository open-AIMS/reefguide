import {NextFunction, Request, Response} from 'express';
import {BaseApiException} from './exceptions';
import {ErrorResponse} from './types/errors';

/**
 * Error middleware to handle custom API exceptions.
 * Extracts status code and message from the exception and returns a JSON error response.
 */
export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (process.env.TEST_MODE !== 'true') {
    console.error('Error details:');

    // Log the complete error chain
    let currentError: Error | undefined = err;
    while (currentError) {
      console.error(`\nError: ${currentError.name}`);
      console.error(`Message: ${currentError.message}`);
      console.error('Stack:', currentError.stack);

      // Move to the cause if it exists
      currentError = (currentError as any).cause;
      if (currentError) {
        console.error('\nCaused by:');
      }
    }
  }

  let statusCode = 500;
  let message = 'An unexpected error occurred';

  if (err instanceof BaseApiException) {
    statusCode = err.statusCode;
    message = err.message;
  }

  const errorResponse: ErrorResponse = {
    status: statusCode,
    message: message,
  };

  res.status(statusCode).json(errorResponse);
}
