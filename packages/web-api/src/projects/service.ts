import { PrismaClient, ProjectType, Project, Prisma, User } from '@reefguide/db';
import { BadRequestException, NotFoundException } from '../exceptions';
import { CreateProjectInput, UpdateProjectInput } from '@reefguide/types';

/**
 * Options for querying projects
 */
interface GetProjectsOptions {
  type?: ProjectType;
  name?: string;
  limit?: number;
  offset?: number;
  currentUser: User;
  ignorePermissions?: boolean;
}

/**
 * Builds the where clause for project permissions
 * User can see projects if they are:
 * a) Admin (ignorePermissions = true)
 * b) Owner of the project
 * c) Project is shared directly with them
 * d) Project is shared with a group they belong to
 * e) Project is public
 */
function buildPermissionWhereClause(currentUser: User, ignorePermissions: boolean = false) {
  if (ignorePermissions) {
    return {}; // Admins can see everything
  }

  return {
    OR: [
      // Owner of the project
      { user_id: currentUser.id },

      // Project is public
      { is_public: true },

      // Shared directly with user
      {
        userShares: {
          some: {
            user_id: currentUser.id
          }
        }
      },

      // Shared with a group the user belongs to
      {
        groupShares: {
          some: {
            group: {
              OR: [
                // User is owner of the group
                { owner_id: currentUser.id },

                // User is a manager of the group
                {
                  managers: {
                    some: {
                      user_id: currentUser.id
                    }
                  }
                },

                // User is a member of the group
                {
                  members: {
                    some: {
                      user_id: currentUser.id
                    }
                  }
                }
              ]
            }
          }
        }
      }
    ]
  };
}

/**
 * Service class for managing projects
 * Provides CRUD operations and business logic for the project workflow
 */
export class ProjectService {
  private prisma: PrismaClient | Prisma.TransactionClient;

  constructor(prisma: PrismaClient | Prisma.TransactionClient) {
    this.prisma = prisma;
  }

  /**
   * Creates a new project
   *
   * @param input - The project data
   * @param userId - The ID of the user creating the project
   * @returns Promise<Project> - The created project
   * @throws Error if user not found or validation fails
   */
  async create({ input, userId }: { input: CreateProjectInput; userId: number }): Promise<Project> {
    // Validate input
    if (!input.name || !input.name.trim()) {
      throw new BadRequestException('Project name is required');
    }

    if (!input.type) {
      throw new BadRequestException('Project type is required');
    }

    if (!input.project_state) {
      throw new BadRequestException('Project state is required');
    }

    // Validate that the user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new BadRequestException(`User with ID ${userId} not found`);
    }

    // Check if a project with the same name already exists for this user
    const existingProject = await this.prisma.project.findFirst({
      where: {
        user_id: userId,
        name: input.name.trim()
      }
    });

    if (existingProject) {
      throw new BadRequestException(
        `Project with name "${input.name}" already exists for this user`
      );
    }

