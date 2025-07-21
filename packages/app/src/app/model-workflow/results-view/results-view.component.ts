// results-view.component.ts
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  input,
  ViewChild,
  OnDestroy,
  signal,
  output,
  OnChanges,
  SimpleChanges,
  effect
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { JobDetailsResponse } from '@reefguide/types';
import embed, { VisualizationSpec } from 'vega-embed';
import { WebApiService } from '../../../api/web-api.service';

interface ChartItem {
  title: string;
  filename: string;
  isActive: boolean;
}

interface CachedChartSpec {
  spec: VisualizationSpec;
  url: string;
  downloadedAt: Date;
}

/**
 * Results View Component - Simplified version using OnChanges
 *
 * Key improvements:
 * - Uses OnChanges instead of complex effects to avoid infinite loops
 * - Clear initialization flow
 * - Proper workspace isolation
 * - Simplified state management
 */
@Component({
  selector: 'app-results-view',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatSelectModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './results-view.component.html',
  styleUrl: './results-view.component.scss'
})
export class ResultsViewComponent implements OnChanges, AfterViewInit, OnDestroy {
  private readonly webApi = inject(WebApiService);

  /** Input job from the parent workflow component */
  job = input<JobDetailsResponse['job'] | undefined>(undefined);

  /** Input workspace ID to track workspace changes */
  workspaceId = input<string | undefined>(undefined);

  /** Input: Initial active charts from workspace persistence */
  initialActiveCharts = input<string[]>([]);

  /** Output: Emit when active charts change for auto-save */
  chartsChanged = output<string[]>();

  /** Reference to the Vega chart container element */
  @ViewChild('vegaChart', { static: false }) vegaChartRef!: ElementRef;

  // ==================
  // STATE MANAGEMENT
  // ==================

  /** Available charts from the job output */
  availableCharts = signal<ChartItem[]>([]);

  /** Currently selected chart for dropdown */
  selectedChart = signal<string | null>(null);

  /** Active charts being displayed */
  activeCharts = signal<ChartItem[]>([]);

  /** Component lifecycle states */
  private isViewInitialized = signal<boolean>(false);
  private hasRestoredFromPersistence = signal<boolean>(false);

  /** Cache for downloaded chart specs - workspace isolated */
  private chartSpecCache = new Map<string, CachedChartSpec>();

  /** Last rendered state to detect changes */
  private lastRenderedJobId: number | null = null;
  private lastRenderedWorkspaceId: string | null = null;

  constructor() {
    // Only effect for chart changes emission
    effect(() => {
      const charts = this.activeCharts();
      const workspaceId = this.workspaceId();

      if (workspaceId && this.hasRestoredFromPersistence()) {
        const chartTitles = charts.map(c => c.title);
        this.chartsChanged.emit(chartTitles);
      }
    });
  }

  // ==================
  // LIFECYCLE HOOKS
  // ==================

  ngOnChanges(changes: SimpleChanges): void {
    // Check if job or workspace changed
    if (changes['job'] || changes['workspaceId'] || changes['initialActiveCharts']) {
      const currentJob = this.job();
      const currentWorkspaceId = this.workspaceId();

      if (currentJob?.status === 'SUCCEEDED' && currentWorkspaceId && this.isViewInitialized()) {
        this.handleInputChanges(currentJob, currentWorkspaceId);
      }
    }
  }

  ngAfterViewInit(): void {
    this.isViewInitialized.set(true);

    // Initialize if job is already ready
    const currentJob = this.job();
    const currentWorkspaceId = this.workspaceId();

    if (currentJob?.status === 'SUCCEEDED' && currentWorkspaceId) {
      this.handleInputChanges(currentJob, currentWorkspaceId);
    }
  }

  ngOnDestroy(): void {
    this.clearAllCharts();
    this.clearCache();
  }

  // ==================
  // INPUT CHANGE HANDLING
  // ==================

  private async handleInputChanges(
    currentJob: JobDetailsResponse['job'],
    currentWorkspaceId: string
  ): Promise<void> {
    // Check if this is actually a new state
    const isNewJob = this.lastRenderedJobId !== currentJob.id;
    const isNewWorkspace = this.lastRenderedWorkspaceId !== currentWorkspaceId;

    if (!isNewJob && !isNewWorkspace) {
      // Same job and workspace, but maybe initialActiveCharts changed
      const shouldRestoreCharts = !this.hasRestoredFromPersistence() && this.initialActiveCharts().length > 0;
      if (shouldRestoreCharts) {
        await this.restoreChartsFromPersistence();
        this.hasRestoredFromPersistence.set(true);
      }
      return;
    }

    console.log(`[${currentWorkspaceId}] Handling input changes for job ${currentJob.id} (new job: ${isNewJob}, new workspace: ${isNewWorkspace})`);

    // Update tracking FIRST to prevent re-entry
    this.lastRenderedJobId = currentJob.id;
    this.lastRenderedWorkspaceId = currentWorkspaceId;

    // Clear cache if switching jobs
    if (isNewJob) {
      this.clearCache();
    }

    // Reset component state
    this.resetComponentState();

    // Initialize charts from job
    this.initializeChartsFromJob(currentJob);

    // Restore charts from persistence (if any)
    await this.restoreChartsFromPersistence();

    // Mark as initialized
    this.hasRestoredFromPersistence.set(true);

    console.log(`[${currentWorkspaceId}] Input changes handled successfully`);
  }

