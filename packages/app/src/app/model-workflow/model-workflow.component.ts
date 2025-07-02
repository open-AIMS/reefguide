// src/app/model-workflow/model-workflow.component.ts
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { JobDetailsResponse } from '@reefguide/types';
import { WebApiService } from '../../api/web-api.service';
import { JobStatusComponent } from '../jobs/job-status/job-status.component';
import { JobStatusConfig, mergeJobConfig } from '../jobs/job-status/job-status.types';
import {
  ParameterConfigComponent,
  ModelParameters
} from './parameter-config/parameter-config.component';
import { ResultsViewComponent } from './results-view/results-view.component';

type WorkflowState = 'configuring' | 'submitting' | 'monitoring' | 'viewing';

@Component({
  selector: 'app-model-workflow',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    ParameterConfigComponent,
    JobStatusComponent,
    ResultsViewComponent
  ],
  templateUrl: './model-workflow.component.html',
  styleUrl: './model-workflow.component.scss'
})
export class ModelWorkflowComponent {
  private readonly api = inject(WebApiService);
  private readonly router = inject(Router);

  // Workflow state management
  workflowState = signal<WorkflowState>('configuring');
  currentJob = signal<JobDetailsResponse['job'] | null>(null);
  currentParameters = signal<ModelParameters | null>(null);

  // Computed properties for template
  isConfiguring = computed(() => this.workflowState() === 'configuring');
  isSubmitting = computed(() => this.workflowState() === 'submitting');
  isMonitoring = computed(() => this.workflowState() === 'monitoring');
  isViewing = computed(() => this.workflowState() === 'viewing');

  // Job configuration for status component
  jobConfig: JobStatusConfig = mergeJobConfig('ADRIA_MODEL_RUN', {
    title: 'Coral Reef Model Execution',
    purpose:
      'Running coral reef simulation with your deployment parameters across multiple scenarios',
    showElapsedTime: true,
    showDetailedProgress: true,
    theme: 'primary',
    successMessage: 'Model simulation completed! Results are ready for analysis.',
    customStatusMessages: {
      pending: 'Allocating computational resources for model run...',
      inProgress: 'Executing coral reef simulation scenarios... This may take several minutes.',
      succeeded: 'Simulation complete! Processing results and generating figures...'
    }
  });

  // Handle parameter submission from left panel
  onParametersSubmitted(parameters: ModelParameters): void {
    console.log('Parameters submitted:', parameters);

    this.currentParameters.set(parameters);
    this.workflowState.set('submitting');

    // Update job config with scenario count
    this.jobConfig = mergeJobConfig('ADRIA_MODEL_RUN', {
      ...this.jobConfig,
      subtitle: `${parameters.numScenarios} scenarios`,
      purpose: `Running coral reef simulation with ${parameters.numScenarios} scenarios to model restoration outcomes`
    });

    // Convert parameters to API payload
    const payload = ParameterConfigComponent.toAdriaModelRunInput(parameters);

    console.log('Starting ADRIA model run job with payload:', payload);

    // Start the job
    this.api.startJob('ADRIA_MODEL_RUN', payload).subscribe({
      next: job => {
        console.log('Job started:', job);
        this.currentJob.set(job);
        this.workflowState.set('monitoring');
      },
      error: error => {
        console.error('Failed to start job:', error);
        this.workflowState.set('configuring');
        // TODO: Show error message to user
      }
    });
  }

  // Handle job completion from status component
  onJobCompleted(job: JobDetailsResponse['job']): void {
    console.log('Job completed:', job);

    this.currentJob.set(job);

    if (job.status === 'SUCCEEDED') {
      // Transition to viewing results
      this.workflowState.set('viewing');
    } else if (
      job.status === 'FAILED' ||
      job.status === 'CANCELLED' ||
      job.status === 'TIMED_OUT'
    ) {
      console.error('Job failed:', job.status);
      // Keep showing job status for error display
      // User can retry which will reset to configuring
    }
  }

  // Handle retry request
  onRetryRequested(): void {
    console.log('Retry requested');
    this.resetWorkflow();
  }

  // Handle cancel request
  onCancelRequested(): void {
    console.log('Cancel requested');
    this.resetWorkflow();
  }

  // Reset workflow to initial state
  resetWorkflow(): void {
    this.workflowState.set('configuring');
    this.currentJob.set(null);
    // Keep currentParameters so user doesn't lose their configuration
  }

  // Navigate back to run list
  navigateToRunList(): void {
    this.router.navigate(['/runs']);
  }

  // Get title for current state
  getWorkflowTitle(): string {
    const state = this.workflowState();
    const params = this.currentParameters();

    switch (state) {
      case 'configuring':
        return 'Configure Model Run';
      case 'submitting':
      case 'monitoring':
        return `Model Run: ${params?.runName || 'Unnamed'}`;
      case 'viewing':
        return `Results: ${params?.runName || 'Unnamed'}`;
      default:
        return 'Model Workflow';
    }
  }

  // Get right panel content description
  getRightPanelDescription(): string {
    const state = this.workflowState();

    switch (state) {
      case 'configuring':
        return 'Configure your model parameters on the left and click Submit to start your simulation.';
      case 'submitting':
      case 'monitoring':
        return 'Your model run is being processed. This may take several minutes.';
      case 'viewing':
        return 'Your model run has completed successfully. Explore the results below.';
      default:
        return '';
    }
  }
}
