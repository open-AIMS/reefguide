import { PrismaClient, Group, Prisma, User } from '@reefguide/db';
import { BadRequestException, NotFoundException } from '../exceptions';
import { CreateGroupInput, UpdateGroupInput } from '@reefguide/types';

/**
 * Options for querying groups
 */
interface GetGroupsOptions {
  name?: string;
  limit?: number;
  offset?: number;
  currentUser: User;
  includeAll?: boolean; // For admins to see all groups
}

/**
 * Builds the where clause for group permissions
 * User can see groups if they are:
 * a) Admin (includeAll = true)
 * b) Owner of the group
 * c) Manager of the group
 * d) Member of the group
 */
function buildPermissionWhereClause(currentUser: User, includeAll: boolean = false) {
  if (includeAll) {
    return {}; // Admins can see everything
  }

  return {
    OR: [
      // Owner of the group
      { owner_id: currentUser.id },

      // Manager of the group
      {
        managers: {
          some: {
            user_id: currentUser.id
          }
        }
      },

      // Member of the group
      {
        members: {
          some: {
            user_id: currentUser.id
          }
        }
      }
    ]
  };
}

/**
 * Service class for managing groups
 * Provides CRUD operations and business logic for group management
 */
export class GroupService {
  private prisma: PrismaClient | Prisma.TransactionClient;

  constructor(prisma: PrismaClient | Prisma.TransactionClient) {
    this.prisma = prisma;
  }

