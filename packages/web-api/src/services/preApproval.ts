import { PrismaClient, UserRole, PreApprovedUser, Prisma } from '@reefguide/db';
import { BadRequestException, NotFoundException } from '../exceptions';

/**
 * Input type for creating a new pre-approved user
 */
export interface CreatePreApprovedUserInput {
  email: string;
  roles: UserRole[];
  createdByUserId?: number;
}

/**
 * Input type for updating an existing pre-approved user
 */
export interface UpdatePreApprovedUserInput {
  email?: string;
  roles?: UserRole[];
}

/**
 * Options for querying pre-approved users
 */
export interface GetPreApprovedUsersOptions {
  email?: string;
  used?: boolean;
  createdByUserId?: number;
  limit?: number;
  offset?: number;
}

/**
 * Result type for the use operation
 */
export interface UsePreApprovalResult {
  preApprovedUser: PreApprovedUser;
  roles: UserRole[];
}

/**
 * Service class for managing pre-approved users
 * Provides CRUD operations and business logic for the pre-approval workflow
 */
export class PreApprovedUserService {
  private prisma: PrismaClient | Prisma.TransactionClient;

  constructor(prisma: PrismaClient | Prisma.TransactionClient) {
    this.prisma = prisma;
  }

  /**
   * Creates a new pre-approved user entry
   *
   * @param input - The pre-approved user data
   * @returns Promise<PreApprovedUser> - The created pre-approved user
   * @throws Error if email already exists or validation fails
   */
  async create(input: CreatePreApprovedUserInput): Promise<PreApprovedUser> {
    // Validate input
    if (!input.email || !input.email.trim()) {
      throw new BadRequestException('Email is required');
    }

    if (!input.roles || input.roles.length === 0) {
      throw new BadRequestException('At least one role must be specified');
    }

    // Check if email already exists (either as pre-approved or actual user)
    const existingPreApproval = await this.prisma.preApprovedUser.findUnique({
      where: { email: input.email.toLowerCase().trim() }
    });

    if (existingPreApproval) {
      throw new BadRequestException(`Pre-approval already exists for email: ${input.email}`);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() }
    });

    if (existingUser) {
      throw new BadRequestException(`User already registered with email: ${input.email}`);
    }

    // Validate that the creating user exists (if provided)
    if (input.createdByUserId) {
      const creatingUser = await this.prisma.user.findUnique({
        where: { id: input.createdByUserId }
      });

      if (!creatingUser) {
        throw new BadRequestException(`Creating user with ID ${input.createdByUserId} not found`);
      }
    }

    return await this.prisma.preApprovedUser.create({
      data: {
        email: input.email.toLowerCase().trim(),
        roles: input.roles,
        created_by_user_id: input.createdByUserId
      },
      include: {
        created_by_user: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });
  }

  /**
   * Retrieves multiple pre-approved users with optional filtering
   *
   * @param options - Query options for filtering and pagination
   * @returns Promise<PreApprovedUser[]> - Array of matching pre-approved users
   */
  async getMany(options: GetPreApprovedUsersOptions = {}): Promise<PreApprovedUser[]> {
    const { email, used, createdByUserId, limit = 50, offset = 0 } = options;

    return await this.prisma.preApprovedUser.findMany({
      where: {
        ...(email && { email: { contains: email.toLowerCase(), mode: 'insensitive' } }),
        ...(used !== undefined && { used }),
        ...(createdByUserId && { created_by_user_id: createdByUserId })
      },
      include: {
        created_by_user: {
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
   * Gets count of pre-approved users matching the given criteria
   *
   * @param options - Query options for filtering
   * @returns Promise<number> - Count of matching records
   */
  async getCount(options: GetPreApprovedUsersOptions = {}): Promise<number> {
    const { email, used, createdByUserId } = options;

    return await this.prisma.preApprovedUser.count({
      where: {
        ...(email && { email: { contains: email.toLowerCase(), mode: 'insensitive' } }),
        ...(used !== undefined && { used }),
        ...(createdByUserId && { created_by_user_id: createdByUserId })
      }
    });
  }

  /**
   * Updates an existing pre-approved user
   *
   * @param id - The ID of the pre-approved user to update
   * @param input - The updated data
   * @returns Promise<PreApprovedUser> - The updated pre-approved user
   * @throws Error if pre-approval not found or already used
   */
  async update(id: number, input: UpdatePreApprovedUserInput): Promise<PreApprovedUser> {
    // Check if pre-approval exists and is not used
    const existing = await this.prisma.preApprovedUser.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new NotFoundException(`Pre-approved user with ID ${id} not found`);
    }

    if (existing.used) {
      throw new BadRequestException('Cannot update a pre-approval that has already been used');
    }

    // If updating email, check for conflicts
    if (input.email && input.email.toLowerCase().trim() !== existing.email) {
      const emailConflict = await this.prisma.preApprovedUser.findUnique({
        where: { email: input.email.toLowerCase().trim() }
      });

      if (emailConflict) {
        throw new BadRequestException(`Pre-approval already exists for email: ${input.email}`);
      }

      const userConflict = await this.prisma.user.findUnique({
        where: { email: input.email.toLowerCase().trim() }
      });

      if (userConflict) {
        throw new BadRequestException(`User already registered with email: ${input.email}`);
      }
    }

    // Validate roles if provided
    if (input.roles && input.roles.length === 0) {
      throw new BadRequestException('At least one role must be specified');
    }

    return await this.prisma.preApprovedUser.update({
      where: { id },
      data: {
        ...(input.email && { email: input.email.toLowerCase().trim() }),
        ...(input.roles && { roles: input.roles })
      },
      include: {
        created_by_user: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });
  }

  /**
   * Uses a pre-approval (marks it as used and returns the roles)
   * This should be called during user registration to consume the pre-approval
   *
   * @param email - The email address to use pre-approval for
   * @returns Promise<UsePreApprovalResult | undefined> - The pre-approval data and roles, or undefined if not found
   * @throws Error if pre-approval already used
   */
  async use(email: string): Promise<UsePreApprovalResult | undefined> {
    const normalizedEmail = email.toLowerCase().trim();

    const preApproval = await this.prisma.preApprovedUser.findUnique({
      where: { email: normalizedEmail }
    });

    if (!preApproval) {
      return undefined;
    }

    if (preApproval.used) {
      throw new BadRequestException(`Pre-approval for ${email} has already been used`);
    }

    // Mark as used
    const updatedPreApproval = await this.prisma.preApprovedUser.update({
      where: { id: preApproval.id },
      data: {
        used: true,
        used_at: new Date()
      }
    });

    return {
      preApprovedUser: updatedPreApproval,
      roles: preApproval.roles
    };
  }

  /**
   * Retrieves a pre-approved user by ID
   *
   * @param id - The ID of the pre-approved user
   * @returns Promise<PreApprovedUser | undefined> - The pre-approved user or undefined if not found
   */
  async getById(id: number): Promise<PreApprovedUser | undefined> {
    return (
      (await this.prisma.preApprovedUser.findUnique({
        where: { id },
        include: {
          created_by_user: {
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
   * Retrieves a pre-approved user by email
   *
   * @param email - The email address to search for
   * @returns Promise<PreApprovedUser | undefined> - The pre-approved user or undefined if not found
   */
  async getByEmail(email: string): Promise<PreApprovedUser | undefined> {
    return (
      (await this.prisma.preApprovedUser.findUnique({
        where: { email: email.toLowerCase().trim() },
        include: {
          created_by_user: {
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
   * Deletes a pre-approved user
   *
   * @param id - The ID of the pre-approved user to delete
   * @returns Promise<boolean> - True if deleted, false if not found
   */
  async delete(id: number): Promise<boolean> {
    const existing = await this.prisma.preApprovedUser.findUnique({
      where: { id }
    });

    if (!existing) {
      return false;
    }

    await this.prisma.preApprovedUser.delete({
      where: { id }
    });

    return true;
  }

  /**
   * Bulk creates multiple pre-approved users
   * Useful for CLI operations where admins upload lists of emails
   *
   * @param inputs - Array of pre-approved user data
   * @returns Promise<{ created: PreApprovedUser[], errors: Array<{email: string, error: string}> }>
   */
  async bulkCreate(inputs: CreatePreApprovedUserInput[]): Promise<{
    created: PreApprovedUser[];
    errors: Array<{ email: string; error: string }>;
  }> {
    const created: PreApprovedUser[] = [];
    const errors: Array<{ email: string; error: string }> = [];

    for (const input of inputs) {
      try {
        const preApproval = await this.create(input);
        created.push(preApproval);
      } catch (error) {
        errors.push({
          email: input.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { created, errors };
  }

  /**
   * Cleans up old used pre-approvals (for maintenance)
   *
   * @param olderThanDays - Delete used pre-approvals older than this many days
   * @returns Promise<number> - Number of records deleted
   */
  async cleanupUsedPreApprovals(olderThanDays = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.preApprovedUser.deleteMany({
      where: {
        used: true,
        used_at: {
          lt: cutoffDate
        }
      }
    });

    return result.count;
  }
}
