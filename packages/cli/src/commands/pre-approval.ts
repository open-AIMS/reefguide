/**
 * Module to manage pre approvals including bulk loading from CSV
 */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse as csvParse } from 'csv-parse/sync';
import { UserRole } from '@reefguide/db';
import { ApiClientService } from '../services/api-client';
import {
  PreApprovedUser,
  BulkCreateResponse,
  ListPreApprovedUsersResponse,
  ListOptions,
  ParsedUser,
  CsvValidationError
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

// Command implementations
async function addUsers(userInputs: string[]): Promise<void> {
  try {
    console.log('👥 Adding pre-approved users...');

    // Parse and validate inputs
    const users = userInputs.map((input: string) => parseUserInput(input));

    console.log(`📝 Parsed ${users.length} user(s):`);
    users.forEach((user: ParsedUser) => {
      console.log(`   ${user.email} → ${user.roles.join(', ')}`);
    });

    // Initialize API client
    const apiClient = new ApiClientService();
    await apiClient.initialize();

    // Make API call
    const response = await apiClient.client.post<BulkCreateResponse>(
      `${apiClient.apiBaseUrl}/auth/admin/pre-approved-users/bulk`,
      { users }
    );

    // Display results
    const { created, errors, summary } = response.data;

    console.log(`\n📊 Results:`);
    console.log(`   ✅ Successfully created: ${summary.totalCreated}`);
    console.log(`   ❌ Errors: ${summary.totalErrors}`);

    if (created.length > 0) {
      console.log('\n✅ Successfully created:');
      created.forEach((user: PreApprovedUser) => {
        console.log(`   ${user.email} (ID: ${user.id})`);
      });
    }

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(({ email, error }: { email: string; error: string }) => {
        console.log(`   ${email}: ${error}`);
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

    // Make API call
    console.log('\n🚀 Sending bulk request to API...');
    const response = await apiClient.client.post<BulkCreateResponse>(
      `${apiClient.apiBaseUrl}/auth/admin/pre-approved-users/bulk`,
      { users }
    );

    // Display results
    const { created, errors, summary } = response.data;

    console.log(`\n📊 Bulk Import Results:`);
    console.log(`   📝 Total requested: ${summary.totalRequested}`);
    console.log(`   ✅ Successfully created: ${summary.totalCreated}`);
    console.log(`   ❌ Errors: ${summary.totalErrors}`);

    if (created.length > 0) {
      console.log('\n✅ Successfully created:');
      created.forEach((user: PreApprovedUser) => {
        console.log(`   ${user.email} → ${user.roles.join(', ')} (ID: ${user.id})`);
      });
    }

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(({ email, error }: { email: string; error: string }) => {
        console.log(`   ${email}: ${error}`);
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
      console.log(`   Use --limit option to see more results`);
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.response?.data?.message || error.message}`);
    process.exit(1);
  }
}

// Export function to create commands
export function createPreapprovalCommands(program: Command): void {
  const preapproval = program.command('preapproval').description('Manage pre-approved users');

  preapproval
    .command('add-users')
    .description('Add multiple pre-approved users with specified roles')
    .argument(
      '<users...>',
      'User specifications in format email:ROLE1,ROLE2 (e.g., "user@example.com:ADMIN,USER")'
    )
    .action(async (userInputs: string[]) => {
      await addUsers(userInputs);
    });

  preapproval
    .command('add-users-bulk')
    .description('Bulk add pre-approved users from CSV file')
    .argument('<filepath>', 'Path to CSV file with columns: email, roles (semicolon-separated)')
    .action(async (filepath: string) => {
      await addUsersBulk(filepath);
    });

  preapproval
    .command('list')
    .description('List all pre-approved users')
    .option('--used <boolean>', 'Filter by used status (true/false)')
    .option('--limit <number>', 'Maximum number of results to return', '50')
    .action(async (options: ListOptions) => {
      await listPreApprovals(options);
    });
}
