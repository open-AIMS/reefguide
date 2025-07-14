// src/app/model-workflow/model-workflow.component.ts
import {
  Component,
  computed,
  inject,
  signal,
  effect,
  HostListener,
  ElementRef,
  OnInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Subject, takeUntil, switchMap, tap, of } from 'rxjs';
import { JobDetailsResponse } from '@reefguide/types';
import { WebApiService } from '../../api/web-api.service';
import { JobStatusComponent } from '../jobs/job-status/job-status.component';
import { JobStatusConfig, mergeJobConfig } from '../jobs/job-status/job-status.types';
import {
  ParameterConfigComponent,
  ModelParameters
} from './parameter-config/parameter-config.component';
import { ResultsViewComponent } from './results-view/results-view.component';
import { WorkspaceNameDialogComponent } from './workspace-name-dialog/workspace-name-dialog.component';
import {
  WorkspacePersistenceService,
  WorkspaceState
} from './services/workspace-persistence.service';
import {
  toPersistedWorkspace,
  toRuntimeWorkspace,
  RuntimeWorkspace
} from './services/workspace-persistence.types';

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
    MatMenuModule,
    MatDialogModule,
    ParameterConfigComponent,
    JobStatusComponent,
    ResultsViewComponent
  ],
  templateUrl: './model-workflow.component.html',
  styleUrl: './model-workflow.component.scss'
})
export class ModelWorkflowComponent implements OnInit, OnDestroy {
  private readonly api = inject(WebApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly persistenceService = inject(WorkspacePersistenceService);
  private readonly elementRef = inject(ElementRef);
  private readonly destroy$ = new Subject<void>();

  // Project management
  private projectId = signal<number | null>(null);
  private isLoading = signal(true);

  // Workspace management
  private workspaceCounter = signal(0);
  private workspaces = signal<Workspace[]>([]);
  private activeWorkspaceId = signal<string | null>(null);
  private saveTimeout: any = null;

  // Panel state management
  public parameterPanelCollapsed = signal(false);
  private leftPanelWidth = signal(600); // Default width in pixels
  private isDragging = signal(false);
  private dragStartX = 0;
  private dragStartWidth = 0;

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
    // Set up CSS custom property for left panel width
    effect(() => {
      const width = this.leftPanelWidth();
      const element = this.elementRef.nativeElement as HTMLElement;
      element.style.setProperty('--left-panel-width', `${width}px`);
    });
  }

