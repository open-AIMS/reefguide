// src/app/model-workflow/services/workspace-persistence.types.ts

// Helper functions to convert between runtime and persisted workspace formats
import { ModelParameters } from '../parameter-config/parameter-config.component';

export interface RuntimeWorkspace {
  id: string;
  name: string;
  parameters: ModelParameters | null;
  job: any | null; // JobDetailsResponse['job'] - we don't persist this
  workflowState: 'configuring' | 'submitting' | 'monitoring' | 'viewing';
  createdAt: Date;
  lastModified: Date;
  // NEW: Track the submitted job ID for persistence
  submittedJobId?: number;
}

export interface PersistedWorkspace {
  id: string;
  name: string;
  parameters: ModelParameters | null;
  createdAt: string; // ISO string
  lastModified: string; // ISO string
  // NEW: Persisted job ID
  submittedJobId?: number;
}

// Convert runtime workspace to persisted format
export function toPersistedWorkspace(workspace: RuntimeWorkspace): PersistedWorkspace {
  return {
    id: workspace.id,
    name: workspace.name,
    parameters: workspace.parameters ? { ...workspace.parameters } : null, // Deep copy
    createdAt: workspace.createdAt.toISOString(),
    lastModified: workspace.lastModified.toISOString(),
    submittedJobId: workspace.submittedJobId
  };
}

// Convert persisted workspace to runtime format
export function toRuntimeWorkspace(persisted: PersistedWorkspace): RuntimeWorkspace {
  return {
    id: persisted.id,
    name: persisted.name,
    parameters: persisted.parameters ? { ...persisted.parameters } : null, // Deep copy
    job: null, // Always start with no job - this will be loaded separately
    workflowState: 'configuring', // Will be updated based on job status
    createdAt: new Date(persisted.createdAt),
    lastModified: new Date(persisted.lastModified),
    submittedJobId: persisted.submittedJobId
  };
}
