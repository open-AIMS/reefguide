#!/usr/bin/env node

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { createDataSpecCommands } from './commands/data-spec';
import { createPreapprovalCommands } from './commands/pre-approval';
import { createUserAuditCommands } from './commands/user-audit';
import { createCacheManagementCommands } from './commands/cache-management';
import { createJobTimeoutCommands } from './commands/job-timeout';

// Load environment variables
dotenv.config();

// Create CLI program
const program = new Command();

program.name('reefguide-cli').description('ReefGuide Admin CLI Tool').version('0.1.0');

// Add command modules
createDataSpecCommands(program);
createPreapprovalCommands(program);
createUserAuditCommands(program);
createCacheManagementCommands(program);
createJobTimeoutCommands(program);

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
