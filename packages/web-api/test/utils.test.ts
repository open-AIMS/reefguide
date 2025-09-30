import { decodeRefreshToken, encodeRefreshToken } from '../src/auth/utils';
import { InvalidRefreshTokenException } from '../src/exceptions';

describe('Utility', () => {
  describe('Refresh Token Utilities', () => {
    it('should correctly encode and decode refresh tokens', () => {
      const originalToken = { id: 1, token: 'test-token' };
      const decodedToken = decodeRefreshToken(encodeRefreshToken(originalToken));
      expect(decodedToken).toEqual(originalToken);
    });

    it('should throw an error for invalid refresh token format', () => {
      const invalidToken = 'invalid-token-format';
      expect(() => decodeRefreshToken(invalidToken)).toThrow(InvalidRefreshTokenException);
    });
  });
});
