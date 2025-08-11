// Helper functions to convert between runtime and persisted workspace formats
import { JobDetailsResponse } from '@reefguide/types';
import { ModelParameters } from '../parameter-config/parameter-config.component';

export interface RuntimeWorkspace {
  id: string;
  name: string;
  parameters: ModelParameters | null;
  // we don't persist this - reload from server
  job: JobDetailsResponse['job'] | null;
  workflowState: 'configuring' | 'submitting' | 'monitoring' | 'viewing';
  createdAt: Date;
  lastModified: Date;
  submittedJobId?: number;
  activeCharts?: string[];
  // (0 = Charts, 1 = Map)
  selectedResultsTab?: number;
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
  // Persisted selected results tab
  selectedResultsTab?: number;
  // Persisted map configuration
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
    job: null,
    workflowState: 'configuring', // Will be updated based on job status
    createdAt: new Date(persisted.createdAt),
    lastModified: new Date(persisted.lastModified),
    submittedJobId: persisted.submittedJobId,
    activeCharts: persisted.activeCharts ? [...persisted.activeCharts] : undefined,
    selectedResultsTab: persisted.selectedResultsTab ?? 0, // Default to Charts tab
    mapConfig: persisted.mapConfig ? { ...persisted.mapConfig } : undefined
  };
}
