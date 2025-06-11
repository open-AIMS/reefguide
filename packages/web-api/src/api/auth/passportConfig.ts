import passport from 'passport';
import { ExtractJwt, Strategy as JwtStrategy, StrategyOptions } from 'passport-jwt';
import { prisma } from '../apiSetup';
import { ALGORITHM as KEY_ALGORITHM, PUBLIC_KEY } from './jwtUtils';

/**
 * Options for configuring the JWT strategy
 * @typedef {Object} JwtStrategyOptions
 * @property {Function} jwtFromRequest - Function to extract JWT from the request
 * @property {string} secretOrKey - Secret key to verify the token
 */
const options: StrategyOptions = {
  /**
   * Extract the JWT from the 'Authorization' header with the 'bearer' scheme
   */
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

  /**
   * Public key for verifying the token's signature
   */
  secretOrKey: PUBLIC_KEY,

  // Indicate we are using RS256 which is the algorithm for the asymmetric key
  // pair
  algorithms: [KEY_ALGORITHM]
};

/**
 * Configure Passport to use JWT Strategy. This strategy is used to authenticate
 * users based on the JWT submitted with the request
 */
passport.use(
  new JwtStrategy(options, async (jwtPayload: any, done: any) => {
    try {
      // Attempt to find a user that matches the ID in the JWT payload
      const user = await prisma.user.findUnique({
        where: { id: jwtPayload.id },
        // Modify fields to include in the express returned user object here -
        // these will be available in req.user object through middleware
        select: { password: false, id: true, email: true, roles: true }
      });

      if (user) {
        // If user is found, pass it to the `done` callback
        return done(null, user);
      } else {
        // If no user is found, pass `false` to the `done` callback
        return done(null, false);
      }
    } catch (error) {
      // If an error occurred, pass it to the `done` callback
      return done(error, false);
    }
  })
);

// Export the configured Passport instance
export { passport };
