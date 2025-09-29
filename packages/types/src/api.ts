import { z } from 'zod';
import {
  JobStatus,
  JobType,
  PreApprovedUser,
  StorageScheme,
  UserAction,
  UserRole,
  ProjectType,
  Project,
  Group
} from '@reefguide/db';

export const PASSWORD_MIN_LENGTH = 8;

// Auth schemas
export const RegisterInputSchema = z.object({
  email: z.string().email(),
  password: z.string()
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const RegisterResponseSchema = z.object({
  userId: z.number()
});
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

// Change password schemas
export const ChangePasswordInputSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string().min(PASSWORD_MIN_LENGTH),
  confirmPassword: z.string().min(PASSWORD_MIN_LENGTH)
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInputSchema>;

// Login schemas
export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string()
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const LoginResponseSchema = z.object({
  token: z.string(),
  // B64 encoded payload of {id, token}
  refreshToken: z.string()
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// Profile schema
export const ProfileResponseSchema = z.object({
  user: z.object({
    roles: z.array(z.nativeEnum(UserRole)),
    id: z.number(),
    email: z.string().email()
  })
});
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

export const UserDetailsSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  roles: z.array(z.nativeEnum(UserRole))
});
export type UserDetails = z.infer<typeof UserDetailsSchema>;

// The decoded contents of a refresh token
export const RefreshTokenContentsSchema = z.object({
  id: z.number(),
  token: z.string()
});
export type RefreshTokenContents = z.infer<typeof RefreshTokenContentsSchema>;

// Token schemas
export const TokenInputSchema = z.object({
  refreshToken: z.string()
});
export type TokenInput = z.infer<typeof TokenInputSchema>;

export const TokenResponseSchema = z.object({
  token: z.string()
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

// Set of user roles
export const UserRolesEnumSchema = z.nativeEnum(UserRole);
export type UserRolesEnum = z.infer<typeof UserRolesEnumSchema>;

export const UpdateUserRolesSchema = z.object({
  roles: z.array(z.nativeEnum(UserRole))
});

// Response Types
export const UserResponseSchema = z.object({
  id: z.number()
});

export type UserResponse = z.infer<typeof UserResponseSchema>;

export const UpdateUserPasswordSchema = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH)
});

// Schema Definitions
export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH),
  roles: z.array(z.nativeEnum(UserRole)).optional()
});

export const ListUserLogsResponseSchema = z.object({
  logs: z.array(
    z.object({
      id: z.number(),
      userId: z.number(),
      time: z.date(),
      action: z.nativeEnum(UserAction),
      metadata: z.any().optional(),
      user: UserDetailsSchema
    })
  ),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    pages: z.number()
  })
});
export type ListUserLogsResponse = z.infer<typeof ListUserLogsResponseSchema>;

// JWT contents
export const JwtContentsSchema = z.object({
  id: z.number(),
  email: z.string(),
  // Roles for the user
  roles: z.array(UserRolesEnumSchema)
});
export type JwtContents = z.infer<typeof JwtContentsSchema>;

// Job Result Schema (needed first for references)
export const jobResultSchema = z.object({
  id: z.number(),
  created_at: z.date(),
  job_id: z.number(),
  assignment_id: z.number(),
  result_payload: z.any().nullable(),
  storage_scheme: z.nativeEnum(StorageScheme),
  storage_uri: z.string(),
  metadata: z.any().nullable(),
  cache_valid: z.boolean()
});
export type JobResult = z.infer<typeof jobResultSchema>;

// Job Assignment Schema (with result reference)
export const jobAssignmentSchema = z.object({
  id: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
  job_id: z.number(),
  ecs_task_arn: z.string(),
  ecs_cluster_arn: z.string(),
  expires_at: z.date(),
  storage_scheme: z.nativeEnum(StorageScheme),
  storage_uri: z.string(),
  heartbeat_at: z.date().nullable(),
  completed_at: z.date().nullable(),
  result: jobResultSchema.nullable()
});
export type JobAssignment = z.infer<typeof jobAssignmentSchema>;

