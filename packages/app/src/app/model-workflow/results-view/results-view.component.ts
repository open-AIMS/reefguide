// results-view.component.ts
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  ViewChild,
  OnDestroy,
  signal
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
 * Results View Component
 *
 * Displays the results of a completed model run job including:
 * - Multiple interactive Vega-Lite charts with dropdown selection
 * - Dynamic chart loading based on available visualizations
 * - Efficient caching to avoid re-downloading chart specifications
 *
 * The component handles workspace isolation by:
 * - Tracking workspace ID to detect workspace changes
 * - Re-rendering charts when workspace or job changes
 * - Managing multiple chart instances
 * - Caching chart specifications per job to avoid redundant downloads
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
export class ResultsViewComponent implements AfterViewInit, OnDestroy {
  private readonly webApi = inject(WebApiService);

  /** Input job from the parent workflow component */
  job = input<JobDetailsResponse['job'] | undefined>(undefined);

  /** Input workspace ID to track workspace changes */
  workspaceId = input<string | undefined>(undefined);

  /** Reference to the Vega chart container element */
  @ViewChild('vegaChart', { static: false }) vegaChartRef!: ElementRef;

  /** Available charts from the job output */
  availableCharts = signal<ChartItem[]>([]);

  /** Currently selected chart for dropdown */
  selectedChart = signal<string | null>(null);

  /** Active charts being displayed */
  activeCharts = signal<ChartItem[]>([]);

  /** Cache for downloaded chart specs to avoid re-downloading */
  private chartSpecCache = new Map<string, CachedChartSpec>();

  /** Track the last rendered job/workspace combination */
  private lastRenderedJobId: number | null = null;
  private lastRenderedWorkspaceId: string | null = null;

  /** Flag to prevent duplicate renders during chart addition */
  private isAddingChart = false;

  /** Computed job ID for reactive streams */
  private readonly jobId = computed(() => {
    const job = this.job();
    return job?.id || undefined;
  });

  /** Computed workspace ID for tracking changes */
  private readonly currentWorkspaceId = computed(() => {
    return this.workspaceId() || null;
  });

  constructor() {
    /**
     * Effect to handle chart initialization when job completes OR workspace changes
     */
    effect(() => {
      const job = this.job();
      const workspaceId = this.currentWorkspaceId();

      if (job?.status === 'SUCCEEDED' && workspaceId) {
        // Check if we need to re-initialize (job changed OR workspace changed)
        const needsRender =
          this.lastRenderedJobId !== job.id || this.lastRenderedWorkspaceId !== workspaceId;

        if (needsRender) {
          console.log(`[${workspaceId}] Initializing charts for job ${job.id}`);

          // Clear cache when switching to a different job
          if (this.lastRenderedJobId !== job.id) {
            this.clearCache();
          }

          this.initializeCharts(job);
          this.lastRenderedJobId = job.id;
          this.lastRenderedWorkspaceId = workspaceId;
        }
      }
    });

    /**
     * Effect to render active charts when they change
     * Only re-render all charts if we're not in the middle of adding a single chart
     */
    effect(() => {
      const charts = this.activeCharts();
      const workspaceId = this.currentWorkspaceId();
      const jobId = this.jobId();

      if (charts.length > 0 && this.vegaChartRef && workspaceId && jobId && !this.isAddingChart) {
        this.renderActiveCharts(jobId, workspaceId);
      }
    });
  }

  /**
   * AfterViewInit lifecycle hook
   */
  ngAfterViewInit(): void {
    const job = this.job();
    const workspaceId = this.currentWorkspaceId();

    if (job?.status === 'SUCCEEDED' && workspaceId) {
      const needsRender =
        this.lastRenderedJobId !== job.id || this.lastRenderedWorkspaceId !== workspaceId;

      if (needsRender) {
        console.log(`[${workspaceId}] Initial initialization for job ${job.id}`);

        // Clear cache when switching to a different job
        if (this.lastRenderedJobId !== job.id) {
          this.clearCache();
        }

        this.initializeCharts(job);
        this.lastRenderedJobId = job.id;
        this.lastRenderedWorkspaceId = workspaceId;
      }
    }
  }

  /**
   * Initialize charts from job output payload
   */
  private initializeCharts(job: JobDetailsResponse['job']): void {
    try {
      // Parse the job output to get available charts
      const outputPayload = (job as any).assignments?.[0].result?.result_payload;

      if (!outputPayload?.available_charts) {
        console.warn('No available_charts found in job output');
        return;
      }

      // Convert available charts to ChartItem array
      const charts: ChartItem[] = Object.entries(outputPayload.available_charts).map(
        ([title, filename]) => ({
          title,
          filename: filename as string,
          isActive: false
        })
      );

      this.availableCharts.set(charts);
      console.log(`Initialized ${charts.length} available charts`);
    } catch (error) {
      console.error('Error initializing charts:', error);
    }
  }

