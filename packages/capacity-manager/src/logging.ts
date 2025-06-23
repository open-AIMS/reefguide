import winston from 'winston';

/**
 * Winston logger configuration
 *
 * This logger provides structured logging with timestamps and log levels.
 * The log level can be configured via the LOG_LEVEL environment variable.
 *
 * Available log levels (in order of verbosity):
 * - error: 0 (least verbose, only errors)
 * - warn: 1 (errors and warnings)
 * - info: 2 (errors, warnings, and info - default)
 * - http: 3 (errors, warnings, info, and HTTP requests)
 * - verbose: 4 (all above plus verbose details)
 * - debug: 5 (all above plus debug information)
 * - silly: 6 (most verbose level)
 *
 * Setting LOG_LEVEL to a specific level will include all logs at that level
 * and below (less verbose). For example, setting LOG_LEVEL=warn will include
 * error and warn logs, but not info, http, etc.
 */

/**
 * Creates a configured winston logger instance
 * Format includes timestamp and structured JSON for metadata
 */
export const logger = winston.createLogger({
  // Get log level from environment variable or default to 'info'
  level: (process.env.LOG_LEVEL || 'info').toLowerCase(),

  // Define log format with timestamp and metadata
  format: winston.format.combine(
    // Add timestamp to all log entries
    winston.format.timestamp(),

    // Custom formatter to include metadata as JSON
    winston.format.printf(({ level, message, timestamp, ...metadata }) => {
      return `[${timestamp}] [${level.toUpperCase()}] ${message} ${
        Object.keys(metadata).length ? JSON.stringify(metadata) : ''
      }`;
    })
  ),

  // Define where logs are sent - console for basic setup
  transports: [new winston.transports.Console()]
});