// Base Job Schema (without relations)
export const baseJobSchema = z.object({
  id: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
  type: z.nativeEnum(JobType),
  status: z.nativeEnum(JobStatus),
  hash: z.string(),
  user_id: z.number(),
  input_payload: z.any()
});

// Job Details Schema (with assignments relation)
export const jobDetailsSchema = baseJobSchema.extend({
  assignments: z.array(jobAssignmentSchema)
});
export type JobDetails = z.infer<typeof jobDetailsSchema>;

// Cancel job response
export const cancelJobResponseSchema = z.object({ job: baseJobSchema });
export type CancelJobResponse = z.infer<typeof cancelJobResponseSchema>;

// Job Request
export const jobRequestSchema = z.object({
  id: z.number(),
  created_at: z.date(),
  user_id: z.number(),
  type: z.nativeEnum(JobType),
  input_payload: z.any(),
  cache_hit: z.boolean(),
  job_id: z.number()
});
export type JobRequest = z.infer<typeof jobRequestSchema>;

// List Jobs Query
export const listJobsSchema = z.object({
  status: z.nativeEnum(JobStatus).optional(),
  // If the user is an admin, they can list others' jobs
  userId: z.string().optional()
});
export type ListJobsQuery = z.infer<typeof listJobsSchema>;

// List my Jobs Query
export const listMyJobsSchema = z.object({
  status: z.nativeEnum(JobStatus).optional()
});
export type ListMyJobsQuery = z.infer<typeof listMyJobsSchema>;

// List Jobs Response (uses base job schema without relations)
export const listJobsResponseSchema = z.object({
  jobs: z.array(baseJobSchema),
  total: z.number()
});
export type ListJobsResponse = z.infer<typeof listJobsResponseSchema>;

// Create Job Request
export const createJobSchema = z.object({
  type: z.nativeEnum(JobType),
  inputPayload: z.any()
});
export type CreateJobRequest = z.infer<typeof createJobSchema>;

// Create Job Response
export const createJobResponseSchema = z.object({
  jobId: z.number(),
  cached: z.boolean(),
  requestId: z.number()
});
export type CreateJobResponse = z.infer<typeof createJobResponseSchema>;

// Poll Jobs Query
export const pollJobsSchema = z.object({
  jobType: z.nativeEnum(JobType).optional()
});
export type PollJobsQuery = z.infer<typeof pollJobsSchema>;

// Poll Jobs Response (uses base job schema)
export const pollJobsResponseSchema = z.object({
  jobs: z.array(baseJobSchema)
});
export type PollJobsResponse = z.infer<typeof pollJobsResponseSchema>;

// Assign Job Request
export const assignJobSchema = z.object({
  jobId: z.number(),
  ecsTaskArn: z.string(),
  ecsClusterArn: z.string()
});
export type AssignJobRequest = z.infer<typeof assignJobSchema>;

// Job Assignment Schema (without result for assignment responses)
export const jobAssignmentWithoutResultSchema = z.object({
  id: z.number(),
  created_at: z.date(),
  updated_at: z.date(),
  job_id: z.number(),
  ecs_task_arn: z.string(),
  ecs_cluster_arn: z.string(),
  expires_at: z.date(),
  storage_scheme: z.nativeEnum(StorageScheme),
  storage_uri: z.string(),
  heartbeat_at: z.date().nullable(),
  completed_at: z.date().nullable()
});

// Assign Job Response
export const assignJobResponseSchema = z.object({
  assignment: jobAssignmentWithoutResultSchema
});
export type AssignJobResponse = z.infer<typeof assignJobResponseSchema>;

// Submit Result Request
export const submitResultSchema = z.object({
  status: z.nativeEnum(JobStatus),
  resultPayload: z.any().optional()
});
export type SubmitResultRequest = z.infer<typeof submitResultSchema>;

// Job Details Response
export const jobDetailsResponseSchema = z.object({
  job: jobDetailsSchema
});
export type JobDetailsResponse = z.infer<typeof jobDetailsResponseSchema>;

// Download Response
export const downloadResponseSchema = z.object({
  job: z.object({
    id: z.number(),
    type: z.nativeEnum(JobType),
    status: z.nativeEnum(JobStatus)
  }),
  files: z.record(z.string(), z.string())
});
export type DownloadResponse = z.infer<typeof downloadResponseSchema>;

