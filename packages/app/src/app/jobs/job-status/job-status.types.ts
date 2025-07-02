import { JobType } from '@reefguide/db';

/**
 * Configuration for the JobStatusComponent to make it reusable
 * across different workflows and job types.
 */
export interface JobStatusConfig {
  /** Display title for the job (e.g., "Model Run Execution", "Regional Assessment") */
  title: string;

  /** Description of what this job/workflow does */
  purpose: string;

  /** Optional subtitle for additional context */
  subtitle?: string;

  /** Custom success message when job completes */
  successMessage?: string;

  /** Custom error message prefix for failed jobs */
  errorMessagePrefix?: string;

  /** Whether to show elapsed time */
  showElapsedTime?: boolean;

  /** Whether to show estimated remaining time (if available) */
  showEstimatedTime?: boolean;

  /** Custom status messages for different states */
  customStatusMessages?: Partial<JobStatusMessages>;

  /** Whether to auto-hide component after success (useful for inline workflows) */
  autoHideOnSuccess?: boolean;

  /** Delay in ms before auto-hiding (default 3000) */
  autoHideDelay?: number;

  /** Whether to show detailed progress information */
  showDetailedProgress?: boolean;

  /** Custom icon for the job type */
  icon?: string;

  /** Theme/color scheme for the component */
  theme?: 'primary' | 'accent' | 'warn' | 'success';
}

/**
 * Custom status messages for different job states
 */
export interface JobStatusMessages {
  pending: string;
  inProgress: string;
  succeeded: string;
  failed: string;
  cancelled: string;
  timedOut: string;
}

export const BLANK_CONFIG: JobStatusConfig = {
  title: 'Unknown',
  purpose: '',
  icon: 'map',
  theme: 'primary',
  showElapsedTime: true,
  showDetailedProgress: true,
  customStatusMessages: {
    pending: 'Pending',
    inProgress: 'In progress',
    succeeded: 'Complete',
    failed: 'Failed'
  }
};

/**
 * Default configurations for common job types
 */
export const DEFAULT_JOB_CONFIGS: Record<JobType, JobStatusConfig> = {
  REGIONAL_ASSESSMENT: {
    title: 'Regional Assessment',
    purpose: 'Analyzing reef locations based on your selection criteria',
    icon: 'map',
    theme: 'primary',
    showElapsedTime: true,
    showDetailedProgress: true,
    customStatusMessages: {
      pending: 'Queuing assessment request...',
      inProgress: 'Processing reef data and applying criteria...',
      succeeded: 'Assessment complete! Map layers are ready.',
      failed: 'Assessment failed. Please check your criteria and try again.'
    }
  },

  SUITABILITY_ASSESSMENT: {
    title: 'Site Suitability Analysis',
    purpose: 'Evaluating optimal locations for reef restoration based on environmental factors',
    icon: 'location_on',
    theme: 'accent',
    showElapsedTime: true,
    showDetailedProgress: true,
    customStatusMessages: {
      pending: 'Preparing suitability analysis...',
      inProgress: 'Calculating site suitability scores...',
      succeeded: 'Suitability analysis complete! Check the map for suitable sites.',
      failed: 'Suitability analysis failed. Please adjust parameters and retry.'
    }
  },

  ADRIA_MODEL_RUN: {
    title: 'Model Run Execution',
    purpose: 'Running coral reef simulation with your specified parameters',
    icon: 'science',
    theme: 'primary',
    showElapsedTime: true,
    showEstimatedTime: true,
    showDetailedProgress: true,
    successMessage: 'Model run completed successfully! Results are ready for analysis.',
    customStatusMessages: {
      pending: 'Queuing model run in the cluster...',
      inProgress: 'Executing coral reef simulation... This may take several minutes.',
      succeeded: 'Simulation complete! Processing results...',
      failed: 'Model run failed. Please check your parameters and try again.'
    }
  },
  // These are not used in the app
  DATA_SPECIFICATION_UPDATE: BLANK_CONFIG,
  TEST: BLANK_CONFIG
};

/**
 * Utility function to get default config for a job type
 */
export function getDefaultJobConfig(jobType: JobType): JobStatusConfig {
  return { ...DEFAULT_JOB_CONFIGS[jobType] };
}

/**
 * Utility function to merge custom config with defaults
 */
export function mergeJobConfig(
  jobType: JobType,
  customConfig: Partial<JobStatusConfig>
): JobStatusConfig {
  const defaultConfig = getDefaultJobConfig(jobType);
  return {
    ...defaultConfig,
    ...customConfig,
    customStatusMessages: {
      ...defaultConfig.customStatusMessages,
      ...customConfig.customStatusMessages
    }
  };
}