  ngOnInit(): void {
    // Extract project ID from route and initialize workspace state
    this.route.params
      .pipe(
        takeUntil(this.destroy$),
        tap(params => {
          const projectId = params['projectId'] ? parseInt(params['projectId'], 10) : null;
          this.projectId.set(projectId);

          if (projectId) {
            this.persistenceService.setProjectId(projectId);
          }
        }),
        switchMap(() => this.loadWorkspacesFromPersistence())
      )
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          console.log('Workspace initialization complete');
        },
        error: error => {
          console.error('Failed to initialize workspaces:', error);
          this.isLoading.set(false);
          // Create default workspace as fallback
          this.createWorkspaceWithName('Workspace 1');
        }
      });
  }

  ngOnDestroy(): void {
    // Clear any pending save timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.destroy$.next();
    this.destroy$.complete();
  }

  // Panel management methods
  toggleParameterPanel(): void {
    this.parameterPanelCollapsed.update(collapsed => !collapsed);
  }

  // Dragging methods
  startDragging(event: MouseEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
    this.dragStartX = event.clientX;
    this.dragStartWidth = this.leftPanelWidth();

    // Add dragging class to body for global cursor
    document.body.classList.add('dragging-active');
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging()) return;

    event.preventDefault();
    const deltaX = event.clientX - this.dragStartX;
    const newWidth = Math.max(250, Math.min(1200, this.dragStartWidth + deltaX));
    this.leftPanelWidth.set(newWidth);
  }

  @HostListener('document:mouseup', ['$event'])
  onMouseUp(event: MouseEvent): void {
    if (!this.isDragging()) return;

    this.isDragging.set(false);
    document.body.classList.remove('dragging-active');
  }

  // Load workspaces from persistence
  private loadWorkspacesFromPersistence() {
    return this.persistenceService.loadWorkspaceState().pipe(
      tap(savedState => {
        if (savedState && savedState.workspaces.length > 0) {
          // Restore from saved state
          this.workspaceCounter.set(savedState.workspaceCounter);

          const runtimeWorkspaces = savedState.workspaces.map(pw => toRuntimeWorkspace(pw));
          this.workspaces.set(runtimeWorkspaces);

          // Restore active workspace (with fallback)
          const activeId =
            savedState.activeWorkspaceId &&
            runtimeWorkspaces.find(w => w.id === savedState.activeWorkspaceId)
              ? savedState.activeWorkspaceId
              : runtimeWorkspaces[0].id;

          this.activeWorkspaceId.set(activeId);

          // Initialize services for restored workspaces
          runtimeWorkspaces.forEach(workspace => {
            this.getWorkspaceService(workspace.id);
          });

          console.log(`Restored ${runtimeWorkspaces.length} workspaces from persistence`);
        } else {
          // No saved state, create default workspace
          this.createWorkspaceWithName('Workspace 1');
        }
      })
    );
  }

  // Save workspaces to persistence with debouncing
  private saveWorkspacesToPersistence(): void {
    // Clear any existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Debounce the save operation
    this.saveTimeout = setTimeout(() => {
      const workspaces = this.workspaces();
      const persistedWorkspaces = workspaces.map(w => toPersistedWorkspace(w));

      const state: WorkspaceState = {
        workspaces: persistedWorkspaces,
        activeWorkspaceId: this.activeWorkspaceId(),
        workspaceCounter: this.workspaceCounter()
      };

      this.persistenceService
        .saveWorkspaceState(state)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            console.log('Workspace state saved successfully');
          },
          error: error => {
            console.warn('Failed to save workspace state:', error);
          }
        });
    }, 500); // 500ms debounce
  }

  getWorkspaceService(workspaceId: string): WorkspaceService | null {
    if (!this.workspaceServices.has(workspaceId)) {
      this.workspaceServices.set(workspaceId, new WorkspaceService(this.api, workspaceId));
    }
    return this.workspaceServices.get(workspaceId) || null;
  }

  // Create a new workspace with name dialog (for user-initiated creation)
  createNewWorkspace(): void {
    const dialogRef = this.dialog.open(WorkspaceNameDialogComponent, {
      width: '400px'
    });

    // Set default name and focus
    dialogRef.componentInstance.workspaceName = `Workspace ${this.workspaceCounter() + 1}`;
    dialogRef.componentInstance.isRename = false;

    dialogRef.afterOpened().subscribe(() => {
      // Focus handled by the dialog component itself
    });

    dialogRef.afterClosed().subscribe((workspaceName: string) => {
      if (workspaceName) {
        this.createWorkspaceWithName(workspaceName);
      }
      // If user cancels, don't create a workspace
    });
  }

  // Create workspace with given name
  private createWorkspaceWithName(name: string): void {
    const counter = this.workspaceCounter();
    const newWorkspace: Workspace = {
      id: `workspace-${counter}`,
      name: name,
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

    // Save after creating workspace
    this.triggerSave();
  }

  // Rename workspace
  renameWorkspace(workspaceId: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }

    const workspace = this.workspaces().find(w => w.id === workspaceId);
    if (!workspace) return;

    const dialogRef = this.dialog.open(WorkspaceNameDialogComponent, {
      width: '400px'
    });

    // Set current name and focus
    dialogRef.componentInstance.workspaceName = workspace.name;
    dialogRef.componentInstance.isRename = true;

    dialogRef.afterOpened().subscribe(() => {
      // Focus handled by the dialog component itself
    });

    dialogRef.afterClosed().subscribe((newName: string) => {
      if (newName && newName !== workspace.name) {
        this.updateWorkspace(workspaceId, {
          name: newName,
          lastModified: new Date()
        });
        this.triggerSave();
      }
    });
  }

  // Copy parameters from one workspace to a new workspace
  copyParametersToNewWorkspace(sourceWorkspaceId: string): void {
    const sourceWorkspace = this.workspaces().find(w => w.id === sourceWorkspaceId);
    if (!sourceWorkspace || !sourceWorkspace.parameters) {
      console.warn('Source workspace not found or has no parameters');
      return;
    }

    const dialogRef = this.dialog.open(WorkspaceNameDialogComponent, {
      width: '400px'
    });

    // Set default name and focus
    dialogRef.componentInstance.workspaceName = `${sourceWorkspace.name} (Copy)`;
    dialogRef.componentInstance.isRename = false;

    dialogRef.afterOpened().subscribe(() => {
      // Focus handled by the dialog component itself
    });

    dialogRef.afterClosed().subscribe((workspaceName: string) => {
      if (workspaceName) {
        this.createWorkspaceWithParameters(workspaceName, sourceWorkspace.parameters!);
      }
    });
  }

  // Create workspace with given name and parameters
  private createWorkspaceWithParameters(name: string, parameters: ModelParameters): void {
    const counter = this.workspaceCounter();
    const newWorkspace: Workspace = {
      id: `workspace-${counter}`,
      name: name,
      parameters: { ...parameters }, // Deep copy the parameters
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

    // Save after creating workspace
    this.triggerSave();
  }

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

    // Trigger save after parameter change
    this.saveWorkspacesToPersistence();
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

  // Trigger save for specific operations
  private triggerSave(): void {
    this.saveWorkspacesToPersistence();
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