  /**
   * Creates a new group
   */
  async create({ input, ownerId }: { input: CreateGroupInput; ownerId: number }) {
    // Validate input
    if (!input.name || !input.name.trim()) {
      throw new BadRequestException('Group name is required');
    }

    // Validate that the owner exists
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId }
    });

    if (!owner) {
      throw new BadRequestException(`User with ID ${ownerId} not found`);
    }

    return await this.prisma.group.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        owner_id: ownerId
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true
          }
        },
        managers: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        }
      }
    });
  }

  /**
   * Retrieves multiple groups with optional filtering and permission enforcement
   */
  async getMany({ options }: { options: GetGroupsOptions }) {
    const { name, limit = 50, offset = 0, currentUser, includeAll = false } = options;

    if (!currentUser) {
      throw new Error('Current user is required.');
    }

    const permissionWhere = buildPermissionWhereClause(currentUser, includeAll);

    return await this.prisma.group.findMany({
      where: {
        AND: [
          permissionWhere,
          {
            ...(name && { name: { contains: name, mode: 'insensitive' } })
          }
        ]
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true
          }
        },
        managers: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        updated_at: 'desc'
      },
      take: Math.min(limit, 100),
      skip: offset
    });
  }

  /**
   * Gets count of groups matching the given criteria and user permissions
   */
  async getCount({ options }: { options: GetGroupsOptions }): Promise<number> {
    const { name, currentUser, includeAll = false } = options;

    if (!currentUser) {
      throw new Error('Current user is required for permission checking');
    }

    const permissionWhere = buildPermissionWhereClause(currentUser, includeAll);

    return await this.prisma.group.count({
      where: {
        AND: [
          permissionWhere,
          {
            ...(name && { name: { contains: name, mode: 'insensitive' } })
          }
        ]
      }
    });
  }

  /**
   * Retrieves a group by ID
   */
  async getById({ id }: { id: number }) {
    return (
      (await this.prisma.group.findUnique({
        where: { id },
        include: {
          owner: {
            select: {
              id: true,
              email: true
            }
          },
          managers: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true
                }
              }
            }
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true
                }
              }
            }
          }
        }
      })) ?? undefined
    );
  }

  /**
   * Helper method to check if a user can access a specific group
   */
  async canUserAccessGroup(
    groupId: number,
    currentUser: User,
    includeAll: boolean = false
  ): Promise<boolean> {
    if (includeAll) {
      return true; // Admins can access everything
    }

    const permissionWhere = buildPermissionWhereClause(currentUser, includeAll);

    const group = await this.prisma.group.findFirst({
      where: {
        AND: [{ id: groupId }, permissionWhere]
      }
    });

    return !!group;
  }

  /**
   * Helper method to check if a user can manage a specific group (owner or manager)
   */
  async canUserManageGroup(groupId: number, currentUser: User): Promise<boolean> {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        OR: [
          { owner_id: currentUser.id },
          {
            managers: {
              some: {
                user_id: currentUser.id
              }
            }
          }
        ]
      }
    });

    return !!group || currentUser.roles.includes('ADMIN');
  }

  /**
   * Updates an existing group
   */
  async update({ id, input }: { id: number; input: UpdateGroupInput }) {
    // Check if group exists
    const existing = await this.prisma.group.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }

    return await this.prisma.group.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description?.trim() || null }),
        updated_at: new Date()
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true
          }
        },
        managers: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        }
      }
    });
  }

  /**
   * Deletes a group
   */
  async delete({ id }: { id: number }): Promise<boolean> {
    const existing = await this.prisma.group.findUnique({
      where: { id }
    });

    if (!existing) {
      return false;
    }

    await this.prisma.group.delete({
      where: { id }
    });

    return true;
  }

  /**
   * Add members to a group
   */
  async addMembers({ groupId, userIds }: { groupId: number; userIds: number[] }): Promise<{
    added: Array<{ userId: number; userEmail: string }>;
    alreadyMembers: Array<{ userId: number; userEmail: string }>;
    errors: Array<{ userId: number; error: string }>;
  }> {
    const added: Array<{ userId: number; userEmail: string }> = [];
    const alreadyMembers: Array<{ userId: number; userEmail: string }> = [];
    const errors: Array<{ userId: number; error: string }> = [];

    for (const userId of userIds) {
      try {
        // Check if user exists
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true }
        });

        if (!user) {
          errors.push({ userId, error: 'User not found' });
          continue;
        }

        // Check if already a member
        const existingMember = await this.prisma.groupMember.findUnique({
          where: {
            group_id_user_id: {
              group_id: groupId,
              user_id: userId
            }
          }
        });

        if (existingMember) {
          alreadyMembers.push({ userId, userEmail: user.email });
          continue;
        }

        // Add the member
        await this.prisma.groupMember.create({
          data: {
            group_id: groupId,
            user_id: userId
          }
        });

        added.push({ userId, userEmail: user.email });
      } catch (error) {
        errors.push({ userId, error: 'Failed to add member' });
      }
    }

    return { added, alreadyMembers, errors };
  }

  /**
   * Remove members from a group
   */
  async removeMembers({ groupId, userIds }: { groupId: number; userIds: number[] }): Promise<{
    removed: Array<{ userId: number; userEmail: string }>;
    notMembers: Array<{ userId: number; userEmail: string }>;
    errors: Array<{ userId: number; error: string }>;
  }> {
    const removed: Array<{ userId: number; userEmail: string }> = [];
    const notMembers: Array<{ userId: number; userEmail: string }> = [];
    const errors: Array<{ userId: number; error: string }> = [];

    for (const userId of userIds) {
      try {
        // Check if user exists
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true }
        });

        if (!user) {
          errors.push({ userId, error: 'User not found' });
          continue;
        }

        // Try to delete the membership
        const deleteResult = await this.prisma.groupMember.deleteMany({
          where: {
            group_id: groupId,
            user_id: userId
          }
        });

        if (deleteResult.count === 0) {
          notMembers.push({ userId, userEmail: user.email });
        } else {
          removed.push({ userId, userEmail: user.email });
        }
      } catch (error) {
        errors.push({ userId, error: 'Failed to remove member' });
      }
    }

    return { removed, notMembers, errors };
  }

  /**
   * Add managers to a group
   */
  async addManagers({ groupId, userIds }: { groupId: number; userIds: number[] }): Promise<{
    added: Array<{ userId: number; userEmail: string }>;
    alreadyManagers: Array<{ userId: number; userEmail: string }>;
    errors: Array<{ userId: number; error: string }>;
  }> {
    const added: Array<{ userId: number; userEmail: string }> = [];
    const alreadyManagers: Array<{ userId: number; userEmail: string }> = [];
    const errors: Array<{ userId: number; error: string }> = [];

    for (const userId of userIds) {
      try {
        // Check if user exists
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true }
        });

        if (!user) {
          errors.push({ userId, error: 'User not found' });
          continue;
        }

        // Check if already a manager
        const existingManager = await this.prisma.groupManager.findUnique({
          where: {
            group_id_user_id: {
              group_id: groupId,
              user_id: userId
            }
          }
        });

        if (existingManager) {
          alreadyManagers.push({ userId, userEmail: user.email });
          continue;
        }

        // Add the manager
        await this.prisma.groupManager.create({
          data: {
            group_id: groupId,
            user_id: userId
          }
        });

        added.push({ userId, userEmail: user.email });
      } catch (error) {
        errors.push({ userId, error: 'Failed to add manager' });
      }
    }

    return { added, alreadyManagers, errors };
  }

  /**
   * Remove managers from a group
   */
  async removeManagers({ groupId, userIds }: { groupId: number; userIds: number[] }): Promise<{
    removed: Array<{ userId: number; userEmail: string }>;
    notManagers: Array<{ userId: number; userEmail: string }>;
    errors: Array<{ userId: number; error: string }>;
  }> {
    const removed: Array<{ userId: number; userEmail: string }> = [];
    const notManagers: Array<{ userId: number; userEmail: string }> = [];
    const errors: Array<{ userId: number; error: string }> = [];

    for (const userId of userIds) {
      try {
        // Check if user exists
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true }
        });

        if (!user) {
          errors.push({ userId, error: 'User not found' });
          continue;
        }

        // Try to delete the manager role
        const deleteResult = await this.prisma.groupManager.deleteMany({
          where: {
            group_id: groupId,
            user_id: userId
          }
        });

        if (deleteResult.count === 0) {
          notManagers.push({ userId, userEmail: user.email });
        } else {
          removed.push({ userId, userEmail: user.email });
        }
      } catch (error) {
        errors.push({ userId, error: 'Failed to remove manager' });
      }
    }

    return { removed, notManagers, errors };
  }

  /**
   * Transfer group ownership to another user
   */
  async transferOwnership({ groupId, newOwnerId }: { groupId: number; newOwnerId: number }) {
    // Check if new owner exists
    const newOwner = await this.prisma.user.findUnique({
      where: { id: newOwnerId }
    });

    if (!newOwner) {
      throw new BadRequestException(`User with ID ${newOwnerId} not found`);
    }

    // Check if group exists
    const group = await this.prisma.group.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    // Transfer ownership
    return await this.prisma.group.update({
      where: { id: groupId },
      data: {
        owner_id: newOwnerId,
        updated_at: new Date()
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true
          }
        },
        managers: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        }
      }
    });
  }

  /**
   * Gets all groups for a specific user (owned, managed, or member of)
   */
  async getByUserId({ userId }: { userId: number }) {
    return await this.prisma.group.findMany({
      where: {
        OR: [
          { owner_id: userId },
          {
            managers: {
              some: {
                user_id: userId
              }
            }
          },
          {
            members: {
              some: {
                user_id: userId
              }
            }
          }
        ]
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true
          }
        },
        managers: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: {
        updated_at: 'desc'
      }
    });
  }

  /**
   * Check if a user is the owner of a group
   */
  async isGroupOwner({ groupId, userId }: { groupId: number; userId: number }): Promise<boolean> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { owner_id: true }
    });

    return group?.owner_id === userId;
  }

  /**
   * Check if a user is a manager of a group
   */
  async isGroupManager({ groupId, userId }: { groupId: number; userId: number }): Promise<boolean> {
    const manager = await this.prisma.groupManager.findUnique({
      where: {
        group_id_user_id: {
          group_id: groupId,
          user_id: userId
        }
      }
    });

    return !!manager;
  }

  /**
   * Check if a user is a member of a group
   */
  async isGroupMember({ groupId, userId }: { groupId: number; userId: number }): Promise<boolean> {
    const member = await this.prisma.groupMember.findUnique({
      where: {
        group_id_user_id: {
          group_id: groupId,
          user_id: userId
        }
      }
    });

    return !!member;
  }
}
