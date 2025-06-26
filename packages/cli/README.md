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

### Pre-Approval Management

#### `preapproval add-users`

Add multiple pre-approved users with specified roles.

```bash
# Single user
pnpm start preapproval add-users "admin@example.com:ADMIN"

# Multiple users
pnpm start preapproval add-users "user1@example.com:ADMIN,USER" "user2@example.com:ADMIN"
```

**Format:** `email:ROLE1,ROLE2` where roles are comma-separated.

#### `preapproval add-users-bulk`

Bulk import pre-approved users from a CSV file.

```bash
pnpm start preapproval add-users-bulk users.csv
```

**CSV Format:**

```csv
email,roles
admin@example.com,ADMIN;USER
manager@example.com,ADMIN
user@example.com,USER
```

**CSV Requirements:**

- Header row with `email` and `roles` columns
- Roles separated by semicolons (`;`)
- Valid email addresses required
- Roles must match valid UserRole enum values

#### `preapproval list`

List all pre-approved users with filtering options.

```bash
# List all pre-approved users
pnpm start preapproval list

# Filter by status
pnpm start preapproval list --used true
pnpm start preapproval list --used false

# Limit results
pnpm start preapproval list --limit 100
```

**Options:**

- `--used <boolean>`: Filter by used status (true/false)
- `--limit <number>`: Maximum number of results (default: 50)

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
