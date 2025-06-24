# @reefguide/cli

A command-line tool for managing ReefGuide API administrative tasks.

## Installation

```bash
pnpm install
```

## Commands

### `data-spec-reload`

Triggers a data specification reload job and monitors its progress until completion.

```bash
pnpm start data-spec-reload
```

This command will:

1. Prompt for API endpoint, username, and password (or read from environment)
2. Authenticate with the API
3. Trigger a data specification update job
4. Monitor the job status every 5 seconds until completion

## Environment Variables

You can set these environment variables to avoid interactive prompts:

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

## Usage Examples

### Development (with prompts)

```bash
pnpm start data-spec-reload
```

### With environment variables

```bash
CLI_USERNAME=admin@example.com CLI_PASSWORD=pass CLI_ENDPOINT=http://localhost:5000/api npm run dev data-spec-reload
```

### Global installation

```bash
pnpm run build
pnpm link
reef-admin data-spec-reload
```