  private resetComponentState(): void {
    this.activeCharts.set([]);
    this.selectedChart.set(null);
    this.availableCharts.set([]);
    this.hasRestoredFromPersistence.set(false);
    this.clearAllCharts();
  }

  // ==================
  // CHART INITIALIZATION
  // ==================

  private initializeChartsFromJob(job: JobDetailsResponse['job']): void {
    try {
      const outputPayload = (job as any).assignments?.[0].result?.result_payload;

      if (!outputPayload?.available_charts) {
        console.warn('No available_charts found in job output');
        return;
      }

      const charts: ChartItem[] = Object.entries(outputPayload.available_charts).map(
        ([title, filename]) => ({
          title,
          filename: filename as string,
          isActive: false
        })
      );

      this.availableCharts.set(charts);

      const workspaceId = this.workspaceId();
      console.log(`[${workspaceId}] Initialized ${charts.length} available charts`);
    } catch (error) {
      console.error('Error initializing charts:', error);
      this.availableCharts.set([]);
    }
  }

  private async restoreChartsFromPersistence(): Promise<void> {
    const initialCharts = this.initialActiveCharts();
    const availableCharts = this.availableCharts();
    const workspaceId = this.workspaceId();

    if (!initialCharts.length || !availableCharts.length || !workspaceId) {
      return;
    }

    console.log(`[${workspaceId}] Restoring ${initialCharts.length} charts from persistence`);

    // Find charts that still exist in the job results
    const validCharts = initialCharts
      .map(title => availableCharts.find(chart => chart.title === title))
      .filter((chart): chart is ChartItem => chart !== undefined)
      .map(chart => ({ ...chart, isActive: true }));

    if (validCharts.length > 0) {
      this.activeCharts.set(validCharts);

      // Wait for view to be ready before rendering
      await this.waitForViewRef();
      await this.renderAllActiveCharts();

      console.log(`[${workspaceId}] Restored and rendered ${validCharts.length} charts`);
    } else {
      console.log(`[${workspaceId}] No valid charts found to restore`);
    }
  }

  // ==================
  // CHART MANAGEMENT
  // ==================

  async addChart(): Promise<void> {
    const selectedTitle = this.selectedChart();
    if (!selectedTitle) return;

    const availableChart = this.availableCharts().find(c => c.title === selectedTitle);
    if (!availableChart) return;

    // Check if chart is already active
    const currentActive = this.activeCharts();
    if (currentActive.some(c => c.title === selectedTitle)) {
      return;
    }

    const workspaceId = this.workspaceId();
    const jobId = this.job()?.id;

    if (!workspaceId || !jobId) return;

    console.log(`[${workspaceId}] Adding chart: ${selectedTitle}`);

    try {
      // Add to active charts first
      const newActiveChart = { ...availableChart, isActive: true };
      this.activeCharts.set([...currentActive, newActiveChart]);

      // Reset dropdown selection
      this.selectedChart.set(null);

      // Wait for view to be ready before rendering
      await this.waitForViewRef();
      await this.renderSingleChart(jobId, newActiveChart, workspaceId);

      console.log(`[${workspaceId}] Successfully added chart: ${selectedTitle}`);
    } catch (error) {
      console.error(`[${workspaceId}] Error adding chart ${selectedTitle}:`, error);
      // Revert the active charts on error
      this.activeCharts.set(currentActive);
    }
  }

  removeChart(title: string): void {
    const currentActive = this.activeCharts();
    const workspaceId = this.workspaceId();

    console.log(`[${workspaceId}] Removing chart: ${title}`);

    // Remove the chart's DOM element
    const chartElement = this.vegaChartRef?.nativeElement?.querySelector(
      `[data-chart-title="${title}"]`
    );
    if (chartElement) {
      chartElement.remove();
    }

    // Update the active charts list
    const filtered = currentActive.filter(c => c.title !== title);
    this.activeCharts.set(filtered);
  }

  getInactiveCharts(): ChartItem[] {
    const active = this.activeCharts();
    const available = this.availableCharts();
    return available.filter(chart => !active.some(ac => ac.title === chart.title));
  }

  // ==================
  // VIEW REFERENCE MANAGEMENT
  // ==================

  private async waitForViewRef(): Promise<void> {
    if (this.vegaChartRef?.nativeElement) {
      return; // Already available
    }

    // Wait for the view reference to become available
    return new Promise<void>((resolve) => {
      const checkRef = () => {
        if (this.vegaChartRef?.nativeElement) {
          resolve();
        } else {
          // Check again on next tick
          setTimeout(checkRef, 10);
        }
      };
      checkRef();
    });
  }

