import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse as csvParse } from 'csv-parse/sync';
import { UserRole } from '@reefguide/db';
import { ApiClientService } from '../services/api-client';
import {
  PreApprovedUser,
  ExistingUser,
  BulkCreateResponse,
  ListPreApprovedUsersResponse,
  ListOptions,
  ParsedUser,
  CsvValidationError,
  UserProcessingResult
} from '../types/cli-types';

// Utility functions
function parseRoles(rolesString: string): UserRole[] {
  const validRoles = Object.values(UserRole) as string[];
  const roles = rolesString.split(',').map((r: string) => r.trim().toUpperCase());

  const invalidRoles = roles.filter((role: string) => !validRoles.includes(role));
  if (invalidRoles.length > 0) {
    throw new Error(
      `Invalid roles: ${invalidRoles.join(', ')}. Valid roles are: ${validRoles.join(', ')}`
    );
  }

  return roles as UserRole[];
}

function parseUserInput(input: string): ParsedUser {
  const parts = input.split(':');
  if (parts.length !== 2) {
    throw new Error(`Invalid format: ${input}. Expected format: email:ROLE1,ROLE2`);
  }

  const [email, rolesString] = parts;

  if (!email.includes('@')) {
    throw new Error(`Invalid email: ${email}`);
  }

  const roles = parseRoles(rolesString);

  return { email: email.trim(), roles };
}

function mergeRoles(existingRoles: UserRole[], newRoles: UserRole[]): UserRole[] {
  const allRoles = [...existingRoles];

  for (const role of newRoles) {
    if (!allRoles.includes(role)) {
      allRoles.push(role);
    }
  }

  return allRoles;
}

