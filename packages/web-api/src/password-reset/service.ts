import { PasswordResetCode, PrismaClient } from '@reefguide/db';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { BadRequestException, NotFoundException } from '../exceptions';
import { hashPassword } from '../services/auth';

/**
 * Options for querying password reset codes
 */
export interface GetPasswordResetCodesOptions {
  userId?: number;
  used?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Service class for managing password reset codes
 * Provides CRUD operations and business logic for password reset workflow
 */
export class PasswordResetService {
  private prisma: PrismaClient;
  private readonly SALT_ROUNDS = 12;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Generates a random reset code
   * @returns string - A random 6-digit numeric code
   */
  private generateResetCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Hashes a reset code
   * @param code - The plain text reset code
   * @returns Promise<string> - The hashed code
   */
  private async hashCode(code: string): Promise<string> {
    return await bcrypt.hash(code, this.SALT_ROUNDS);
  }

  /**
   * Verifies a reset code against its hash
   * @param code - The plain text code
   * @param hash - The stored hash
   * @returns Promise<boolean> - Whether the code matches
   */
  private async verifyCode(code: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(code, hash);
  }

  /**
   * Creates a new password reset code for a user
   * @param email - The email address of the user requesting reset
   * @returns Promise<{code: string, resetCode: PasswordResetCode}> - The plain code and DB record
   * @throws NotFoundException if user not found
   * @throws BadRequestException if user has recent unused reset code
   */
  async createResetCode({ email }: { email: string }): Promise<{
    code: string;
    resetCode: PasswordResetCode;
  }> {
    // Validate that the user exists
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    // Check if user has an existing unused reset code (prevent spam)
    const existingCode = await this.prisma.passwordResetCode.findFirst({
      where: {
        user_id: user.id,
        used: false,
        created_at: {
          // Only allow one reset code per 5 minutes
          gte: new Date(Date.now() - 5 * 60 * 1000)
        }
      }
    });

    if (existingCode) {
      throw new BadRequestException(
        'A reset code was recently sent to this email. Please wait before requesting another.'
      );
    }

    // Generate and hash the reset code
    const plainCode = this.generateResetCode();
    const hashedCode = await this.hashCode(plainCode);

    // Invalidate any existing unused codes for this user
    await this.prisma.passwordResetCode.updateMany({
      where: {
        user_id: user.id,
        used: false
      },
      data: {
        used: true,
        used_at: new Date()
      }
    });

    // Create the new reset code
    const resetCode = await this.prisma.passwordResetCode.create({
      data: {
        code_hash: hashedCode,
        user_id: user.id,
        expires_at: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now
      },
      include: {
        user: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });

    return { code: plainCode, resetCode };
  }

  /**
   * Validates and uses a reset code to change user password
   * @param code - The plain text reset code
   * @param newPassword - The new password
   * @returns Promise<boolean> - True if password was reset successfully
   * @throws BadRequestException if code is invalid, expired, or already used
   */
  async useResetCode({
    code,
    newPassword
  }: {
    code: string;
    newPassword: string;
  }): Promise<boolean> {
    if (!code || !newPassword) {
      throw new BadRequestException('Reset code and new password are required');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    // Find all unused reset codes (we need to check all because we store hashes)
    const unusedCodes = await this.prisma.passwordResetCode.findMany({
      where: {
        used: false,
        expires_at: {
          gt: new Date() // Not expired
        }
      },
      include: {
        user: true
      }
    });

    // Find the matching code by verifying against each hash
    let matchingResetCode: (typeof unusedCodes)[0] | null = null;
    for (const resetCode of unusedCodes) {
      if (await this.verifyCode(code, resetCode.code_hash)) {
        matchingResetCode = resetCode;
        break;
      }
    }

    if (!matchingResetCode) {
      // Increment attempts for security logging (if we knew which code)
      throw new BadRequestException('Invalid or expired reset code');
    }

    // Hash the new password
    const hashedPassword = await hashPassword(newPassword);

    // Use a transaction to update both password and mark code as used
    await this.prisma.$transaction(async tx => {
      // Update user password
      await tx.user.update({
        where: { id: matchingResetCode!.user.id },
        data: { password: hashedPassword }
      });

      // Mark reset code as used
      await tx.passwordResetCode.update({
        where: { id: matchingResetCode!.id },
        data: {
          used: true,
          used_at: new Date()
        }
      });

      // Invalidate all other unused reset codes for this user
      await tx.passwordResetCode.updateMany({
        where: {
          user_id: matchingResetCode!.user.id,
          used: false,
          id: { not: matchingResetCode!.id }
        },
        data: {
          used: true,
          used_at: new Date()
        }
      });
    });

    return true;
  }

  /**
   * Gets password reset codes with optional filtering (admin use)
   * @param options - Query options for filtering and pagination
   * @returns Promise<PasswordResetCode[]> - Array of matching reset codes
   */
  async getMany({
    options = {}
  }: {
    options?: GetPasswordResetCodesOptions;
  }): Promise<PasswordResetCode[]> {
    const { userId, used, limit = 50, offset = 0 } = options;

    return await this.prisma.passwordResetCode.findMany({
      where: {
        ...(userId && { user_id: userId }),
        ...(used !== undefined && { used })
      },
      include: {
        user: {
          select: {
            id: true,
            email: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      take: Math.min(limit, 100), // Cap at 100 for performance
      skip: offset
    });
  }

  /**
   * Gets count of reset codes matching the given criteria
   * @param options - Query options for filtering
   * @returns Promise<number> - Count of matching records
   */
  async getCount({ options = {} }: { options?: GetPasswordResetCodesOptions }): Promise<number> {
    const { userId, used } = options;

    return await this.prisma.passwordResetCode.count({
      where: {
        ...(userId && { user_id: userId }),
        ...(used !== undefined && { used })
      }
    });
  }

  /**
   * Gets a reset code by ID (admin use)
   * @param id - The ID of the reset code
   * @returns Promise<PasswordResetCode | undefined> - The reset code or undefined if not found
   */
  async getById({ id }: { id: number }): Promise<PasswordResetCode | undefined> {
    return (
      (await this.prisma.passwordResetCode.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true
            }
          }
        }
      })) ?? undefined
    );
  }

  /**
   * Deletes expired reset codes (cleanup utility)
   * @returns Promise<number> - Number of records deleted
   */
  async cleanupExpiredCodes(): Promise<number> {
    const result = await this.prisma.passwordResetCode.deleteMany({
      where: {
        expires_at: {
          lt: new Date()
        }
      }
    });

    return result.count;
  }

  /**
   * Gets all reset codes for a specific user (admin use)
   * @param userId - The ID of the user
   * @returns Promise<PasswordResetCode[]> - Array of user's reset codes
   */
  async getByUserId({ userId }: { userId: number }): Promise<PasswordResetCode[]> {
    return await this.prisma.passwordResetCode.findMany({
      where: { user_id: userId },
      include: {
        user: {
          select: {
            id: true,
            email: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });
  }
}
