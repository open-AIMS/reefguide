import { prisma } from '@reefguide/db';
import { config } from './config';
import { registerUser } from './services/auth';

/**
 * Initializes or verifies admin users in the system.
 *
 * This function ensures that all required administrative users (manager, worker, and admin)
 * exist in the system with the correct roles and credentials. For each required admin user,
 * it will:
 * 1. Check if the user already exists
 * 2. Create the user if they don't exist
 * 3. Verify/update admin roles for existing users
 * 4. Verify successful creation/update
 */
export const initialiseAdmins = async () => {
  console.debug('=== initialiseAdmins START ===');

  console.debug('Config check:', {
    hasConfig: !!config,
    hasCreds: !!config?.creds,
    managerCreds: {
      hasUsername: !!config?.creds?.managerUsername,
      hasPassword: !!config?.creds?.managerPassword
    },
    workerCreds: {
      hasUsername: !!config?.creds?.workerUsername,
      hasPassword: !!config?.creds?.workerPassword
    },
    adminCreds: {
      hasUsername: !!config?.creds?.adminUsername,
      hasPassword: !!config?.creds?.adminPassword
    }
  });

  const initialise: { email: string; password: string }[] = [
    {
      email: config.creds.managerUsername,
      password: config.creds.managerPassword
    },
    {
      email: config.creds.workerUsername,
      password: config.creds.workerPassword
    },
    {
      email: config.creds.adminUsername,
      password: config.creds.adminPassword
    }
  ];

  console.debug('Initialising users count:', initialise.length);
  console.debug(
    'Users to initialise:',
    initialise.map(user => ({ email: user.email }))
  );

  for (const { email, password } of initialise) {
    console.debug(`\n=== Processing user: ${email} ===`);

    try {
      // First, try to find the user
      console.debug(`Checking if user exists: ${email}`);
      const existingUser = await prisma.user.findUnique({
        // Changed from findUniqueOrThrow
        where: { email },
        select: {
          // Only select the fields we need
          id: true,
          email: true,
          roles: true
        }
      });

      if (existingUser) {
        console.debug(`User ${email} already exists:`, {
          id: existingUser.id,
          roles: existingUser.roles
        });

        // Optionally, verify and update roles if needed
        if (!existingUser.roles.includes('ADMIN')) {
          console.debug(`Updating user ${email} to include ADMIN role`);
          await prisma.user.update({
            where: { email },
            data: {
              roles: [...existingUser.roles, 'ADMIN']
            }
          });
          console.debug(`Successfully added ADMIN role to ${email}`);
        }
      } else {
        console.debug(`User ${email} not found, creating new user...`);
        const newUser = await registerUser({
          email,
          password,
          roles: ['ADMIN']
        });
        console.log(`Successfully created new admin user: ${email}`, {
          success: !!newUser,
          roles: ['ADMIN']
        });
      }
    } catch (e: any) {
      console.error(`\n!!! Error processing user: ${email} !!!`);
      console.error('Error type:', e.constructor.name);
      console.error('Error message:', e.message);
      console.error('Error stack:', e.stack);
      if (e.code) {
        console.error('Error code:', e.code);
      }
      if (e.meta) {
        console.error('Error metadata:', e.meta);
      }
      // You might want to throw here depending on your requirements
      throw new Error(`Failed to initialize admin user ${email}: ${e.message}`);
    }
  }

  // Final status check
  try {
    const adminUsers = await prisma.user.findMany({
      where: {
        roles: {
          has: 'ADMIN'
        }
      },
      select: {
        email: true,
        roles: true
      }
    });

    console.debug('\n=== Final Admin Users Status ===');
    console.debug('Total admin users:', adminUsers.length);
    console.debug(
      'Admin users:',
      adminUsers.map(user => ({
        email: user.email,
        roles: user.roles
      }))
    );

    // Verify all required admins are present
    const allEmails = adminUsers.map(u => u.email);
    const missingAdmins = initialise.map(u => u.email).filter(email => !allEmails.includes(email));

    if (missingAdmins.length > 0) {
      console.error('Warning: Some admin users are missing:', missingAdmins);
      throw new Error(
        `Failed to initialize all required admin users. Missing: ${missingAdmins.join(', ')}`
      );
    }

    console.log('✅ All required admin users are properly initialized');
  } catch (error) {
    console.error('Failed to verify final admin users status:', error);
    throw error;
  }

  console.debug('\n=== initialiseAdmins END ===');
};
