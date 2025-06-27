import { PreApprovedUser, UserRole } from '@reefguide/db';
import { JwtContents } from '@reefguide/types';

export type ExistingUser = JwtContents;

export interface ParsedUser {
  email: string;
  roles: UserRole[];
}

export interface UserProcessingResult {
  email: string;
  action: 'updated' | 'pre-approved' | 'error';
  user?: ExistingUser;
  preApproval?: PreApprovedUser;
  error?: string;
  originalRoles?: UserRole[];
  newRoles?: UserRole[];
}

export interface BulkUserProcessingResponse {
  results: UserProcessingResult[];
  summary: {
    totalRequested: number;
    totalUpdated: number;
    totalPreApproved: number;
    totalErrors: number;
  };
}

// Command Option Types
export interface ListOptions {
  used?: string;
  limit?: string;
}

export interface CsvValidationError {
  row: number;
  error: string;
}
