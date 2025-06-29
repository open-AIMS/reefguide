import { prisma } from '@reefguide/db';
import { JwtContents, RefreshTokenContents } from '@reefguide/types';
import { randomUUID } from 'crypto';
import jwt, { Algorithm } from 'jsonwebtoken';
import { config, REFRESH_DURATION_SECONDS, TOKEN_EXPIRY } from '../config';
import { base64encode, encodeRefreshToken } from './utils';

// Key signing and validation parameters
const PRIVATE_KEY: jwt.Secret = config.jwt.privateKey;
export const PUBLIC_KEY = config.jwt.publicKey;
const KEY_ID = config.jwt.keyId;
const ISSUER = config.apiDomain;
export const ALGORITHM: Algorithm = 'RS256';
const KEY_TYPE = 'RSA';
const KEY_USE = 'sig';
const KEY_EXPONENT = 'AQAB';

/**
 * Signs a JWT with the given payload.
 * @param {JwtContents} payload - The payload to be included in the JWT.
 * @returns {string} The signed JWT string.
 */
export function signJwt(
  payload: JwtContents,
  options: { expiresIn: number } = { expiresIn: TOKEN_EXPIRY }
): string {
  return jwt.sign(payload, PRIVATE_KEY, {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    keyid: KEY_ID,
    header: { alg: ALGORITHM, kid: KEY_ID },
    expiresIn: options.expiresIn
  });
}

/**
 * Verifies a JWT and returns the decoded payload.
 * @param {string} token - The JWT string to verify.
 * @returns {jwt.JwtPayload} The decoded JWT payload.
 * @throws {jwt.JsonWebTokenError} If the token is invalid.
 */
export function verifyJwt(token: string): jwt.JwtPayload {
  return jwt.verify(token, PUBLIC_KEY, {
    algorithms: [ALGORITHM],
    issuer: ISSUER
  }) as jwt.JwtPayload;
}

/**
 * Generates a JSON Web Key Set (JWKS) containing the public key information.
 * @returns {object} An object representing the JWKS.
 */
export function getJwks() {
  return {
    keys: [
      {
        kty: KEY_TYPE,
        use: KEY_USE, // Key Usage: Signature
        alg: ALGORITHM, // Algorithm: RSA with SHA-256
        kid: KEY_ID, // Key ID
        n: base64encode(PUBLIC_KEY), // Modulus (base64 encoded)
        e: KEY_EXPONENT // Exponent (65537 in base64)
      }
    ]
  };
}

/**
 * A refresh token is a base64 encoded JSON object which includes the following
 * fields {id: number, token: string}. This relates to the RefreshToken DB
 * object where the ID is the DB id of the refresh token and the token is the
 * token field. This guarantees the token is unique within the DB while also
 * being impossible to guess. This method creates the new object, generates the
 * payload and returns the b64 encoded JSON object.
 * @param {number} user_id - The DB id of the user to create refresh token for.
 * @returns {string} Base64 encoded JSON object.
 */
export const generateRefreshToken = async (user_id: number): Promise<string> => {
  // Generate a random UUID
  const randString = randomUUID();

  const expiryTimestampSeconds = Math.floor(Date.now() / 1000) + REFRESH_DURATION_SECONDS;

  // Create a new RefreshToken in the database
  const refreshToken = await prisma.refreshToken.create({
    data: {
      token: randString,
      user_id: user_id,
      expiry_time: expiryTimestampSeconds
    }
  });

  // Create the payload object
  const payload = {
    id: refreshToken.id,
    token: refreshToken.token
  } as RefreshTokenContents;

  // Encode the payload as a base64 string
  return encodeRefreshToken(payload);
};
