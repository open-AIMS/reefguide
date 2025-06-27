# @reefguide/cli

A command-line tool for managing ReefGuide API administrative tasks including data specification management and user pre-approval workflows.

## Installation

```bash
pnpm install
```

## Global Installation

For global access to the CLI:

```bash
pnpm run build
pnpm link
```

Then use `reefguide-cli` from anywhere:

```bash
reefguide-cli --help
```

## Commands

### Data Specification Management

#### `data-spec reload`

Triggers a data specification reload job with advanced monitoring options.

```bash
# Basic reload with default settings
pnpm start data-spec reload
```

#### `data-spec view` / `data-spec list`

View the current data specification including all regions and their criteria ranges.

```bash
pnpm start data-spec view
```

This command displays:

- All available regions with descriptions
- Criteria for each region including ranges, defaults, and units
- Payload prefixes for API integration

## User Audit Management

The user audit system provides tools for exporting and reviewing all users in the system, including both active users and pre-approved users.

#### `user-audit export`

Export all users to a CSV file for auditing, backup, or bulk processing.

```bash
# Export all active users (simple format)
pnpm start user-audit export users.csv

# Export all users including pre-approvals (extended format)
pnpm start user-audit export users-full.csv --include-pre-approvals

# Export with verbose output during processing
pnpm start user-audit export users.csv --verbose

# Export only active users
pnpm start user-audit export active-users.csv --status-filter active

# Export only pre-approved users
pnpm start user-audit export pre-approvals.csv --status-filter pre-approved --include-pre-approvals
```

**Options:**

- `--include-pre-approvals`: Include pre-approved users in the export
- `--status-filter <status>`: Filter by status (`active`, `pre-approved`, or `all`)
- `--verbose`: Show detailed information during export process

**CSV Output Formats:**

_Simple Format (compatible with pre-approval import):_

```csv
email,roles
admin@company.com,ADMIN;USER
user@company.com,USER
```

_Extended Format (with --include-pre-approvals):_

```csv
email,roles,status,user_id,pre_approval_id,used,used_at,created_at,created_by,notes
admin@company.com,ADMIN;USER,active,1,,,,,
pending@company.com,USER,pre-approved,,5,false,,2024-01-15T10:30:00Z,admin@company.com,New hire
```

#### `user-audit list`

Display users in the console without creating a file.

```bash
# List all active users
pnpm start user-audit list

# List all users including pre-approvals
pnpm start user-audit list --include-pre-approvals

# List first 20 users only
pnpm start user-audit list --limit 20

# List only pre-approved users
pnpm start user-audit list --status-filter pre-approved --include-pre-approvals
```

**Options:**

- `--include-pre-approvals`: Include pre-approved users in listing
- `--status-filter <status>`: Filter by status (`active`, `pre-approved`, or `all`)
- `--limit <number>`: Maximum number of users to display

**Console Output Example:**

```bash
📊 User Listing:
   ✅ Active users: 15
   ⏳ Pending pre-approvals: 3
   🔄 Used pre-approvals: 2

✅ Active Users (15):
   ✅ admin@company.com - ADMIN, USER (active)
   ✅ manager@company.com - ADMIN (active)

⏳ Pending Pre-approvals (3):
   ⏳ newbie@company.com - USER (pre-approved)
     Status: Pending
     Created: 1/15/2024 by admin@company.com
```

### Use Cases

**Regular User Audits:**

```bash
# Monthly audit export
pnpm start user-audit export "audit-$(date +%Y-%m).csv" --include-pre-approvals --verbose
```

**Access Reviews:**

```bash
# Review all admin users
pnpm start user-audit list | grep ADMIN

# Export for compliance review
pnpm start user-audit export compliance-review.csv --include-pre-approvals
```

**Troubleshooting:**

```bash
# Check pending pre-approvals
pnpm start user-audit list --status-filter pre-approved --include-pre-approvals

# Quick user count
pnpm start user-audit list --limit 0
```

## Pre-Approval Management

The pre-approval system handles both existing users and new users:

- **Existing users**: Roles are updated to include the specified roles (merging with existing roles)
- **New users**: Pre-approvals are created for future registration

#### `preapproval add-users`

Add or update users with specified roles. Automatically detects existing users and updates their roles.

```bash
# Single user - will update if exists, create pre-approval if not
pnpm start preapproval add-users "admin@example.com:ADMIN"

# Multiple users with different role combinations
pnpm start preapproval add-users "user1@example.com:ADMIN,USER" "user2@example.com:ADMIN"
```

