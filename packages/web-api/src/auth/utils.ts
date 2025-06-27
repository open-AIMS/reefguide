import { prisma, RefreshToken, UserRole } from '@reefguide/db';
import { RefreshTokenContents, RefreshTokenContentsSchema } from '@reefguide/types';
import { NextFunction } from 'express';
import { z } from 'zod';
import {
  ExpiredRefreshTokenException,
  InvalidRefreshTokenException,
  UnauthorizedException
} from '../exceptions';

/**
 * is the user an admin?
 * @param user The user to check
 * @returns True iff user is admin
 */
export const userIsAdmin = (user: Express.User): boolean => {
  return user.roles.includes('ADMIN');
};

/**
 * Base64 encodes a string
 * @param key The key string to encode
 * @returns Base64 encoding
 */
export const base64encode = (key: string): string => {
  return Buffer.from(key).toString('base64');
};

/**
 * Converts a Base64-encoded string back to a regular string
 * @param input The Base64-encoded string
 * @returns Decoded string
 */
const base64Decode = (input: string): string => {
  return Buffer.from(input, 'base64').toString('utf-8');
};

/**
 * B64 encodes in the input refresh token contents
 * @param input The input refresh token contents object
 * @returns B64 encoded version
 */
export const encodeRefreshToken = (input: RefreshTokenContents): string => {
  return base64encode(JSON.stringify(input));
};

/**
 * B64 decodes and validates the encoded refresh token content
 * @param input The input refresh encoded token contents
 * @returns Decoded refresh token contents
 * @throws Error if the input is invalid or doesn't match the expected schema
 */
export const decodeRefreshToken = (input: string): RefreshTokenContents => {
  try {
    // Decode the Base64 string
    const decodedString = base64Decode(input);

    // Parse the JSON string
    const parsedObject = JSON.parse(decodedString);

    // Validate the object against the schema
    const validatedObject = RefreshTokenContentsSchema.parse(parsedObject);

    return validatedObject;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new InvalidRefreshTokenException('Invalid refresh token format');
    } else if (error instanceof SyntaxError) {
      throw new InvalidRefreshTokenException('Invalid JSON in refresh token');
    } else {
      throw new InvalidRefreshTokenException('Failed to decode refresh token');
    }
  }
};

/**
 * Finds the refresh token object.
 * @param token Fetches the refresh token object
 * @error If the token does not match/exist
 */
export const getRefreshTokenObject = async (token: RefreshTokenContents) => {
  try {
    return await prisma.refreshToken.findUniqueOrThrow({
      where: { id: token.id, token: token.token },
      include: { user: true }
    });
  } catch {
    throw new InvalidRefreshTokenException();
  }
};

/**
 * Validates that a RefreshToken object from the DB is suitable to be used.
 * Checks the expiry time and valid field.
 *
 * @param refreshToken The RefreshToken object from the database
 * @returns true if the token is valid and not expired, false otherwise
 * @error Returns special exceptions depending on error type
 */
export const isRefreshTokenValid = (refreshToken: RefreshToken): boolean => {
  // Check if the token is marked as valid in the database
  if (!refreshToken.valid) {
    throw new InvalidRefreshTokenException();
  }

  // Get the current timestamp in seconds
  const currentTimestamp = Math.floor(Date.now() / 1000);

  // Check if the token has expired
  if (refreshToken.expiry_time <= currentTimestamp) {
    throw new ExpiredRefreshTokenException();
  }

  // If we've passed all checks, the token is valid
  return true;
};

/**
 * Checks that the user is an admin (ADMIN role)
 *
 * NOTE: must be ran after the passport auth middleware (so that req.user is
 * populated)
 * @param req Express req
 * @param res Express res
 * @param next next function
 */
export const assertUserIsAdminMiddleware = (
  req: Express.Request,
  _res: Express.Response,
  next: NextFunction
) => {
  if (!req.user) {
    throw new UnauthorizedException('Unauthenticated.');
  }

  if (!userIsAdmin(req.user)) {
    throw new UnauthorizedException('You are not authorised to access this service.');
  }

  next();
};

/**
 * Checks the user has at least one of the specified roles.
 *
 * By default, admin will always make this return true, unless you make
 * grantedByAdmin = false.
 *
 * @param sufficientRoles List of roles that will make this pass
 * @param grantedByAdmin By default, admin will grant anything- disable this if
 * you want it to be ignored
 *
 * Generates a middleware as follows: NOTE: must be ran after the passport auth
 * middleware (so that req.user is populated)
 * @param req Express req
 * @param res Express res
 * @param next next function
 */
export const assertUserHasRoleMiddleware = ({
  sufficientRoles,
  grantedByAdmin = true
}: {
  sufficientRoles: UserRole[];
  grantedByAdmin?: boolean;
}) => {
  return (req: Express.Request, _res: Express.Response, next: NextFunction) => {
    if (!req.user) {
      throw new UnauthorizedException('Unauthenticated.');
    }

    if (grantedByAdmin && userIsAdmin(req.user)) {
      next();
      return;
    }
    const roles = req.user.roles;

    for (const sufficient of sufficientRoles) {
      if (roles.includes(sufficient)) {
        next();
        return;
      }
    }

    throw new UnauthorizedException('You are not authorised to access this service.');
  };
};
