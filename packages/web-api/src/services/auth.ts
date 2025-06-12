import { prisma, UserRole } from '@reefguide/db';
import bcryptjs from 'bcryptjs';
import { BadRequestException } from '../exceptions';

/**
 * Hashes a password
 * @param password The password (plain text)
 * @returns The hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  // Hash the password
  return bcryptjs.hash(password, 10);
}

/**
 * Registers a new user, email must be unique.
 * @param email The user email
 * @param password The password (plain text)
 * @param roles The roles
 * @returns The created user id
 */
export async function registerUser({
  email,
  password,
  roles
}: {
  email: string;
  password: string;
  roles: UserRole[];
}): Promise<number> {
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser) {
    throw new BadRequestException('User already exists');
  }

  // Hash the password
  const hashedPassword = await hashPassword(password);

  // Create new user
  return (
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        // No roles by default
        roles
      }
    })
  ).id;
}

/**
 * Change user password
 * @param email The user email
 * @param password The password (plain text)
 */
export async function changePassword({ id, password }: { id: number; password: string }) {
  // Hash the password
  const hashedPassword = await hashPassword(password);

  // Update user password
  try {
    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword }
    });
  } catch (error) {
    throw new BadRequestException(
      `Failed to change password of user with id ${id}.`,
      error as Error
    );
  }
}