// Data Specification Update Response
export const dataSpecificationUpdateRequestResponseSchema = z.object({
  jobId: z.number(),
  message: z.string()
});
export type DataSpecificationUpdateRequestResponse = z.infer<
  typeof dataSpecificationUpdateRequestResponseSchema
>;

// Data spec models
export const regionSchema = z.object({
  id: z.number(),
  name: z.string(),
  display_name: z.string(),
  description: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date()
});
export type Region = z.infer<typeof regionSchema>;

// Criteria Schema
export const criteriaSchema = z.object({
  id: z.number(),
  name: z.string(),
  display_title: z.string(),
  display_subtitle: z.string().nullable(),
  units: z.string().nullable(),
  min_tooltip: z.string().nullable(),
  max_tooltip: z.string().nullable(),
  payload_prefix: z.string(),
  created_at: z.date(),
  updated_at: z.date()
});
export type Criteria = z.infer<typeof criteriaSchema>;

// Regional Criteria Schema
export const regionalCriteriaSchema = z.object({
  id: z.number(),
  region_id: z.number(),
  criteria_id: z.number(),
  min_val: z.number(),
  max_val: z.number(),
  default_min_val: z.number(),
  default_max_val: z.number(),
  created_at: z.date(),
  updated_at: z.date()
});
export type RegionalCriteria = z.infer<typeof regionalCriteriaSchema>;

// Input Schemas for Data Specification Update
export const updateCriteriaInputSchema = z.object({
  name: z.string(),
  display_title: z.string(),
  display_subtitle: z.string().optional(),
  units: z.string().optional(),
  min_tooltip: z.string().optional(),
  max_tooltip: z.string().optional(),
  payload_prefix: z.string(),
  min_val: z.number(),
  max_val: z.number(),
  default_min_val: z.number(),
  default_max_val: z.number()
});
export type UpdateCriteriaInput = z.infer<typeof updateCriteriaInputSchema>;

export const updateRegionInputSchema = z.object({
  name: z.string(),
  display_name: z.string(),
  description: z.string().optional(),
  criteria: z.array(updateCriteriaInputSchema)
});
export type UpdateRegionInput = z.infer<typeof updateRegionInputSchema>;

// Main Data Specification Update Schema
export const dataSpecificationUpdateInputSchema = z.object({
  regions: z.array(updateRegionInputSchema)
});
export type DataSpecificationUpdateInput = z.infer<typeof dataSpecificationUpdateInputSchema>;

// Response Schema for GET criteria/{region}/ranges (matching your Julia endpoint)
export const criteriaRangeOutputSchema = z.record(
  z.string(),
  z.object({
    id: z.string(),
    min_val: z.number(),
    max_val: z.number(),
    display_title: z.string(),
    display_subtitle: z.string().nullable(),
    units: z.string().nullable(),
    min_tooltip: z.string().nullable(),
    max_tooltip: z.string().nullable(),
    default_min_val: z.number(),
    default_max_val: z.number(),
    payload_property_prefix: z.string()
  })
);
export type CriteriaRangeOutput = z.infer<typeof criteriaRangeOutputSchema>;

// Response Schemas
export const dataSpecificationUpdateResponseSchema = z.object({
  message: z.string(),
  updated: z.object({
    criteria_count: z.number(),
    regions_count: z.number(),
    regional_criteria_count: z.number()
  })
});
export type DataSpecificationUpdateResponse = z.infer<typeof dataSpecificationUpdateResponseSchema>;

export const listRegionsResponseSchema = z.object({
  regions: z.array(
    z.object({
      name: z.string(),
      display_name: z.string(),
      description: z.string().nullable(),
      criteria_count: z.number()
    })
  )
});
export type ListRegionsResponse = z.infer<typeof listRegionsResponseSchema>;

// ==================
// User pre approvals
// ==================

