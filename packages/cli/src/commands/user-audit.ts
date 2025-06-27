import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { stringify as csvStringify } from 'csv-stringify/sync';
import { PreApprovedUser, UserRole } from '@reefguide/db';
import { ApiClientService } from '../services/api-client';
import { ExistingUser } from '../types/cli-types';
import { GetPreApprovedUsersResponse } from '@reefguide/types';

interface AuditUser {
  email: string;
  roles: UserRole[];
  status: 'active' | 'pre-approved';
  userId?: number;
  preApprovalId?: number;
  used?: boolean;
  usedAt?: string | null;
  createdAt?: string;
  createdById?: number;
}

interface UserAuditOptions {
  includePreApprovals?: boolean;
  statusFilter?: 'active' | 'pre-approved' | 'all';
}

/**
 * Fetch all existing users from the API
 */
async function fetchAllUsers(apiClient: ApiClientService): Promise<ExistingUser[]> {
  try {
    const response = await apiClient.client.get<ExistingUser[]>(`${apiClient.apiBaseUrl}/users`);
    return response.data;
  } catch (error: any) {
    throw new Error(`Failed to fetch users: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Fetch all pre-approved users from the API
 */
async function fetchAllPreApprovals(apiClient: ApiClientService): Promise<PreApprovedUser[]> {
  try {
    const allPreApprovals: PreApprovedUser[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await apiClient.client.get<GetPreApprovedUsersResponse>(
        `${apiClient.apiBaseUrl}/auth/admin/pre-approved-users`,
        { params: { limit, offset } }
      );

      const { preApprovedUsers, pagination } = response.data;
      allPreApprovals.push(...preApprovedUsers);

      // Check if we've fetched all results
      if (offset + limit >= pagination.total) {
        break;
      }

      offset += limit;
    }

    return allPreApprovals;
  } catch (error: any) {
    throw new Error(
      `Failed to fetch pre-approved users: ${error.response?.data?.message || error.message}`
    );
  }
}

/**
 * Convert users and pre-approvals to audit format
 */
function convertToAuditFormat(
  users: ExistingUser[],
  preApprovals: PreApprovedUser[],
  options: UserAuditOptions
): AuditUser[] {
  const auditUsers: AuditUser[] = [];

  // Add existing users
  if (
    options.statusFilter === 'all' ||
    options.statusFilter === 'active' ||
    !options.statusFilter
  ) {
    users.forEach(user => {
      auditUsers.push({
        email: user.email,
        roles: user.roles,
        status: 'active',
        userId: user.id
      });
    });
  }

  // Add pre-approved users if requested
  if (
    options.includePreApprovals &&
    (options.statusFilter === 'all' ||
      options.statusFilter === 'pre-approved' ||
      !options.statusFilter)
  ) {
    preApprovals.forEach(preApproval => {
      auditUsers.push({
        email: preApproval.email,
        roles: preApproval.roles,
        status: 'pre-approved',
        preApprovalId: preApproval.id,
        used: preApproval.used,
        usedAt: preApproval.used_at?.toTimeString(),
        createdAt: preApproval.created_at.toTimeString(),
        createdById: preApproval.created_by_user_id ?? undefined,
      });
    });
  }

  // Sort by email for consistent output
  return auditUsers.sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * Generate CSV content from audit users
 */
function generateCsvContent(auditUsers: AuditUser[], includePreApprovals: boolean): string {
  if (includePreApprovals) {
    // Extended format with pre-approval fields
    const csvData = auditUsers.map(user => ({
      email: user.email,
      roles: user.roles.join(';'),
      status: user.status,
      user_id: user.userId || '',
      pre_approval_id: user.preApprovalId || '',
      used: user.used !== undefined ? user.used.toString() : '',
      used_at: user.usedAt || '',
      created_at: user.createdAt || '',
      created_by: user.createdById || '',
    }));

    return csvStringify(csvData, {
      header: true,
      columns: [
        'email',
        'roles',
        'status',
        'user_id',
        'pre_approval_id',
        'used',
        'used_at',
        'created_at',
        'created_by',
        'notes'
      ]
    });
  } else {
    // Simple format matching pre-approval import format
    const csvData = auditUsers.map(user => ({
      email: user.email,
      roles: user.roles.join(';')
    }));

    return csvStringify(csvData, {
      header: true,
      columns: ['email', 'roles']
    });
  }
}

/**
 * Format user for console display
 */
function formatAuditUser(user: AuditUser): string {
  const statusIcon = user.status === 'active' ? '✅' : '⏳';
  const roles = user.roles.join(', ');

  let details = `${statusIcon} ${user.email} - ${roles} (${user.status})`;

  if (user.status === 'pre-approved') {
    const usedStatus = user.used
      ? `Used on ${new Date(user.usedAt!).toLocaleDateString()}`
      : 'Pending';
    details += `\n     Status: ${usedStatus}`;

    if (user.createdAt) {
      details += `\n     Created: ${new Date(user.createdAt).toLocaleDateString()}`;
    }

    if (user.createdById) {
      details += ` by ${user.createdById}`;
    }
  }

  return details;
}

/**
 * Command: Export user audit to CSV
 */
async function exportUserAudit(
  filepath: string,
  options: {
    includePreApprovals?: boolean;
    statusFilter?: string;
    verbose?: boolean;
  }
): Promise<void> {
  try {
    console.log('👥 Starting user audit export...');

    // Initialize API client
    const apiClient = new ApiClientService();
    await apiClient.initialize();

    // Validate and resolve file path
    const absolutePath = path.resolve(filepath);
    const directory = path.dirname(absolutePath);

    // Check if directory exists
    try {
      await fs.access(directory);
    } catch {
      throw new Error(`Directory does not exist: ${directory}`);
    }

    // Fetch data
    console.log('📊 Fetching existing users...');
    const users = await fetchAllUsers(apiClient);

    let preApprovals: PreApprovedUser[] = [];
    if (options.includePreApprovals) {
      console.log('🔄 Fetching pre-approved users...');
      preApprovals = await fetchAllPreApprovals(apiClient);
    }

    // Process data
    const auditOptions: UserAuditOptions = {
      includePreApprovals: options.includePreApprovals,
      statusFilter: options.statusFilter as 'active' | 'pre-approved' | 'all'
    };

    const auditUsers = convertToAuditFormat(users, preApprovals, auditOptions);

    // Display summary
    const activeUsers = auditUsers.filter(u => u.status === 'active');
    const preApprovedUsers = auditUsers.filter(u => u.status === 'pre-approved');
    const pendingPreApprovals = preApprovedUsers.filter(u => !u.used);
    const usedPreApprovals = preApprovedUsers.filter(u => u.used);

    console.log('\n📊 User Audit Summary:');
    console.log(`   ✅ Active users: ${activeUsers.length}`);

    if (options.includePreApprovals) {
      console.log(`   ⏳ Pending pre-approvals: ${pendingPreApprovals.length}`);
      console.log(`   🔄 Used pre-approvals: ${usedPreApprovals.length}`);
      console.log(`   📝 Total entries: ${auditUsers.length}`);
    } else {
      console.log(`   📝 Total entries: ${auditUsers.length}`);
    }

    // Show detailed list if verbose
    if (options.verbose && auditUsers.length > 0) {
      console.log('\n📋 User Details:');

      if (activeUsers.length > 0) {
        console.log(`\n✅ Active Users (${activeUsers.length}):`);
        activeUsers.forEach(user => {
          console.log(`   ${formatAuditUser(user)}`);
        });
      }

      if (pendingPreApprovals.length > 0) {
        console.log(`\n⏳ Pending Pre-approvals (${pendingPreApprovals.length}):`);
        pendingPreApprovals.forEach(user => {
          console.log(`   ${formatAuditUser(user)}`);
        });
      }

      if (usedPreApprovals.length > 0) {
        console.log(`\n🔄 Used Pre-approvals (${usedPreApprovals.length}):`);
        usedPreApprovals.forEach(user => {
          console.log(`   ${formatAuditUser(user)}`);
        });
      }
    }

    // Generate and write CSV
    console.log('\n📝 Generating CSV export...');
    const csvContent = generateCsvContent(auditUsers, !!options.includePreApprovals);

    await fs.writeFile(absolutePath, csvContent, 'utf-8');

    console.log(`✅ User audit exported successfully to: ${absolutePath}`);
    console.log(
      `📄 Format: ${options.includePreApprovals ? 'Extended (with pre-approval details)' : 'Simple (email, roles)'}`
    );

    if (!options.includePreApprovals) {
      console.log(
        '💡 Tip: Use --include-pre-approvals for detailed export with pre-approval status'
      );
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Command: List users (console only)
 */
async function listUsers(options: {
  includePreApprovals?: boolean;
  statusFilter?: string;
  limit?: string;
}): Promise<void> {
  try {
    console.log('👥 Fetching user information...');

    // Initialize API client
    const apiClient = new ApiClientService();
    await apiClient.initialize();

    // Fetch data
    console.log('📊 Fetching existing users...');
    const users = await fetchAllUsers(apiClient);

    let preApprovals: PreApprovedUser[] = [];
    if (options.includePreApprovals) {
      console.log('🔄 Fetching pre-approved users...');
      preApprovals = await fetchAllPreApprovals(apiClient);
    }

    // Process data
    const auditOptions: UserAuditOptions = {
      includePreApprovals: options.includePreApprovals,
      statusFilter: options.statusFilter as 'active' | 'pre-approved' | 'all'
    };

    let auditUsers = convertToAuditFormat(users, preApprovals, auditOptions);

    // Apply limit
    const limit = options.limit ? parseInt(options.limit, 10) : undefined;
    if (limit && limit > 0) {
      auditUsers = auditUsers.slice(0, limit);
    }

    // Display results
    const activeUsers = auditUsers.filter(u => u.status === 'active');
    const preApprovedUsers = auditUsers.filter(u => u.status === 'pre-approved');
    const pendingPreApprovals = preApprovedUsers.filter(u => !u.used);
    const usedPreApprovals = preApprovedUsers.filter(u => u.used);

    console.log('\n📊 User Listing:');
    console.log(`   ✅ Active users: ${activeUsers.length}`);

    if (options.includePreApprovals) {
      console.log(`   ⏳ Pending pre-approvals: ${pendingPreApprovals.length}`);
      console.log(`   🔄 Used pre-approvals: ${usedPreApprovals.length}`);
    }

    if (limit) {
      console.log(`   📄 Showing first ${limit} results`);
    }

    if (activeUsers.length > 0) {
      console.log(`\n✅ Active Users (${activeUsers.length}):`);
      activeUsers.forEach(user => {
        console.log(`   ${formatAuditUser(user)}`);
      });
    }

    if (pendingPreApprovals.length > 0) {
      console.log(`\n⏳ Pending Pre-approvals (${pendingPreApprovals.length}):`);
      pendingPreApprovals.forEach(user => {
        console.log(`   ${formatAuditUser(user)}`);
      });
    }

    if (usedPreApprovals.length > 0) {
      console.log(`\n🔄 Used Pre-approvals (${usedPreApprovals.length}):`);
      usedPreApprovals.forEach(user => {
        console.log(`   ${formatAuditUser(user)}`);
      });
    }

    if (auditUsers.length === 0) {
      console.log('ℹ️  No users found matching the specified criteria.');
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Create user audit commands
 */
export function createUserAuditCommands(program: Command): void {
  const userAudit = program.command('user-audit').description('User auditing and export tools');

  userAudit
    .command('export')
    .description('Export all users to CSV file')
    .argument('<filepath>', 'Path to output CSV file')
    .option('--include-pre-approvals', 'Include pre-approved users in export')
    .option('--status-filter <status>', 'Filter by status: active, pre-approved, or all', 'all')
    .option('--verbose', 'Show detailed user information during export')
    .action(async (filepath: string, options) => {
      await exportUserAudit(filepath, options);
    });

  userAudit
    .command('list')
    .description('List all users in console')
    .option('--include-pre-approvals', 'Include pre-approved users in listing')
    .option('--status-filter <status>', 'Filter by status: active, pre-approved, or all', 'all')
    .option('--limit <number>', 'Maximum number of users to display')
    .action(async options => {
      await listUsers(options);
    });
}
