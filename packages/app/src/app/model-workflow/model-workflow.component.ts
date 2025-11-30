import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  numberAttribute,
  OnDestroy,
  OnInit,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { tap } from 'rxjs';
import { JobDetailsResponse } from '@reefguide/types';
import { WebApiService } from '../../api/web-api.service';
import { JobStatusComponent } from '../jobs/job-status/job-status.component';
import { JobStatusConfig, mergeJobConfig } from '../jobs/job-status/job-status.types';
import {
  ModelParameters,
  ParameterConfigComponent
} from './parameter-config/parameter-config.component';
import { ResultsViewComponent } from './results-view/results-view.component';
import { MapResultsViewComponent } from './map-results-view/map-results-view.component';
import { WorkspaceNameDialogComponent } from './workspace-name-dialog/workspace-name-dialog.component';
import {
  WorkspacePersistenceService,
  WorkspaceState
} from './services/workspace-persistence.service';
import { toPersistedWorkspace, toRuntimeWorkspace } from './services/workspace-persistence.types';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UserMessageService } from '../user-messages/user-message.service';

type WorkflowState = 'configuring' | 'submitting' | 'monitoring' | 'viewing';

interface Workspace {
  id: string;
  name: string;
  parameters: ModelParameters | null;
  job: JobDetailsResponse['job'] | null;
  workflowState: WorkflowState;
  createdAt: Date;
  lastModified: Date;
  submittedJobId?: number;
  activeCharts?: string[];
  // Track selected results tab (0 = Charts, 1 = Map)
  selectedResultsTab?: number;
  mapConfig?: any;
}

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

  getJob() {
    return this.job();
  }
  getWorkflowState() {
    return this.workflowState();
  }

  // Submit job for this workspace only
  submitJob(
    parameters: ModelParameters,
    onSubmitted: ((job: JobDetailsResponse['job']) => void) | undefined = undefined
  ): void {
    console.debug(`[${this.workspaceId}] Submitting job with parameters:`, parameters);

    this.workflowState.set('submitting');

    const payload = ParameterConfigComponent.toAdriaModelRunInput(parameters);

    this.api.startJob('ADRIA_MODEL_RUN', payload).subscribe({
      next: job => {
        console.debug(`[${this.workspaceId}] Job started:`, job);
        this.job.set(job);
        this.workflowState.set('monitoring');
        if (onSubmitted) {
          onSubmitted(job);
        }
      },
      error: error => {
        console.error(`[${this.workspaceId}] Failed to start job:`, error);
        this.workflowState.set('configuring');
      }
    });
  }

  // Handle job completion for this workspace only
  onJobCompleted(job: JobDetailsResponse['job']): void {
    console.debug(`[${this.workspaceId}] Job completed:`, job);

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
    console.debug(`[${this.workspaceId}] Resetting workspace`);
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

  restoreJobFromId(jobId: number): void {
    console.debug(`[${this.workspaceId}] Restoring job ${jobId} from persistence`);

    // Fetch the job details from the API
    this.api.getJob(jobId).subscribe({
      next: response => {
        const job = response.job;
        console.debug(`[${this.workspaceId}] Restored job:`, job);

        // If the job has result with an invalid cache, then invalidate it NOTE
        // in the future if we have more complex management of job results we
        // may wish to check also that there is no result which is newer and not
        // invalidated - but right now we only ever have one result per job
        if (job.assignments.some(a => a.result && !a.result.cache_valid)) {
          // There is at least one result which has been manually invalidated - let's dismiss the job
          console.warn(
            `[${this.workspaceId}] Job ${jobId} has invalidated results - resetting job state`
          );
          this.job.set(null);
          this.workflowState.set('configuring');
          return;
        }

        this.job.set(job);

        // Set workflow state based on job status
        if (job.status === 'SUCCEEDED') {
          this.workflowState.set('viewing');
        } else if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(job.status)) {
          this.workflowState.set('monitoring'); // Show error state
        } else if (['PENDING', 'IN_PROGRESS'].includes(job.status)) {
          this.workflowState.set('monitoring');
        } else {
          this.workflowState.set('configuring');
        }
      },
      error: error => {
        console.error(`[${this.workspaceId}] Failed to restore job ${jobId}:`, error);
        // Clear the invalid job ID and reset to configuring
        this.workflowState.set('configuring');
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
    ResultsViewComponent,
    MapResultsViewComponent
  ],
  templateUrl: './model-workflow.component.html',
  styleUrl: './model-workflow.component.scss',
  providers: [WorkspacePersistenceService]
})
export class ModelWorkflowComponent implements OnInit, OnDestroy {
  private readonly api = inject(WebApiService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly persistenceService = inject(WorkspacePersistenceService);
  private readonly userMessageService = inject(UserMessageService);
  private readonly elementRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  // Project management

  /**
   * Current project ID
   * via route param
   */
  public readonly projectId = input(undefined, { transform: numberAttribute });

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

  // Force remount when workspace ID changes
  forceChartRemount = false;

  constructor() {
    // Set up CSS custom property for left panel width
    effect(() => {
      const width = this.leftPanelWidth();
      const element = this.elementRef.nativeElement as HTMLElement;
      element.style.setProperty('--left-panel-width', `${width}px`);
    });

    // When the workspace ID changes, force a chart remount
    effect(() => {
      // Use workspace ID to trigger remount
      const _activeId = this.activeWorkspaceId();
      this.doForceChartRemount();
    });
  }

  ngOnInit(): void {
    this.setupInitialState().subscribe({
      next: () => {
        console.debug('Workspace initialization complete');
      },
      error: error => {
        console.error('Failed to initialize workspaces:', error);
        // Create default workspace as fallback
        this.userMessageService.showProjectLoadFailed('Failed to initialize project workspace');
      }
    });
  }

  ngOnDestroy(): void {
    // Clear any pending save timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
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

  /**
   * Initial workspace state load and setup.
   */
  private setupInitialState() {
    return this.persistenceService.initialState$.pipe(
      // cancel request if navigate away
      takeUntilDestroyed(this.destroyRef),
      tap({
        next: savedState => {
          if (savedState.workspaces.length === 0) {
            console.info('Project has no workspaces, creating one');
            // No saved state, create default workspace
            this.createWorkspaceWithName('Workspace 1');
            return;
          }

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

          // REVIEW should this be moved to WorkspaceService? consider RxJS
          // Restore jobs for workspaces that have submitted job IDs
          setTimeout(() => {
            this.restoreJobsForWorkspaces();
          }, 100); // Small delay to ensure services are initialized

          console.debug(`Restored ${runtimeWorkspaces.length} workspaces from persistence`);
        }
      })
    );
  }

  // Save workspaces to persistence with debouncing
  private saveWorkspacesToPersistence(): void {
    // TODO ideally this should be throttled subject that replaces any existing save request
    // Clear any existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Debounce the save operation
    this.saveTimeout = setTimeout(() => {
      const workspaces = this.workspaces();
      const persistedWorkspaces = workspaces.map(w => toPersistedWorkspace(w));

      const state: WorkspaceState = {
        version: '1.0',
        workspaces: persistedWorkspaces,
        activeWorkspaceId: this.activeWorkspaceId(),
        workspaceCounter: this.workspaceCounter()
      };

      this.persistenceService.saveWorkspaceState(state).subscribe();
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
      lastModified: new Date(),
      submittedJobId: undefined,
      activeCharts: undefined,
      selectedResultsTab: 0, // Default to Charts tab
      mapConfig: undefined
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
      lastModified: new Date(),
      submittedJobId: undefined,
      activeCharts: undefined,
      selectedResultsTab: 0, // Default to Charts tab
      mapConfig: undefined
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

    this.triggerSave();
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
      service.submitJob(parameters, job => {
        // Update workspace with submitted job ID
        this.updateWorkspace(workspaceId, {
          submittedJobId: job.id,
          lastModified: new Date()
        });
        this.triggerSave();
      });
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
      submittedJobId: undefined,
      lastModified: new Date(),
      activeCharts: undefined
    });

    this.triggerSave();
  }

  onResultsTabChange(workspaceId: string, tabIndex: number): void {
    console.debug(`[${workspaceId}] Results tab changed to: ${tabIndex === 0 ? 'Charts' : 'Map'}`);

    this.updateWorkspace(workspaceId, {
      selectedResultsTab: tabIndex,
      lastModified: new Date()
    });

    this.triggerSave();
  }

  // Get selected results tab for workspace
  getSelectedResultsTab(workspaceId: string): number {
    const workspace = this.workspaces().find(w => w.id === workspaceId);
    return workspace?.selectedResultsTab ?? 0; // Default to Charts tab
  }

  onMapInteraction(workspaceId: string, interaction: any): void {
    console.debug(`[${workspaceId}] Map interaction:`, interaction);
  }

  onMapConfigChanged(workspaceId: string, config: any): void {
    console.debug(`[${workspaceId}] Map config changed:`, config);

    this.updateWorkspace(workspaceId, {
      mapConfig: config,
      lastModified: new Date()
    });

    this.triggerSave();
  }

  getMapConfigForWorkspace(workspaceId: string): any {
    const workspace = this.workspaces().find(w => w.id === workspaceId);
    return workspace?.mapConfig || null;
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

  shouldShowJobStatus(workspaceId: string): boolean {
    const service = this.getWorkspaceService(workspaceId);
    return service ? service.isSubmitting() || service.isMonitoring() : false;
  }

  private updateWorkspace(workspaceId: string, updates: Partial<Workspace>): void {
    const currentWorkspaces = this.workspaces();
    const updatedWorkspaces = currentWorkspaces.map(workspace =>
      workspace.id === workspaceId ? { ...workspace, ...updates } : workspace
    );
    this.workspaces.set(updatedWorkspaces);
  }

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

  // Navigate back to projects list
  navigateToProjects(): void {
    this.router.navigate(['/']);
  }

  // Restore jobs for all workspaces on initialization
  private restoreJobsForWorkspaces(): void {
    const workspaces = this.workspaces();

    // REVIEW does every workspace job need to be restored? or just active tab?
    workspaces.forEach(workspace => {
      if (workspace.submittedJobId) {
        const service = this.getWorkspaceService(workspace.id);
        if (service) {
          console.debug(`Restoring job ${workspace.submittedJobId} for workspace ${workspace.id}`);
          service.restoreJobFromId(workspace.submittedJobId);
        }
      }
    });
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

  onChartsChanged(workspaceId: string, activeCharts: string[]): void {
    const currentWorkspace = this.workspaces().find(w => w.id === workspaceId);
    if (!currentWorkspace) {
      console.warn(`Workspace ${workspaceId} not found when updating charts`);
      return;
    }

    // Only update if charts actually changed
    const currentCharts = currentWorkspace.activeCharts || [];
    const newCharts = [...activeCharts];

    // Simple comparison - if lengths differ or any chart is different
    const hasChanged =
      currentCharts.length !== newCharts.length ||
      currentCharts.some(chart => !newCharts.includes(chart)) ||
      newCharts.some(chart => !currentCharts.includes(chart));

    if (hasChanged) {
      console.debug(`[${workspaceId}] Updating active charts:`, newCharts);
      this.updateWorkspace(workspaceId, {
        activeCharts: newCharts,
        lastModified: new Date()
      });

      // Auto-save chart changes
      this.triggerSave();
    }
  }

  // Get active charts for a workspace
  getActiveChartsForWorkspace(workspaceId: string): string[] {
    const workspace = this.workspaces().find(w => w.id === workspaceId);
    // Return a new array to ensure change detection works properly
    return workspace?.activeCharts ? [...workspace.activeCharts] : [];
  }

  doForceChartRemount(): void {
    this.forceChartRemount = true;
    setTimeout(() => {
      this.forceChartRemount = false;
    }, 0);
  }
}
