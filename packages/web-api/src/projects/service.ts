import { PrismaClient, ProjectType, Project, Prisma } from '@reefguide/db';
import { BadRequestException, NotFoundException } from '../exceptions';
import { CreateProjectInput, UpdateProjectInput } from '@reefguide/types';

/**
 * Options for querying projects
 */
export interface GetProjectsOptions {
  userId?: number;
  type?: ProjectType;
  name?: string;
  limit?: number;
  offset?: number;
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
   * Retrieves multiple projects with optional filtering
   *
   * @param options - Query options for filtering and pagination
   * @returns Promise<Project[]> - Array of matching projects
   */
  async getMany({ options = {} }: { options?: GetProjectsOptions }): Promise<Project[]> {
    const { userId, type, name, limit = 50, offset = 0 } = options;

    return await this.prisma.project.findMany({
      where: {
        ...(userId && { user_id: userId }),
        ...(type && { type }),
        ...(name && { name: { contains: name, mode: 'insensitive' } })
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
        updated_at: 'desc'
      },
      take: Math.min(limit, 100), // Cap at 100 for performance
      skip: offset
    });
  }

  /**
   * Gets count of projects matching the given criteria
   *
   * @param options - Query options for filtering
   * @returns Promise<number> - Count of matching records
   */
  async getCount({ options = {} }: { options?: GetProjectsOptions }): Promise<number> {
    const { userId, type, name } = options;

    return await this.prisma.project.count({
      where: {
        ...(userId && { user_id: userId }),
        ...(type && { type }),
        ...(name && { name: { contains: name, mode: 'insensitive' } })
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
}