async function findExistingUser(
  apiClient: ApiClientService,
  email: string
): Promise<ExistingUser | null> {
  try {
    // Get all users and find by email (since there's no direct email lookup endpoint)
    const response = await apiClient.client.get<ExistingUser[]>(`${apiClient.apiBaseUrl}/users`);
    const users = response.data;

    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    return user || null;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function findExistingPreApproval(
  apiClient: ApiClientService,
  email: string
): Promise<PreApprovedUser | null> {
  try {
    // Get pre-approved user by email - we need to search through the list since there's no direct endpoint
    const response = await apiClient.client.get<ListPreApprovedUsersResponse>(
      `${apiClient.apiBaseUrl}/auth/admin/pre-approved-users`,
      { params: { email: email, limit: 1 } }
    );

    const users = response.data.preApprovedUsers;
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    return user || null;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

async function updateUserRoles(
  apiClient: ApiClientService,
  userId: number,
  roles: UserRole[]
): Promise<ExistingUser> {
  try {
    const response = await apiClient.client.put<ExistingUser>(
      `${apiClient.apiBaseUrl}/users/${userId}/roles`,
      { roles }
    );
    return response.data;
  } catch (error: any) {
    throw new Error(
      `Failed to update user roles: ${error.response?.data?.message || error.message}`
    );
  }
}

async function createPreApproval(
  apiClient: ApiClientService,
  user: ParsedUser
): Promise<PreApprovedUser> {
  try {
    const response = await apiClient.client.post<{ preApprovedUser: PreApprovedUser }>(
      `${apiClient.apiBaseUrl}/auth/admin/pre-approved-users`,
      {
        email: user.email,
        roles: user.roles
      }
    );
    return response.data.preApprovedUser;
  } catch (error: any) {
    throw new Error(
      `Failed to create pre-approval: ${error.response?.data?.message || error.message}`
    );
  }
}

async function updatePreApproval(
  apiClient: ApiClientService,
  preApprovalId: number,
  roles: UserRole[]
): Promise<PreApprovedUser> {
  try {
    const response = await apiClient.client.put<{ preApprovedUser: PreApprovedUser }>(
      `${apiClient.apiBaseUrl}/auth/admin/pre-approved-users/${preApprovalId}`,
      { roles }
    );
    return response.data.preApprovedUser;
  } catch (error: any) {
    throw new Error(
      `Failed to update pre-approval: ${error.response?.data?.message || error.message}`
    );
  }
}

async function processUsersWithBulkFallback(
  apiClient: ApiClientService,
  users: ParsedUser[]
): Promise<UserProcessingResult[]> {
  const results: UserProcessingResult[] = [];

  // First, separate existing users from potential pre-approvals
  const potentialPreApprovals: ParsedUser[] = [];

  console.log('\n🔍 Checking for existing users...');
  for (const user of users) {
    const existingUser = await findExistingUser(apiClient, user.email);
    if (existingUser) {
      // Process existing user immediately
      const originalRoles = [...existingUser.roles];
      const mergedRoles = mergeRoles(existingUser.roles, user.roles);

      if (mergedRoles.length > originalRoles.length) {
        try {
          const updatedUser = await updateUserRoles(apiClient, existingUser.id, mergedRoles);
          results.push({
            email: user.email,
            action: 'updated',
            user: updatedUser,
            originalRoles,
            newRoles: mergedRoles
          });
        } catch (error: any) {
          results.push({
            email: user.email,
            action: 'error',
            error: error.message
          });
        }
      } else {
        results.push({
          email: user.email,
          action: 'updated',
          user: existingUser,
          originalRoles,
          newRoles: originalRoles
        });
      }
    } else {
      potentialPreApprovals.push(user);
    }
  }

  // Now handle pre-approvals with bulk API + fallback
  if (potentialPreApprovals.length > 0) {
    console.log(
      `\n🔄 Processing ${potentialPreApprovals.length} potential pre-approvals with bulk API...`
    );

    try {
      // Try bulk create
      const bulkResponse = await apiClient.client.post<BulkCreateResponse>(
        `${apiClient.apiBaseUrl}/auth/admin/pre-approved-users/bulk`,
        { users: potentialPreApprovals }
      );

      // Handle successful creations
      bulkResponse.data.created.forEach(preApproval => {
        results.push({
          email: preApproval.email,
          action: 'pre-approved',
          preApproval
        });
      });

      // Handle errors - try to update existing pre-approvals
      console.log(
        `\n🔍 Checking ${bulkResponse.data.errors.length} failed entries for existing pre-approvals...`
      );
      for (const error of bulkResponse.data.errors) {
        const originalUser = potentialPreApprovals.find(u => u.email === error.email);
        if (!originalUser) continue;

        try {
          // Check if this is an existing pre-approval
          const existingPreApproval = await findExistingPreApproval(apiClient, error.email);

          if (existingPreApproval) {
            // Update existing pre-approval
            const originalRoles = [...existingPreApproval.roles];
            const mergedRoles = mergeRoles(existingPreApproval.roles, originalUser.roles);

            if (mergedRoles.length > originalRoles.length) {
              const updatedPreApproval = await updatePreApproval(
                apiClient,
                existingPreApproval.id,
                mergedRoles
              );
              results.push({
                email: error.email,
                action: 'pre-approved',
                preApproval: updatedPreApproval,
                originalRoles,
                newRoles: mergedRoles
              });
            } else {
              results.push({
                email: error.email,
                action: 'pre-approved',
                preApproval: existingPreApproval,
                originalRoles,
                newRoles: originalRoles
              });
            }
          } else {
            // Real error - not an existing pre-approval
            results.push({
              email: error.email,
              action: 'error',
              error: error.error
            });
          }
        } catch (fallbackError: any) {
          results.push({
            email: error.email,
            action: 'error',
            error: `Bulk creation failed: ${error.error}. Fallback failed: ${fallbackError.message}`
          });
        }
      }
    } catch (bulkError: any) {
      // If bulk API completely fails, process each pre-approval individually
      console.log('\n⚠️  Bulk API failed, processing pre-approvals individually...');

      for (const user of potentialPreApprovals) {
        try {
          const existingPreApproval = await findExistingPreApproval(apiClient, user.email);

          if (existingPreApproval) {
            // Update existing pre-approval
            const originalRoles = [...existingPreApproval.roles];
            const mergedRoles = mergeRoles(existingPreApproval.roles, user.roles);

            if (mergedRoles.length > originalRoles.length) {
              const updatedPreApproval = await updatePreApproval(
                apiClient,
                existingPreApproval.id,
                mergedRoles
              );
              results.push({
                email: user.email,
                action: 'pre-approved',
                preApproval: updatedPreApproval,
                originalRoles,
                newRoles: mergedRoles
              });
            } else {
              results.push({
                email: user.email,
                action: 'pre-approved',
                preApproval: existingPreApproval,
                originalRoles,
                newRoles: originalRoles
              });
            }
          } else {
            // Create new pre-approval
            const preApproval = await createPreApproval(apiClient, user);
            results.push({
              email: user.email,
              action: 'pre-approved',
              preApproval
            });
          }
        } catch (individualError: any) {
          results.push({
            email: user.email,
            action: 'error',
            error: individualError.message
          });
        }
      }
    }
  }

  return results;
}

async function validateCsvFile(filepath: string): Promise<ParsedUser[]> {
  try {
    const fileContent = await fs.readFile(filepath, 'utf-8');
    const records = csvParse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as Record<string, string>[];

    if (records.length === 0) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const requiredColumns = ['email', 'roles'];
    const firstRecord = records[0];
    const missingColumns = requiredColumns.filter((col: string) => !(col in firstRecord));

    if (missingColumns.length > 0) {
      throw new Error(
        `Missing required columns: ${missingColumns.join(', ')}. Found columns: ${Object.keys(firstRecord).join(', ')}`
      );
    }

    const users: ParsedUser[] = [];
    const errors: CsvValidationError[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const rowNum = i + 2; // +2 because CSV parsing is 0-indexed and we have a header row

      try {
        const email = record.email?.trim();
        const rolesString = record.roles?.trim();

        if (!email) {
          errors.push({ row: rowNum, error: 'Email is required' });
          continue;
        }

        if (!email.includes('@')) {
          errors.push({ row: rowNum, error: `Invalid email format: ${email}` });
          continue;
        }

        if (!rolesString) {
          errors.push({ row: rowNum, error: 'Roles are required' });
          continue;
        }

        // Parse roles (semicolon separated in CSV)
        const roles = rolesString.split(';').map((r: string) => r.trim().toUpperCase());
        const validRoles = Object.values(UserRole) as string[];
        const invalidRoles = roles.filter((role: string) => !validRoles.includes(role));

        if (invalidRoles.length > 0) {
          errors.push({
            row: rowNum,
            error: `Invalid roles: ${invalidRoles.join(', ')}. Valid roles: ${validRoles.join(', ')}`
          });
          continue;
        }

        users.push({ email, roles: roles as UserRole[] });
      } catch (error: any) {
        errors.push({ row: rowNum, error: error.message });
      }
    }

    if (errors.length > 0) {
      console.error('❌ CSV validation errors:');
      errors.forEach(({ row, error }: CsvValidationError) => {
        console.error(`   Row ${row}: ${error}`);
      });
      throw new Error(`CSV validation failed with ${errors.length} error(s)`);
    }

    return users;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`File not found: ${filepath}`);
    }
    throw error;
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

function formatPreApprovedUser(user: PreApprovedUser): string {
  const status = user.used ? '✅ Used' : '⏳ Pending';
  const usedAt = user.used_at ? ` (${formatDate(user.used_at)})` : '';
  const createdBy = user.created_by_user ? ` by ${user.created_by_user.email}` : '';
  const notes = user.notes ? `\n     Notes: ${user.notes}` : '';

  return `📧 ${user.email}
     Roles: ${user.roles.join(', ')}
     Status: ${status}${usedAt}
     Created: ${formatDate(user.created_at)}${createdBy}${notes}`;
}

function formatUserProcessingResult(result: UserProcessingResult): string {
  switch (result.action) {
    case 'updated':
      if (result.originalRoles && result.newRoles) {
        const roleChange =
          result.originalRoles.length !== result.newRoles.length
            ? ` (${result.originalRoles.join(', ')} → ${result.newRoles.join(', ')})`
            : ' (no new roles added)';
        return `✅ ${result.email} - Updated existing user${roleChange}`;
      }
      return `✅ ${result.email} - Updated existing user`;

    case 'pre-approved':
      if (result.originalRoles && result.newRoles) {
        const roleChange =
          result.originalRoles.length !== result.newRoles.length
            ? ` (${result.originalRoles.join(', ')} → ${result.newRoles.join(', ')})`
            : ' (no new roles added)';
        return `🔄 ${result.email} - Updated existing pre-approval${roleChange}`;
      }
      return `🔄 ${result.email} - Created pre-approval for roles: ${result.preApproval?.roles.join(', ')}`;

    case 'error':
      return `❌ ${result.email} - Error: ${result.error}`;

    default:
      return `❓ ${result.email} - Unknown action`;
  }
}

// Command implementations
async function addUsers(userInputs: string[]): Promise<void> {
  try {
    console.log(
      '👥 Processing users (updating existing users/pre-approvals or creating new pre-approvals)...'
    );

    // Parse and validate inputs
    const users = userInputs.map((input: string) => parseUserInput(input));

    console.log(`📝 Parsed ${users.length} user(s):`);
    users.forEach((user: ParsedUser) => {
      console.log(`   ${user.email} → ${user.roles.join(', ')}`);
    });

    // Initialize API client
    const apiClient = new ApiClientService();
    await apiClient.initialize();

    // Process users with bulk API and fallback
    const results = await processUsersWithBulkFallback(apiClient, users);

    // Display results
    const updated = results.filter(r => r.action === 'updated');
    const preApproved = results.filter(r => r.action === 'pre-approved');
    const errors = results.filter(r => r.action === 'error');

    console.log('\n📊 Results:');
    console.log(`   ✅ Users updated: ${updated.length}`);
    console.log(`   🔄 Pre-approvals processed: ${preApproved.length}`);
    console.log(`   ❌ Errors: ${errors.length}`);

    if (updated.length > 0) {
      console.log('\n✅ Updated Users:');
      updated.forEach((result: UserProcessingResult) => {
        console.log(`   ${formatUserProcessingResult(result)}`);
      });
    }

    if (preApproved.length > 0) {
      console.log('\n🔄 Pre-approvals Processed:');
      preApproved.forEach((result: UserProcessingResult) => {
        console.log(`   ${formatUserProcessingResult(result)}`);
      });
    }

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach((result: UserProcessingResult) => {
        console.log(`   ${formatUserProcessingResult(result)}`);
      });
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.response?.data?.message || error.message}`);
    process.exit(1);
  }
}

async function addUsersBulk(filepath: string): Promise<void> {
  try {
    console.log(`📂 Processing CSV file: ${filepath}`);

    // Validate file exists and has correct format
    const absolutePath = path.resolve(filepath);
    const users = await validateCsvFile(absolutePath);

    console.log(`📝 Validated ${users.length} user(s) from CSV:`);
    users.slice(0, 5).forEach((user: ParsedUser) => {
      console.log(`   ${user.email} → ${user.roles.join(', ')}`);
    });

    if (users.length > 5) {
      console.log(`   ... and ${users.length - 5} more`);
    }

    // Initialize API client
    const apiClient = new ApiClientService();
    await apiClient.initialize();

    // Process users with bulk API and fallback
    const results = await processUsersWithBulkFallback(apiClient, users);

    // Display results
    const updated = results.filter(r => r.action === 'updated');
    const preApproved = results.filter(r => r.action === 'pre-approved');
    const errors = results.filter(r => r.action === 'error');

    // Further categorize pre-approvals
    const newPreApprovals = preApproved.filter(r => !r.originalRoles);
    const updatedPreApprovals = preApproved.filter(r => r.originalRoles);

    console.log('\n📊 Bulk Processing Results:');
    console.log(`   📝 Total processed: ${users.length}`);
    console.log(`   ✅ Users updated: ${updated.length}`);
    console.log(`   🆕 New pre-approvals created: ${newPreApprovals.length}`);
    console.log(`   🔄 Existing pre-approvals updated: ${updatedPreApprovals.length}`);
    console.log(`   ❌ Errors: ${errors.length}`);

    if (updated.length > 0) {
      console.log('\n✅ Updated Users:');
      updated.forEach((result: UserProcessingResult) => {
        console.log(`   ${formatUserProcessingResult(result)}`);
      });
    }

    if (newPreApprovals.length > 0) {
      console.log('\n🆕 New Pre-approvals Created:');
      newPreApprovals.forEach((result: UserProcessingResult) => {
        console.log(`   ${formatUserProcessingResult(result)}`);
      });
    }

    if (updatedPreApprovals.length > 0) {
      console.log('\n🔄 Existing Pre-approvals Updated:');
      updatedPreApprovals.forEach((result: UserProcessingResult) => {
        console.log(`   ${formatUserProcessingResult(result)}`);
      });
    }

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach((result: UserProcessingResult) => {
        console.log(`   ${formatUserProcessingResult(result)}`);
      });
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.response?.data?.message || error.message}`);
    process.exit(1);
  }
}

async function listPreApprovals(options: ListOptions): Promise<void> {
  try {
    console.log('📋 Fetching pre-approved users...');

    // Initialize API client
    const apiClient = new ApiClientService();
    await apiClient.initialize();

    // Build query parameters
    const params: Record<string, string | number> = {};
    if (options.used !== undefined) {
      params.used = options.used;
    }
    if (options.limit) {
      params.limit = parseInt(options.limit, 10);
    }

    // Make API call
    const response = await apiClient.client.get<ListPreApprovedUsersResponse>(
      `${apiClient.apiBaseUrl}/auth/admin/pre-approved-users`,
      { params }
    );

    const { preApprovedUsers, pagination } = response.data;

    if (preApprovedUsers.length === 0) {
      console.log('ℹ️  No pre-approved users found.');
      return;
    }

    // Display summary
    console.log(
      `\n📊 Found ${preApprovedUsers.length} pre-approved user(s) (Total: ${pagination.total}):\n`
    );

    // Group by status
    const pending = preApprovedUsers.filter((u: PreApprovedUser) => !u.used);
    const used = preApprovedUsers.filter((u: PreApprovedUser) => u.used);

    if (pending.length > 0) {
      console.log(`⏳ Pending Pre-approvals (${pending.length}):`);
      pending.forEach((user: PreApprovedUser) => {
        console.log(formatPreApprovedUser(user));
        console.log('');
      });
    }

    if (used.length > 0) {
      console.log(`✅ Used Pre-approvals (${used.length}):`);
      used.forEach((user: PreApprovedUser) => {
        console.log(formatPreApprovedUser(user));
        console.log('');
      });
    }

    // Show pagination info if there are more results
    if (pagination.total > preApprovedUsers.length) {
      console.log(`📄 Showing ${preApprovedUsers.length} of ${pagination.total} total results`);
      console.log('   Use --limit option to see more results');
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.response?.data?.message || error.message}`);
    process.exit(1);
  }
}

// Export function to create commands
export function createPreapprovalCommands(program: Command): void {
  const preapproval = program
    .command('preapproval')
    .description('Manage users and pre-approved users');

  preapproval
    .command('add-users')
    .description('Add users (update existing users/pre-approvals or create new pre-approvals)')
    .argument(
      '<users...>',
      'User specifications in format email:ROLE1,ROLE2 (e.g., "user@example.com:ADMIN,USER")'
    )
    .action(async (userInputs: string[]) => {
      await addUsers(userInputs);
    });

  preapproval
    .command('add-users-bulk')
    .description(
      'Bulk process users from CSV file (update existing users/pre-approvals or create new ones)'
    )
    .argument('<filepath>', 'Path to CSV file with columns: email, roles (semicolon-separated)')
    .action(async (filepath: string) => {
      await addUsersBulk(filepath);
    });

  preapproval
    .command('list')
    .description('List all pre-approved users (does not include existing users)')
    .option('--used <boolean>', 'Filter by used status (true/false)')
    .option('--limit <number>', 'Maximum number of results to return', '50')
    .action(async (options: ListOptions) => {
      await listPreApprovals(options);
    });
}