**Behavior:**

- **Existing user**: Adds new roles to existing roles (e.g., if user has `[USER]`, adding `ADMIN` results in `[USER, ADMIN]`)
- **New user**: Creates a pre-approval that will be consumed during registration
- **Duplicate roles**: Automatically deduplicates (adding `ADMIN` to a user who already has `ADMIN` has no effect)

**Output Example:**

```bash
📊 Results:
   ✅ Users updated: 2
   🔄 Pre-approvals created: 1
   ❌ Errors: 0

✅ Updated Users:
   ✅ existing@example.com - Updated existing user (USER → USER, ADMIN)
   ✅ another@example.com - Updated existing user (no new roles added)

🔄 Pre-approvals Created:
   🔄 newuser@example.com - Created pre-approval for roles: ADMIN
```

#### `preapproval add-users-bulk`

Bulk process users from CSV file with intelligent user detection.

```bash
pnpm start preapproval add-users-bulk users.csv
```

**CSV Format:**

```csv
email,roles
existing.user@example.com,ADMIN;USER
new.user@example.com,ADMIN
current.admin@example.com,USER
```

#### `preapproval list`

Lists only pre-approved users (not existing users).

```bash
# List unused pre-approvals
pnpm start preapproval list --used false

# List all pre-approvals with higher limit
pnpm start preapproval list --limit 100
```

**Note:** This command only shows pre-approvals, not existing users. To see
existing users, use the API directly or future CLI commands.

### Smart Role Merging

The system intelligently merges roles:

```bash
# User currently has: [USER]
pnpm start preapproval add-users "user@example.com:ADMIN,MODERATOR"
# Result: [USER, ADMIN, MODERATOR]

# User currently has: [ADMIN]
pnpm start preapproval add-users "user@example.com:ADMIN,USER"
# Result: [ADMIN, USER] (ADMIN not duplicated)
```

### Use Cases

**Onboarding New Team Members:**

```bash
# CSV with mix of existing and new users
pnpm start preapproval add-users-bulk new-team-members.csv
# Existing users get immediate role updates
# New users get pre-approvals for when they register
```

**Promoting Existing Users:**

```bash
# Promote existing users to admin
pnpm start preapproval add-users "user1@company.com:ADMIN" "user2@company.com:ADMIN"
# Their existing roles are preserved and ADMIN is added
```

**Bulk Role Updates:**

```bash
# Give all users in CSV additional permissions
# Mix of existing users (immediate update) and future users (pre-approval)
pnpm start preapproval add-users-bulk role-updates.csv
```

### Error Handling

The system provides detailed error reporting:

- **Invalid emails**: Validation before processing
- **Invalid roles**: Clear error messages with valid options
- **API errors**: Network issues, permission problems
- **Partial failures**: Continues processing other users if some fail

```bash
❌ Errors:
   ❌ invalid.email - Error: Invalid email format
   ❌ user@example.com - Error: Failed to update user roles: Unauthorized
```

## Environment Variables

Set these environment variables to avoid interactive prompts:

```bash
CLI_USERNAME=admin@example.com
CLI_PASSWORD=your_password
CLI_ENDPOINT=http://localhost:5000/api
```

### Using .env file

Create a `.env` file in the project root:

```env
CLI_USERNAME=admin@example.com
CLI_PASSWORD=your_password
CLI_ENDPOINT=http://localhost:5000/api
```

## Common Issues

**CSV Import Errors:**

```bash
❌ CSV validation errors:
   Row 3: Invalid email format: not-an-email
   Row 5: Invalid roles: INVALID_ROLE. Valid roles: ADMIN, USER
```

**Authentication Failed:**

```bash
❌ Error: Invalid credentials
# Solution: Check CLI_USERNAME and CLI_PASSWORD
```

## Development

### Project Structure

```
src/
├── index.ts                    # Main CLI entry point
├── services/
│   ├── api-client.ts          # Authentication & HTTP client
│   └── job-polling.ts         # Job monitoring service
├── commands/
│   ├── data-spec.ts           # Data specification commands
│   └── preapproval.ts         # Pre-approval commands
└── types/
    └── cli-types.ts           # Shared type definitions
```

### Adding New Commands

1. Create command module in `src/commands/`
2. Import and register in `src/index.ts`
3. Use `ApiClientService` for authentication
4. Use `JobPollingService` for job monitoring

### Building

```bash
pnpm run build
```