    return await this.prisma.project.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        type: input.type,
        project_state: input.project_state,
        user_id: userId
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
  }

  /**
   * Retrieves multiple projects with optional filtering and permission enforcement
   *
   * @param options - Query options for filtering and pagination
   * @returns Promise<Project[]> - Array of matching projects the user can access
   */
  async getMany({ options }: { options: GetProjectsOptions }): Promise<Project[]> {
    const { type, name, limit = 50, offset = 0, currentUser, ignorePermissions = false } = options;

    if (!currentUser) {
      throw new Error('Current user is required.');
    }

    const permissionWhere = buildPermissionWhereClause(currentUser, ignorePermissions);

    return await this.prisma.project.findMany({
      where: {
        AND: [
          permissionWhere,
          {
            ...(type && { type }),
            ...(name && { name: { contains: name, mode: 'insensitive' } })
          }
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            email: true
          }
        },
        // Include sharing information for context
        userShares: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
          }
        },
        groupShares: {
          include: {
            group: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        updated_at: 'desc'
      },
      take: Math.min(limit, 100), // Cap at 100 for performance
      skip: offset
    });
  }

  /**
   * Gets count of projects matching the given criteria and user permissions
   *
   * @param options - Query options for filtering
   * @returns Promise<number> - Count of matching records the user can access
   */
  async getCount({ options }: { options: GetProjectsOptions }): Promise<number> {
    const { type, name, currentUser, ignorePermissions = false } = options;

    if (!currentUser && !ignorePermissions) {
      throw new Error('Current user is required for permission checking');
    }

    const permissionWhere = buildPermissionWhereClause(currentUser, ignorePermissions);

    return await this.prisma.project.count({
      where: {
        AND: [
          permissionWhere,
          {
            ...(type && { type }),
            ...(name && { name: { contains: name, mode: 'insensitive' } })
          }
        ]
      }
    });
  }

  /**
   * Retrieves a project by ID
   *
   * @param id - The ID of the project
   * @param userId - Optional user ID to ensure ownership
   * @returns Promise<Project | undefined> - The project or undefined if not found
   */
  async getById({ id, userId }: { id: number; userId?: number }): Promise<Project | undefined> {
    return (
      (await this.prisma.project.findFirst({
        where: {
          id,
          ...(userId && { user_id: userId })
        },
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
   * Helper method to check if a user can access a specific project
   * Useful for individual project operations (get by ID, update, delete, etc.)
   *
   * @param projectId - ID of the project to check
   * @param currentUser - User to check permissions for
   * @param ignorePermissions - Whether to skip permission checks (for admins)
   * @returns Promise<boolean> - Whether the user can access the project
   */
  async canUserAccessProject(
    projectId: number,
    currentUser: User,
    ignorePermissions: boolean = false
  ): Promise<boolean> {
    if (ignorePermissions) {
      return true; // Admins can access everything
    }

    const permissionWhere = buildPermissionWhereClause(currentUser, ignorePermissions);

    const project = await this.prisma.project.findFirst({
      where: {
        AND: [{ id: projectId }, permissionWhere]
      }
    });

    return !!project;
  }

  /**
   * Updates an existing project
   *
   * @param id - The ID of the project to update
   * @param input - The updated data
   * @param userId - Optional user ID to ensure ownership
   * @returns Promise<Project> - The updated project
   * @throws Error if project not found or user doesn't have permission
   */
  async update({
    id,
    input,
    userId
  }: {
    id: number;
    input: UpdateProjectInput;
    userId?: number;
  }): Promise<Project> {
    // Check if project exists and user has permission
    const existing = await this.prisma.project.findFirst({
      where: {
        id,
        ...(userId && { user_id: userId })
      }
    });

    if (!existing) {
      throw new NotFoundException(
        `Project with ID ${id} not found` + (userId ? ' for this user' : '')
      );
    }

    // If updating name, check for conflicts within the same user
    if (input.name) {
      const nameConflict = await this.prisma.project.findFirst({
        where: {
          user_id: existing.user_id,
          name: input.name.trim(),
          id: { not: id } // Exclude current project
        }
      });

      if (nameConflict) {
        throw new BadRequestException(
          `Project with name "${input.name}" already exists for this user`
        );
      }
    }

    return await this.prisma.project.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description?.trim() || null }),
        ...(input.project_state && { project_state: input.project_state }),
        updated_at: new Date()
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
  }

  /**
   * Deletes a project
   *
   * @param id - The ID of the project to delete
   * @param userId - Optional user ID to ensure ownership
   * @returns Promise<boolean> - True if deleted, false if not found
   */
  async delete({ id, userId }: { id: number; userId?: number }): Promise<boolean> {
    const existing = await this.prisma.project.findFirst({
      where: {
        id,
        ...(userId && { user_id: userId })
      }
    });

    if (!existing) {
      return false;
    }

    await this.prisma.project.delete({
      where: { id }
    });

    return true;
  }

  /**
   * Gets all projects for a specific user
   *
   * @param userId - The ID of the user
   * @returns Promise<Project[]> - Array of user's projects
   */
  async getByUserId({ userId }: { userId: number }): Promise<Project[]> {
    return await this.prisma.project.findMany({
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
        updated_at: 'desc'
      }
    });
  }

  /**
   * Bulk creates multiple projects for a user
   * Useful for migration or bulk operations
   *
   * @param inputs - Array of project data
   * @param userId - The ID of the user creating the projects
   * @returns Promise<{ created: Project[], errors: Array<{name: string, error: string}> }>
   */
  async bulkCreate({ inputs, userId }: { inputs: CreateProjectInput[]; userId: number }): Promise<{
    created: Project[];
    errors: Array<{ name: string; error: string }>;
  }> {
    const created: Project[] = [];
    const errors: Array<{ name: string; error: string }> = [];

    for (const input of inputs) {
      try {
        const project = await this.create({ input, userId });
        created.push(project);
      } catch (error) {
        errors.push({
          name: input.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { created, errors };
  }

  /**
   * Cleans up old projects (for maintenance)
   * This is a placeholder - you might want to implement based on your business rules
   *
   * @param olderThanDays - Delete projects older than this many days (if inactive)
   * @returns Promise<number> - Number of records deleted
   */
  async cleanupOldProjects({ olderThanDays = 365 }: { olderThanDays?: number }): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // This is just an example - you might want different cleanup logic
    const result = await this.prisma.project.deleteMany({
      where: {
        updated_at: {
          lt: cutoffDate
        }
        // Add additional conditions like: no recent activity, archived status, etc.
      }
    });

    return result.count;
  }

  /**
   * Share a project with multiple users
   */
  async shareWithUsers({ projectId, userIds }: { projectId: number; userIds: number[] }): Promise<{
    shared: Array<{ userId: number; userEmail: string }>;
    alreadyShared: Array<{ userId: number; userEmail: string }>;
    errors: Array<{ userId: number; error: string }>;
  }> {
    const shared: Array<{ userId: number; userEmail: string }> = [];
    const alreadyShared: Array<{ userId: number; userEmail: string }> = [];
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

        // Check if already shared
        const existingShare = await this.prisma.projectUserShare.findUnique({
          where: {
            project_id_user_id: {
              project_id: projectId,
              user_id: userId
            }
          }
        });

        if (existingShare) {
          alreadyShared.push({ userId, userEmail: user.email });
          continue;
        }

        // Create the share
        await this.prisma.projectUserShare.create({
          data: {
            project_id: projectId,
            user_id: userId
          }
        });

        shared.push({ userId, userEmail: user.email });
      } catch (error) {
        errors.push({ userId, error: 'Failed to share with user' });
      }
    }

    return { shared, alreadyShared, errors };
  }

  /**
   * Remove project sharing with multiple users
   */
  async unshareWithUsers({
    projectId,
    userIds
  }: {
    projectId: number;
    userIds: number[];
  }): Promise<{
    unshared: Array<{ userId: number; userEmail: string }>;
    notShared: Array<{ userId: number; userEmail: string }>;
    errors: Array<{ userId: number; error: string }>;
  }> {
    const unshared: Array<{ userId: number; userEmail: string }> = [];
    const notShared: Array<{ userId: number; userEmail: string }> = [];
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

        // Try to delete the share
        const deleteResult = await this.prisma.projectUserShare.deleteMany({
          where: {
            project_id: projectId,
            user_id: userId
          }
        });

        if (deleteResult.count === 0) {
          notShared.push({ userId, userEmail: user.email });
        } else {
          unshared.push({ userId, userEmail: user.email });
        }
      } catch (error) {
        errors.push({ userId, error: 'Failed to unshare with user' });
      }
    }

    return { unshared, notShared, errors };
  }

  /**
   * Share a project with multiple groups
   */
  async shareWithGroups({
    projectId,
    groupIds
  }: {
    projectId: number;
    groupIds: number[];
  }): Promise<{
    shared: Array<{ groupId: number; groupName: string }>;
    alreadyShared: Array<{ groupId: number; groupName: string }>;
    errors: Array<{ groupId: number; error: string }>;
  }> {
    const shared: Array<{ groupId: number; groupName: string }> = [];
    const alreadyShared: Array<{ groupId: number; groupName: string }> = [];
    const errors: Array<{ groupId: number; error: string }> = [];

    for (const groupId of groupIds) {
      try {
        // Check if group exists
        const group = await this.prisma.group.findUnique({
          where: { id: groupId },
          select: { id: true, name: true }
        });

        if (!group) {
          errors.push({ groupId, error: 'Group not found' });
          continue;
        }

        // Check if already shared
        const existingShare = await this.prisma.projectGroupShare.findUnique({
          where: {
            project_id_group_id: {
              project_id: projectId,
              group_id: groupId
            }
          }
        });

        if (existingShare) {
          alreadyShared.push({ groupId, groupName: group.name });
          continue;
        }

        // Create the share
        await this.prisma.projectGroupShare.create({
          data: {
            project_id: projectId,
            group_id: groupId
          }
        });

        shared.push({ groupId, groupName: group.name });
      } catch (error) {
        errors.push({ groupId, error: 'Failed to share with group' });
      }
    }

    return { shared, alreadyShared, errors };
  }

  /**
   * Remove project sharing with multiple groups
   */
  async unshareWithGroups({
    projectId,
    groupIds
  }: {
    projectId: number;
    groupIds: number[];
  }): Promise<{
    unshared: Array<{ groupId: number; groupName: string }>;
    notShared: Array<{ groupId: number; groupName: string }>;
    errors: Array<{ groupId: number; error: string }>;
  }> {
    const unshared: Array<{ groupId: number; groupName: string }> = [];
    const notShared: Array<{ groupId: number; groupName: string }> = [];
    const errors: Array<{ groupId: number; error: string }> = [];

    for (const groupId of groupIds) {
      try {
        // Check if group exists
        const group = await this.prisma.group.findUnique({
          where: { id: groupId },
          select: { id: true, name: true }
        });

        if (!group) {
          errors.push({ groupId, error: 'Group not found' });
          continue;
        }

        // Try to delete the share
        const deleteResult = await this.prisma.projectGroupShare.deleteMany({
          where: {
            project_id: projectId,
            group_id: groupId
          }
        });

        if (deleteResult.count === 0) {
          notShared.push({ groupId, groupName: group.name });
        } else {
          unshared.push({ groupId, groupName: group.name });
        }
      } catch (error) {
        errors.push({ groupId, error: 'Failed to unshare with group' });
      }
    }

    return { unshared, notShared, errors };
  }

  /**
   * Set the publicity status of a project
   */
  async setPublicity({
    projectId,
    isPublic
  }: {
    projectId: number;
    isPublic: boolean;
  }): Promise<{ id: number; name: string; isPublic: boolean }> {
    const updatedProject = await this.prisma.project.update({
      where: { id: projectId },
      data: { is_public: isPublic },
      select: {
        id: true,
        name: true,
        is_public: true
      }
    });

    return {
      id: updatedProject.id,
      name: updatedProject.name,
      isPublic: updatedProject.is_public
    };
  }

  /**
   * Check if a user is the owner of a project
   */
  async isProjectOwner({
    projectId,
    userId
  }: {
    projectId: number;
    userId: number;
  }): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { user_id: true }
    });

    return project?.user_id === userId;
  }
}
