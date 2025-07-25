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
  // Track the submitted job ID for persistence
  submittedJobId?: number;
  // Track active charts for persistence
  activeCharts?: string[];
  // NEW: Track selected results tab (0 = Charts, 1 = Map)
  selectedResultsTab?: number;
  // NEW: Track map configuration
  mapConfig?: any;
}

export interface PersistedWorkspace {
  id: string;
  name: string;
  parameters: ModelParameters | null;
  createdAt: string; // ISO string
  lastModified: string; // ISO string
  // Persisted job ID
  submittedJobId?: number;
  // Persisted active chart titles
  activeCharts?: string[];
  // NEW: Persisted selected results tab
  selectedResultsTab?: number;
  // NEW: Persisted map configuration
  mapConfig?: any;
}

// Convert runtime workspace to persisted format
export function toPersistedWorkspace(workspace: RuntimeWorkspace): PersistedWorkspace {
  return {
    id: workspace.id,
    name: workspace.name,
    parameters: workspace.parameters ? { ...workspace.parameters } : null, // Deep copy
    createdAt: workspace.createdAt.toISOString(),
    lastModified: workspace.lastModified.toISOString(),
    submittedJobId: workspace.submittedJobId,
    activeCharts: workspace.activeCharts ? [...workspace.activeCharts] : undefined,
    selectedResultsTab: workspace.selectedResultsTab,
    mapConfig: workspace.mapConfig ? { ...workspace.mapConfig } : undefined
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
    submittedJobId: persisted.submittedJobId,
    activeCharts: persisted.activeCharts ? [...persisted.activeCharts] : undefined,
    selectedResultsTab: persisted.selectedResultsTab ?? 0, // Default to Charts tab
    mapConfig: persisted.mapConfig ? { ...persisted.mapConfig } : undefined
  };
}