  /**
   * Add a chart to the active charts list
   */
  async addChart(): Promise<void> {
    const selectedTitle = this.selectedChart();
    if (!selectedTitle) return;

    const availableChart = this.availableCharts().find(c => c.title === selectedTitle);
    if (!availableChart) return;

    // Check if chart is already active
    const currentActive = this.activeCharts();
    if (currentActive.some(c => c.title === selectedTitle)) {
      return; // Already active
    }

    // Set flag to prevent the effect from re-rendering all charts
    this.isAddingChart = true;

    try {
      // Add to active charts
      const newActiveChart = { ...availableChart, isActive: true };
      this.activeCharts.set([...currentActive, newActiveChart]);

      // Reset dropdown selection
      this.selectedChart.set(null);

      // Render only the new chart
      const jobId = this.jobId();
      const workspaceId = this.currentWorkspaceId();
      if (jobId && workspaceId) {
        await this.renderSingleChart(jobId, newActiveChart, workspaceId);
      }
    } finally {
      // Reset flag after chart is added and rendered
      this.isAddingChart = false;
    }
  }

  /**
   * Remove a chart from active charts
   */
  removeChart(title: string): void {
    const currentActive = this.activeCharts();
    const chartToRemove = currentActive.find(c => c.title === title);

    if (chartToRemove) {
      // Remove the chart's DOM element
      const chartElement = this.vegaChartRef?.nativeElement?.querySelector(
        `[data-chart-title="${title}"]`
      );
      if (chartElement) {
        chartElement.remove();
      }
    }

    // Update the active charts list
    const filtered = currentActive.filter(c => c.title !== title);
    this.activeCharts.set(filtered);
  }

  /**
   * Get available charts that aren't currently active
   */
  getInactiveCharts(): ChartItem[] {
    const active = this.activeCharts();
    const available = this.availableCharts();
    return available.filter(chart => !active.some(ac => ac.title === chart.title));
  }

  /**
   * Generate cache key for a chart
   */
  private getCacheKey(jobId: number, filename: string): string {
    return `${jobId}_${filename}`;
  }

  /**
   * Get chart specification from cache or download it
   */
  private async getChartSpec(
    jobId: number,
    chart: ChartItem,
    workspaceId: string
  ): Promise<VisualizationSpec | null> {
    const cacheKey = this.getCacheKey(jobId, chart.filename);

    // Check if we have a cached version
    if (this.chartSpecCache.has(cacheKey)) {
      const cached = this.chartSpecCache.get(cacheKey)!;
      console.log(`[${workspaceId}] Using cached chart spec: ${chart.title}`);
      return cached.spec;
    }

    try {
      console.log(`[${workspaceId}] Downloading chart spec: ${chart.title}`);

      // Download the Vega-Lite specification file
      const downloadResponse = await this.webApi
        .downloadJobResults(jobId, undefined, chart.filename)
        .toPromise();

      const vegaUrl = downloadResponse?.files[chart.filename];

      if (!vegaUrl) {
        console.warn(`[${workspaceId}] No URL found for chart: ${chart.filename}`);
        return null;
      }

      // Fetch and parse the JSON specification
      const response = await fetch(vegaUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch chart spec: ${response.status}`);
      }

      const spec = await response.json();

      // Cache the specification
      this.chartSpecCache.set(cacheKey, {
        spec,
        url: vegaUrl,
        downloadedAt: new Date()
      });

      console.log(`[${workspaceId}] Successfully downloaded and cached chart spec: ${chart.title}`);
      return spec;
    } catch (error) {
      console.error(`[${workspaceId}] Error downloading chart spec ${chart.title}:`, error);
      return null;
    }
  }

  /**
   * Render all active charts
   */
  private async renderActiveCharts(jobId: number, workspaceId: string): Promise<void> {
    if (!this.vegaChartRef?.nativeElement) return;

    // Clear existing charts
    this.clearAllCharts();

    const activeCharts = this.activeCharts();

    // Render all active charts
    for (const chart of activeCharts) {
      await this.renderSingleChart(jobId, chart, workspaceId);
    }
  }

  /**
   * Render a single chart
   */
  private async renderSingleChart(
    jobId: number,
    chart: ChartItem,
    workspaceId: string
  ): Promise<void> {
    try {
      // Check if chart already exists in DOM to prevent duplicates
      const existingChart = this.vegaChartRef?.nativeElement?.querySelector(
        `[data-chart-title="${chart.title}"]`
      );
      if (existingChart) {
        console.log(`[${workspaceId}] Chart already exists, skipping render: ${chart.title}`);
        return;
      }

      // Get chart specification (from cache or download)
      const spec = await this.getChartSpec(jobId, chart, workspaceId);

      if (!spec) {
        console.warn(`[${workspaceId}] Failed to get chart spec for: ${chart.title}`);
        return;
      }

      // Create a container for this specific chart
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
      await embed(contentContainer, spec, {
        actions: true,
        theme: 'vox',
        width: Math.max(500, this.vegaChartRef.nativeElement.clientWidth - 275)
      });

      console.log(`[${workspaceId}] Successfully rendered chart: ${chart.title}`);
    } catch (error) {
      console.error(`[${workspaceId}] Error rendering chart ${chart.title}:`, error);
    }
  }

  /**
   * Clear all rendered charts
   */
  private clearAllCharts(): void {
    if (this.vegaChartRef?.nativeElement) {
      this.vegaChartRef.nativeElement.innerHTML = '';
    }
  }

  /**
   * Clear the chart specification cache
   */
  private clearCache(): void {
    console.log(`Clearing chart spec cache (${this.chartSpecCache.size} entries)`);
    this.chartSpecCache.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.chartSpecCache.size,
      keys: Array.from(this.chartSpecCache.keys())
    };
  }

  /**
   * OnDestroy lifecycle hook
   */
  ngOnDestroy(): void {
    this.clearAllCharts();
    this.clearCache();
  }
}