export const CreatePreApprovedUserInputSchema = z.object({
  email: z.string().email('Invalid email format'),
  roles: z.array(z.nativeEnum(UserRole)).min(1, 'At least one role must be specified')
});
export type CreatePreApprovedUserInput = z.infer<typeof CreatePreApprovedUserInputSchema>;

export const UpdatePreApprovedUserInputSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  roles: z.array(z.nativeEnum(UserRole)).min(1, 'At least one role must be specified').optional()
});
export type UpdatePreApprovedUserInput = z.infer<typeof UpdatePreApprovedUserInputSchema>;

export const BulkCreatePreApprovedUsersInputSchema = z.object({
  users: z.array(CreatePreApprovedUserInputSchema).min(1, 'At least one user must be provided')
});

export const GetPreApprovedUsersSchema = z.object({
  email: z.string().optional(),
  used: z.boolean().optional(),
  createdByUserId: z.number().optional(),
  limit: z.number().optional(),
  offset: z.number().optional()
});

export const PreApprovedUserParamsSchema = z.object({
  id: z.string()
});

// Response types
export type CreatePreApprovedUserResponse = {
  preApprovedUser: PreApprovedUser;
};

export type UpdatePreApprovedUserResponse = {
  preApprovedUser: PreApprovedUser;
};

export type GetPreApprovedUserResponse = {
  preApprovedUser: PreApprovedUser;
};

