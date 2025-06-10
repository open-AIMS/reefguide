import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
} from '@prisma/client/runtime/library';

/**
 * Base class for all custom API exceptions.
 * Extends the built-in Error class and adds status code and cause properties.
 */
export class BaseApiException extends Error {
  statusCode: number;

  cause?: Error;

  constructor(
    message = 'An unexpected error occurred',
    statusCode = 500,
    cause?: Error,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    this.cause = cause;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Exception for resource not found errors (HTTP 404).
 */
export class NotFoundException extends BaseApiException {
  constructor(message = 'Resource not found', cause?: Error) {
    super(message, 404, cause);
  }
}

/**
 * Exception for internal server errors (HTTP 500).
 */
export class InternalServerError extends BaseApiException {
  constructor(message = 'Internal server error', cause?: Error) {
    super(message, 500, cause);
  }
}

/**
 * Exception for bad request errors (HTTP 400).
 */
export class BadRequestException extends BaseApiException {
  constructor(message = 'Bad request', cause?: Error) {
    super(message, 400, cause);
  }
}

/**
 * Exception for unauthorized access errors (HTTP 401).
 */
export class UnauthorizedException extends BaseApiException {
  constructor(message = 'Unauthorized', cause?: Error) {
    super(message, 401, cause);
  }
}

/**
 * Exception for forbidden access errors (HTTP 403).
 */
export class ForbiddenException extends BaseApiException {
  constructor(message = 'Forbidden', cause?: Error) {
    super(message, 403, cause); // Fixed status code from 401 to 403
  }
}

/**
 * Base class for refresh token related exceptions.
 */
export class RefreshTokenException extends UnauthorizedException {
  constructor(message = 'Invalid refresh token', cause?: Error) {
    super(message, cause);
  }
}

/**
 * Exception for expired refresh tokens.
 */
export class ExpiredRefreshTokenException extends RefreshTokenException {
  constructor(message = 'Refresh token has expired', cause?: Error) {
    super(message, cause);
  }
}

/**
 * Exception for invalid (e.g., revoked or malformed) refresh tokens.
 */
export class InvalidRefreshTokenException extends RefreshTokenException {
  constructor(message = 'Refresh token is invalid', cause?: Error) {
    super(message, cause);
  }
}

/**
 * Handles Prisma errors and converts them to appropriate specialised exceptions.
 *
 * Error codes reference:
 * P2001: Record does not exist
 * P2002: Unique constraint violation
 * P2025: Record not found
 *
 * @see https://www.prisma.io/docs/reference/api-reference/error-reference
 *
 * @param error - The caught Prisma error
 * @param context - Additional context about the operation being performed
 * @returns Never - Always throws an appropriate API exception
 * @throws {BadRequestException} For client-side errors (invalid input, not found)
 * @throws {InternalServerError} For server-side errors (DB issues)
 */
export function handlePrismaError(
  error: unknown,
  context = 'Database operation failed',
): never {
  // Known Prisma errors with error codes
  if (error instanceof PrismaClientKnownRequestError) {
    switch (error.code) {
      // Record searching/filtering errors
      case 'P2001': // Record does not exist
      case 'P2025': // Record not found for operation
        throw new NotFoundException(`Resource not found: ${context}`, error);

      // Constraint violations
      case 'P2002': // Unique constraint violation
        throw new BadRequestException(
          `Resource already exists: ${context}`,
          error,
        );

      // Other known errors - treated as server errors
      default:
        throw new InternalServerError(`Database error: ${context}`, error);
    }
  }

  // Validation errors (e.g., invalid data types, missing required fields)
  if (error instanceof PrismaClientValidationError) {
    throw new BadRequestException(`Invalid input: ${context}`, error);
  }

  // Unknown Prisma errors
  if (error instanceof PrismaClientUnknownRequestError) {
    throw new InternalServerError(
      `Unexpected database error: ${context}`,
      error,
    );
  }

  // Unexpected errors (non-Prisma)
  throw new InternalServerError(`Unexpected error: ${context}`, error as Error);
}
