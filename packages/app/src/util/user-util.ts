import { UserRole } from '@reefguide/db';

// Note: ideally would put in @reefguide db or types, but caused import issue with
//  prisma being pulled into the app build

/**
 * All user roles from most privileged to least.
 */
export const ALL_USER_ROLES: UserRole[] = ['ADMIN', 'ANALYST', 'DEFAULT'];