export type GetPreApprovedUsersResponse = {
  preApprovedUsers: PreApprovedUser[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
};

export type BulkCreatePreApprovedUsersResponse = {
  created: PreApprovedUser[];
  errors: Array<{ email: string; error: string }>;
  summary: {
    totalRequested: number;
    totalCreated: number;
    totalErrors: number;
  };
};

export type DeletePreApprovedUserResponse = { message: string };

// Cache Invalidation Request
export const invalidateCacheSchema = z.object({
  jobType: z.nativeEnum(JobType)
});
export type InvalidateCacheRequest = z.infer<typeof invalidateCacheSchema>;

// Cache Invalidation Response
export const invalidateCacheResponseSchema = z.object({
  message: z.string(),
  invalidated: z.object({
    jobType: z.nativeEnum(JobType),
    affectedResults: z.number()
  })
});
export type InvalidateCacheResponse = z.infer<typeof invalidateCacheResponseSchema>;

// ==================
// Project Types and Schemas
// ==================

// Project Input Schemas
export const CreateProjectInputSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  type: z.nativeEnum(ProjectType),
  project_state: z.any()
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = z.object({
  name: z.string().min(1, 'Project name is required').optional(),
  description: z.string().optional(),
  project_state: z.any().optional()
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

export const BulkCreateProjectsInputSchema = z.object({
  projects: z.array(CreateProjectInputSchema).min(1, 'At least one project must be provided'),
  userId: z.number().min(1, 'User ID is required')
});
export type BulkCreateProjectsInput = z.infer<typeof BulkCreateProjectsInputSchema>;

// Query Schemas
export const GetProjectsQuerySchema = z.object({
  type: z.nativeEnum(ProjectType).optional(),
  name: z.string().optional(),
  userId: z.number().optional(),
  limit: z.number().optional(),
  offset: z.number().optional()
});
export type GetProjectsQuery = z.infer<typeof GetProjectsQuerySchema>;

export const ProjectParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Project ID must be a number')
});
export type ProjectParams = z.infer<typeof ProjectParamsSchema>;

// Response Types
export type CreateProjectResponse = {
  project: Project;
};

export type UpdateProjectResponse = {
  project: Project;
};

export type GetProjectResponse = {
  project: Project;
};

export type GetProjectsResponse = {
  projects: Project[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
};

export type DeleteProjectResponse = {
  message: string;
};

export type BulkCreateProjectsResponse = {
  created: Project[];
  errors: Array<{ name: string; error: string }>;
  summary: {
    totalRequested: number;
    totalCreated: number;
    totalErrors: number;
  };
};

// Password reset schemas
export const PostCreateResetRequestSchema = z.object({
  email: z.string().email('Invalid email address')
});

export const PostUseResetCodeRequestSchema = z
  .object({
    code: z.string().min(1),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`),
    confirmPassword: z.string()
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword']
  });

// Response schemas
export const PostCreateResetResponseSchema = z.object({
  message: z.string()
});

export const PostUseResetCodeResponseSchema = z.object({
  message: z.string()
});

// Inferred types for request schemas
export type PostCreateResetRequest = z.infer<typeof PostCreateResetRequestSchema>;
export type PostUseResetCodeRequest = z.infer<typeof PostUseResetCodeRequestSchema>;

// Inferred types for response schemas
export type PostCreateResetResponse = z.infer<typeof PostCreateResetResponseSchema>;
export type PostUseResetCodeResponse = z.infer<typeof PostUseResetCodeResponseSchema>;

// ==================
// Project Sharing Schemas
// ==================

// Share/Unshare with Users
export const ShareProjectWithUsersInputSchema = z.object({
  userIds: z.array(z.number().positive()).min(1, 'At least one user ID must be provided')
});
export type ShareProjectWithUsersInput = z.infer<typeof ShareProjectWithUsersInputSchema>;

export const UnshareProjectWithUsersInputSchema = z.object({
  userIds: z.array(z.number().positive()).min(1, 'At least one user ID must be provided')
});
export type UnshareProjectWithUsersInput = z.infer<typeof UnshareProjectWithUsersInputSchema>;

// Share/Unshare with Groups
export const ShareProjectWithGroupsInputSchema = z.object({
  groupIds: z.array(z.number().positive()).min(1, 'At least one group ID must be provided')
});
export type ShareProjectWithGroupsInput = z.infer<typeof ShareProjectWithGroupsInputSchema>;

export const UnshareProjectWithGroupsInputSchema = z.object({
  groupIds: z.array(z.number().positive()).min(1, 'At least one group ID must be provided')
});
export type UnshareProjectWithGroupsInput = z.infer<typeof UnshareProjectWithGroupsInputSchema>;

// Set Project Publicity
export const SetProjectPublicityInputSchema = z.object({
  isPublic: z.boolean()
});
export type SetProjectPublicityInput = z.infer<typeof SetProjectPublicityInputSchema>;

// Response Types for Sharing Operations
export type ShareProjectWithUsersResponse = {
  message: string;
  shared: Array<{
    userId: number;
    userEmail: string;
  }>;
  alreadyShared: Array<{
    userId: number;
    userEmail: string;
  }>;
  errors: Array<{
    userId: number;
    error: string;
  }>;
};

export type UnshareProjectWithUsersResponse = {
  message: string;
  unshared: Array<{
    userId: number;
    userEmail: string;
  }>;
  notShared: Array<{
    userId: number;
    userEmail: string;
  }>;
  errors: Array<{
    userId: number;
    error: string;
  }>;
};

export type ShareProjectWithGroupsResponse = {
  message: string;
  shared: Array<{
    groupId: number;
    groupName: string;
  }>;
  alreadyShared: Array<{
    groupId: number;
    groupName: string;
  }>;
  errors: Array<{
    groupId: number;
    error: string;
  }>;
};

export type UnshareProjectWithGroupsResponse = {
  message: string;
  unshared: Array<{
    groupId: number;
    groupName: string;
  }>;
  notShared: Array<{
    groupId: number;
    groupName: string;
  }>;
  errors: Array<{
    groupId: number;
    error: string;
  }>;
};

export type SetProjectPublicityResponse = {
  message: string;
  project: {
    id: number;
    name: string;
    isPublic: boolean;
  };
};

// ==================
// Group Types and Schemas
// ==================

// User reference type for nested relationships
export type UserReference = {
  id: number;
  email: string;
};

// Group member with user details
export type GroupMemberWithUser = {
  group_id: number;
  user_id: number;
  user: UserReference;
  created_at: Date;
};

// Group manager with user details
export type GroupManagerWithUser = {
  group_id: number;
  user_id: number;
  user: UserReference;
  created_at: Date;
};

// Extended Group type with relationships
export type GroupWithRelations = {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  owner: UserReference;
  managers: GroupManagerWithUser[];
  members: GroupMemberWithUser[];
  created_at: Date;
  updated_at: Date;
};

// Group Input Schemas
export const CreateGroupInputSchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  description: z.string().optional()
});
export type CreateGroupInput = z.infer<typeof CreateGroupInputSchema>;

export const UpdateGroupInputSchema = z.object({
  name: z.string().min(1, 'Group name is required').optional(),
  description: z.string().optional()
});
export type UpdateGroupInput = z.infer<typeof UpdateGroupInputSchema>;

// Query Schemas
export const GetGroupsQuerySchema = z.object({
  name: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional()
});
export type GetGroupsQuery = z.infer<typeof GetGroupsQuerySchema>;

export const GroupParamsSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Group ID must be a number')
});
export type GroupParams = z.infer<typeof GroupParamsSchema>;

// Member Management Schemas
export const AddGroupMembersInputSchema = z.object({
  userIds: z.array(z.number().positive()).min(1, 'At least one user ID must be provided')
});
export type AddGroupMembersInput = z.infer<typeof AddGroupMembersInputSchema>;

export const RemoveGroupMembersInputSchema = z.object({
  userIds: z.array(z.number().positive()).min(1, 'At least one user ID must be provided')
});
export type RemoveGroupMembersInput = z.infer<typeof RemoveGroupMembersInputSchema>;

// Manager Management Schemas
export const AddGroupManagersInputSchema = z.object({
  userIds: z.array(z.number().positive()).min(1, 'At least one user ID must be provided')
});
export type AddGroupManagersInput = z.infer<typeof AddGroupManagersInputSchema>;

export const RemoveGroupManagersInputSchema = z.object({
  userIds: z.array(z.number().positive()).min(1, 'At least one user ID must be provided')
});
export type RemoveGroupManagersInput = z.infer<typeof RemoveGroupManagersInputSchema>;

// Ownership Transfer Schema
export const TransferGroupOwnershipInputSchema = z.object({
  newOwnerId: z.number().positive('New owner ID must be a positive number')
});
export type TransferGroupOwnershipInput = z.infer<typeof TransferGroupOwnershipInputSchema>;

// Response Types - Now using GroupWithRelations
export type CreateGroupResponse = {
  group: GroupWithRelations;
};

export type UpdateGroupResponse = {
  group: GroupWithRelations;
};

export type GetGroupResponse = {
  group: GroupWithRelations;
};

export type GetGroupsResponse = {
  groups: GroupWithRelations[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
};

export type DeleteGroupResponse = {
  message: string;
};

// Member Management Response Types
export type AddGroupMembersResponse = {
  message: string;
  added: Array<{
    userId: number;
    userEmail: string;
  }>;
  alreadyMembers: Array<{
    userId: number;
    userEmail: string;
  }>;
  errors: Array<{
    userId: number;
    error: string;
  }>;
};

export type RemoveGroupMembersResponse = {
  message: string;
  removed: Array<{
    userId: number;
    userEmail: string;
  }>;
  notMembers: Array<{
    userId: number;
    userEmail: string;
  }>;
  errors: Array<{
    userId: number;
    error: string;
  }>;
};

// Manager Management Response Types
export type AddGroupManagersResponse = {
  message: string;
  added: Array<{
    userId: number;
    userEmail: string;
  }>;
  alreadyManagers: Array<{
    userId: number;
    userEmail: string;
  }>;
  errors: Array<{
    userId: number;
    error: string;
  }>;
};

export type RemoveGroupManagersResponse = {
  message: string;
  removed: Array<{
    userId: number;
    userEmail: string;
  }>;
  notManagers: Array<{
    userId: number;
    userEmail: string;
  }>;
  errors: Array<{
    userId: number;
    error: string;
  }>;
};

// Ownership Transfer Response Type
export type TransferGroupOwnershipResponse = {
  message: string;
  group: GroupWithRelations;
};

// ==================
// User Search Types
// ==================

export const SearchUsersQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  limit: z.string().default('20')
});
export type SearchUsersQuery = z.infer<typeof SearchUsersQuerySchema>;

export const SearchUsersResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      email: z.string()
    })
  )
});

export type SearchUsersResponse = z.infer<typeof SearchUsersResponseSchema>;