  // ==================
  // CHART RENDERING
  // ==================

  private async renderAllActiveCharts(): Promise<void> {
    const activeCharts = this.activeCharts();
    const jobId = this.job()?.id;
    const workspaceId = this.workspaceId();

    if (!jobId || !workspaceId) {
      console.warn(`[${workspaceId}] Missing job ID or workspace ID for rendering`);
      return;
    }

    // Ensure view ref is available
    await this.waitForViewRef();

    if (!this.vegaChartRef?.nativeElement) {
      console.warn(`[${workspaceId}] Chart container still not available after waiting`);
      return;
    }

    // Clear existing charts
    this.clearAllCharts();

    // Render all active charts
    for (const chart of activeCharts) {
      try {
        await this.renderSingleChart(jobId, chart, workspaceId);
      } catch (error) {
        console.error(`[${workspaceId}] Error rendering chart ${chart.title}:`, error);
      }
    }
  }

  private async renderSingleChart(
    jobId: number,
    chart: ChartItem,
    workspaceId: string
  ): Promise<void> {
    if (!this.vegaChartRef?.nativeElement) {
      throw new Error('Chart container not available');
    }

    // Check if chart already exists to prevent duplicates
    const existingChart = this.vegaChartRef.nativeElement.querySelector(
      `[data-chart-title="${chart.title}"]`
    );
    if (existingChart) {
      console.log(`[${workspaceId}] Chart already exists, skipping: ${chart.title}`);
      return;
    }

    // Get chart specification
    const spec = await this.getChartSpec(jobId, chart, workspaceId);
    if (!spec) {
      throw new Error(`Failed to get chart spec for: ${chart.title}`);
    }

    // Create chart container
    const chartContainer = document.createElement('div');
    chartContainer.className = 'individual-chart-container';
    chartContainer.setAttribute('data-chart-title', chart.title);

    // Add chart title
    const titleElement = document.createElement('h3');
    titleElement.className = 'chart-title';
    titleElement.textContent = chart.title;
    chartContainer.appendChild(titleElement);

    // Add chart content container
    const contentContainer = document.createElement('div');
    contentContainer.className = 'chart-content';
    chartContainer.appendChild(contentContainer);

    // Append to main container
    this.vegaChartRef.nativeElement.appendChild(chartContainer);

    // Render the chart
    const containerWidth = this.vegaChartRef.nativeElement.clientWidth;
    await embed(contentContainer, spec, {
      actions: true,
      theme: 'vox',
      width: Math.max(500, containerWidth - 275)
    });

    console.log(`[${workspaceId}] Successfully rendered chart: ${chart.title}`);
  }

  // ==================
  // CHART SPEC MANAGEMENT
  // ==================

  private getCacheKey(jobId: number, filename: string, workspaceId: string): string {
    return `${workspaceId}-${jobId}-${filename}`;
  }

  private async getChartSpec(
    jobId: number,
    chart: ChartItem,
    workspaceId: string
  ): Promise<VisualizationSpec | null> {
    const cacheKey = this.getCacheKey(jobId, chart.filename, workspaceId);

    // Check cache first
    if (this.chartSpecCache.has(cacheKey)) {
      const cached = this.chartSpecCache.get(cacheKey)!;
      console.log(`[${workspaceId}] Using cached chart spec: ${chart.title}`);
      return cached.spec;
    }

    try {
      console.log(`[${workspaceId}] Downloading chart spec: ${chart.title}`);

      // Download the specification
      const downloadResponse = await this.webApi
        .downloadJobResults(jobId, undefined, chart.filename)
        .toPromise();

      const vegaUrl = downloadResponse?.files[chart.filename];
      if (!vegaUrl) {
        throw new Error(`No URL found for chart: ${chart.filename}`);
      }

      // Fetch and parse the JSON specification
      const response = await fetch(vegaUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch chart spec: ${response.status}`);
      }

      const spec = await response.json();

      // Cache the specification with workspace isolation
      this.chartSpecCache.set(cacheKey, {
        spec,
        url: vegaUrl,
        downloadedAt: new Date()
      });

      console.log(`[${workspaceId}] Downloaded and cached chart spec: ${chart.title}`);
      return spec;
    } catch (error) {
      console.error(`[${workspaceId}] Error downloading chart spec ${chart.title}:`, error);
      return null;
    }
  }

  // ==================
  // UTILITY METHODS
  // ==================

  private clearAllCharts(): void {
    if (this.vegaChartRef?.nativeElement) {
      this.vegaChartRef.nativeElement.innerHTML = '';
    }
  }

  private clearCache(): void {
    const size = this.chartSpecCache.size;
    this.chartSpecCache.clear();
    console.log(`Cleared chart spec cache (${size} entries)`);
  }

  // Debug method
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.chartSpecCache.size,
      keys: Array.from(this.chartSpecCache.keys())
    };
  }
}
