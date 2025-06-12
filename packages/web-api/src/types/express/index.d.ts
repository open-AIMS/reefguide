import { User as PrismaUser } from '@reefguide/db';

declare global {
  namespace Express {
    // We can't let eslint auto format this line as it breaks TS picking up this
    // override!

    // eslint-disable-next-line
    interface User extends PrismaUser {}
  }
}
