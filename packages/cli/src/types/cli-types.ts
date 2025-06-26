import { UserRole } from '@reefguide/db';

// API Response Types
export interface PreApprovedUser {
  id: number;
  email: string;
  roles: UserRole[];
  used: boolean;
  used_at: string | null;
  created_at: string;
  notes?: string;
  created_by_user?: {
    id: number;
    email: string;
  };
}

export interface BulkCreateResponse {
  created: PreApprovedUser[];
  errors: Array<{ email: string; error: string }>;
  summary: {
    totalRequested: number;
    totalCreated: number;
    totalErrors: number;
  };
}

export interface ListPreApprovedUsersResponse {
  preApprovedUsers: PreApprovedUser[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

// Command Option Types
export interface ListOptions {
  used?: string;
  limit?: string;
}

export interface ParsedUser {
  email: string;
  roles: UserRole[];
}

export interface CsvValidationError {
  row: number;
  error: string;
}
