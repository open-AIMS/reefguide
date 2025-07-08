// src/app/model-workflow/model-workflow.component.ts
import { Component, computed, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
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

interface Workspace {
  id: string;
  name: string;
  parameters: ModelParameters | null;
  job: JobDetailsResponse['job'] | null;
  workflowState: WorkflowState;
  createdAt: Date;
  lastModified: Date;
}

// Isolated workspace service - one instance per workspace
class WorkspaceService {
  private job = signal<JobDetailsResponse['job'] | null>(null);
  private workflowState = signal<WorkflowState>('configuring');

  constructor(
    private api: WebApiService,
    private workspaceId: string
  ) {}

  // Computed states
  isConfiguring = computed(() => this.workflowState() === 'configuring');
  isSubmitting = computed(() => this.workflowState() === 'submitting');
  isMonitoring = computed(() => this.workflowState() === 'monitoring');
  isViewing = computed(() => this.workflowState() === 'viewing');

  // Get current state
  getJob() {
    return this.job();
  }
  getWorkflowState() {
    return this.workflowState();
  }

  // Submit job for this workspace only
  submitJob(parameters: ModelParameters): void {
    console.log(`[${this.workspaceId}] Submitting job with parameters:`, parameters);

    this.workflowState.set('submitting');

    const payload = ParameterConfigComponent.toAdriaModelRunInput(parameters);

    this.api.startJob('ADRIA_MODEL_RUN', payload).subscribe({
      next: job => {
        console.log(`[${this.workspaceId}] Job started:`, job);
        this.job.set(job);
        this.workflowState.set('monitoring');
      },
      error: error => {
        console.error(`[${this.workspaceId}] Failed to start job:`, error);
        this.workflowState.set('configuring');
      }
    });
  }

  // Handle job completion for this workspace only
  onJobCompleted(job: JobDetailsResponse['job']): void {
    console.log(`[${this.workspaceId}] Job completed:`, job);

    this.job.set(job);

    if (job.status === 'SUCCEEDED') {
      this.workflowState.set('viewing');
    } else if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(job.status)) {
      console.error(`[${this.workspaceId}] Job failed:`, job.status);
      // Keep in monitoring state to show error
    }
  }

  // Reset this workspace only
  reset(): void {
    console.log(`[${this.workspaceId}] Resetting workspace`);
    this.workflowState.set('configuring');
    this.job.set(null);
  }

  // Get job config for this workspace
  getJobConfig(parameters: ModelParameters | null): JobStatusConfig {
    return mergeJobConfig('ADRIA_MODEL_RUN', {
      title: 'Coral Reef Model Execution',
      subtitle: parameters ? `${parameters.numScenarios} scenarios` : '',
      purpose: parameters
        ? `Running coral reef simulation with ${parameters.numScenarios} scenarios to model restoration outcomes`
        : 'Running coral reef simulation with your deployment parameters across multiple scenarios',
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
  }
}

@Component({
  selector: 'app-model-workflow',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatTabsModule,
    MatTooltipModule,
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

  // Workspace management
  private workspaceCounter = signal(0);
  private workspaces = signal<Workspace[]>([]);
  private activeWorkspaceId = signal<string | null>(null);

  // Workspace services - one per workspace for complete isolation
  private workspaceServices = new Map<string, WorkspaceService>();

  // Public computed properties
  allWorkspaces = computed(() => this.workspaces());
  activeWorkspace = computed(() => {
    const activeId = this.activeWorkspaceId();
    if (!activeId) return null;
    return this.workspaces().find(w => w.id === activeId) || null;
  });

  selectedTabIndex = computed(() => {
    const activeId = this.activeWorkspaceId();
    if (!activeId) return 0;
    return this.workspaces().findIndex(w => w.id === activeId);
  });

  constructor() {
    // Create the first workspace automatically
    this.createNewWorkspace();
  }

  // Get or create workspace service
  getWorkspaceService(workspaceId: string): WorkspaceService | null {
    if (!this.workspaceServices.has(workspaceId)) {
      this.workspaceServices.set(workspaceId, new WorkspaceService(this.api, workspaceId));
    }
    return this.workspaceServices.get(workspaceId) || null;
  }

  // Create a new workspace
  createNewWorkspace(): void {
    const counter = this.workspaceCounter();
    const newWorkspace: Workspace = {
      id: `workspace-${counter}`,
      name: `Workspace ${counter + 1}`,
      parameters: null,
      job: null,
      workflowState: 'configuring',
      createdAt: new Date(),
      lastModified: new Date()
    };

    this.workspaceCounter.set(counter + 1);
    const currentWorkspaces = this.workspaces();
    this.workspaces.set([...currentWorkspaces, newWorkspace]);
    this.activeWorkspaceId.set(newWorkspace.id);

    // Create service for new workspace
    this.getWorkspaceService(newWorkspace.id);
  }

  // Close a workspace
  closeWorkspace(workspaceId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    const currentWorkspaces = this.workspaces();
    const workspaceIndex = currentWorkspaces.findIndex(w => w.id === workspaceId);

    if (workspaceIndex === -1) return;

    // Clean up workspace service
    this.workspaceServices.delete(workspaceId);

    // Remove the workspace
    const updatedWorkspaces = currentWorkspaces.filter(w => w.id !== workspaceId);
    this.workspaces.set(updatedWorkspaces);

    // Handle active workspace selection
    const activeId = this.activeWorkspaceId();
    if (activeId === workspaceId) {
      if (updatedWorkspaces.length === 0) {
        this.createNewWorkspace();
      } else {
        const newIndex = Math.min(workspaceIndex, updatedWorkspaces.length - 1);
        this.activeWorkspaceId.set(updatedWorkspaces[newIndex].id);
      }
    }
  }

  // Select a workspace (when tab is clicked)
  onTabSelectionChange(index: number): void {
    const workspaces = this.workspaces();
    if (index >= 0 && index < workspaces.length) {
      this.activeWorkspaceId.set(workspaces[index].id);
    }
  }

  // Update workspace when parameters change
  onParametersChanged(workspaceId: string, parameters: ModelParameters): void {
    this.updateWorkspace(workspaceId, {
      parameters,
      lastModified: new Date()
    });
  }

  // Submit parameters for specific workspace
  onParametersSubmitted(workspaceId: string, parameters: ModelParameters): void {
    // Save parameters first
    this.updateWorkspace(workspaceId, {
      parameters,
      lastModified: new Date()
    });

    // Submit job through workspace service
    const service = this.getWorkspaceService(workspaceId);
    if (service) {
      service.submitJob(parameters);
    }
  }

  // Handle job completion for specific workspace
  onJobCompleted(workspaceId: string, job: JobDetailsResponse['job']): void {
    const service = this.getWorkspaceService(workspaceId);
    if (service) {
      service.onJobCompleted(job);
    }

    // Update workspace with job info
    this.updateWorkspace(workspaceId, {
      job,
      workflowState: service?.getWorkflowState() || 'configuring',
      lastModified: new Date()
    });
  }

  // Handle retry for specific workspace
  onRetryRequested(workspaceId: string): void {
    this.resetWorkspace(workspaceId);
  }

  // Handle cancel for specific workspace
  onCancelRequested(workspaceId: string): void {
    this.resetWorkspace(workspaceId);
  }

  // Reset specific workspace
  resetWorkspace(workspaceId: string): void {
    const service = this.getWorkspaceService(workspaceId);
    if (service) {
      service.reset();
    }

    this.updateWorkspace(workspaceId, {
      job: null,
      workflowState: 'configuring',
      lastModified: new Date()
    });
  }

  // Helper method to get job config for template
  getJobConfigForWorkspace(
    workspaceId: string,
    parameters: ModelParameters | null
  ): JobStatusConfig {
    const service = this.getWorkspaceService(workspaceId);
    if (service) {
      return service.getJobConfig(parameters);
    }
    // Fallback if service is not available
    return this.getDefaultJobConfig();
  }

  // Helper method to check if should show job status
  shouldShowJobStatus(workspaceId: string): boolean {
    const service = this.getWorkspaceService(workspaceId);
    return service ? service.isSubmitting() || service.isMonitoring() : false;
  }

  // Helper method to update a workspace
  private updateWorkspace(workspaceId: string, updates: Partial<Workspace>): void {
    const currentWorkspaces = this.workspaces();
    const updatedWorkspaces = currentWorkspaces.map(workspace =>
      workspace.id === workspaceId ? { ...workspace, ...updates } : workspace
    );
    this.workspaces.set(updatedWorkspaces);
  }

  // Get title for workspace
  getWorkflowTitle(workspace: Workspace): string {
    const service = this.getWorkspaceService(workspace.id);
    if (!service) return 'Model Workflow';

    const state = service.getWorkflowState();
    const params = workspace.parameters;

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

  // Get display name for workspace (with status indicator)
  getWorkspaceDisplayName(workspace: Workspace): string {
    let name = workspace.name;
    const service = this.getWorkspaceService(workspace.id);

    if (service) {
      const state = service.getWorkflowState();
      switch (state) {
        case 'submitting':
        case 'monitoring':
          name += ' ⏳';
          break;
        case 'viewing':
          name += ' ✓';
          break;
      }
    }

    return name;
  }

  // Check if workspace can be closed
  canCloseWorkspace(workspace: Workspace): boolean {
    const service = this.getWorkspaceService(workspace.id);
    if (!service) return true;

    const state = service.getWorkflowState();
    return state !== 'submitting' && state !== 'monitoring';
  }

  // Get tooltip text for close button
  getCloseTooltip(workspace: Workspace): string {
    if (!this.canCloseWorkspace(workspace)) {
      return 'Cannot close workspace while job is running';
    }
    return `Close ${workspace.name}`;
  }

  // TrackBy function for workspace list
  trackByWorkspace(index: number, workspace: Workspace): string {
    return workspace.id;
  }

  // Navigate back to run list
  navigateToRunList(): void {
    this.router.navigate(['/runs']);
  }

  // Get default job config as fallback
  private getDefaultJobConfig(): JobStatusConfig {
    return mergeJobConfig('ADRIA_MODEL_RUN', {
      title: 'Coral Reef Model Execution',
      purpose:
        'Running coral reef simulation with your deployment parameters across multiple scenarios',
      showElapsedTime: true,
      showDetailedProgress: true,
      theme: 'primary',
      successMessage: 'Model simulation completed! Results are ready for analysis.'
    });
  }
}
