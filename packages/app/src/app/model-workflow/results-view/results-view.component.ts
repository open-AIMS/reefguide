// src/app/model-workflow/results-view/results-view.component.ts
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  ViewChild
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdriaModelRunResult, JobDetailsResponse } from '@reefguide/types';
import { debounceTime, of, Subject, takeUntil, catchError, map, switchMap } from 'rxjs';
import embed, { EmbedOptions, Result } from 'vega-embed';
import { WebApiService } from '../../../api/web-api.service';

interface ChartInfo {
  title: string;
  filename: string;
  description?: string;
}

interface ActiveChart {
  id: string; // Unique identifier for this chart instance
  title: string;
  filename: string;
  isLoading: boolean;
  hasError: boolean;
  errorMessage?: string;
  elementRef?: ElementRef<HTMLDivElement>; // Reference to DOM element
  vegaResult?: Result; // Vega embed result for cleanup
}

interface ChartCache {
  [key: string]: any; // Vega-Lite spec
}

@Component({
  selector: 'app-results-view',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  templateUrl: './results-view.component.html',
  styleUrl: './results-view.component.scss'
})
export class ResultsViewComponent implements OnDestroy, AfterViewInit {
  private readonly api = inject(WebApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroy$ = new Subject<void>();
  private readonly resizeSubject$ = new Subject<void>();

  @ViewChild('chartsGridWrapper') chartsGridWrapper!: ElementRef<HTMLElement>;

  // Inputs
  job = input<JobDetailsResponse['job'] | undefined>();
  workspaceId = input<string>('');
  initialActiveCharts = input<string[]>([]);

  // Outputs
  chartsChanged = output<string[]>();

  // State
  private availableChartsSignal = signal<ChartInfo[]>([]);
  private activeChartsSignal = signal<ActiveChart[]>([]);
  private chartCache = signal<ChartCache>({});
  private chartIdCounter = signal(0);
  private chartElementRefs = new Map<string, ElementRef<HTMLDivElement>>();
  private hasRestoredFromPersistence = signal(false); // Track if we've already restored
  private resizeObserver?: ResizeObserver;

  // Computed properties
  availableCharts = computed(() => this.availableChartsSignal());
  activeCharts = computed(() => this.activeChartsSignal());

  // Available charts for select dropdown (exclude already active charts)
  availableChartsForSelect = computed(() => {
    const activeFilenames = new Set(this.activeCharts().map(chart => chart.filename));
    return this.availableCharts().filter(chart => !activeFilenames.has(chart.filename));
  });

  constructor() {
    // Effect to process job changes
    effect(() => {
      const currentJob = this.job();
      if (currentJob && currentJob.status === 'SUCCEEDED') {
        this.processJobResults(currentJob);
      } else {
        this.clearCharts();
      }
    });

    // Effect to restore charts from initialActiveCharts OR add default chart
    effect(() => {
      const initialCharts = this.initialActiveCharts();
      const available = this.availableCharts();
      const hasRestored = this.hasRestoredFromPersistence();

      // Only restore/add default if we haven't restored yet and have available charts
      if (!hasRestored && available.length > 0 && this.activeCharts().length === 0) {
        if (initialCharts.length > 0) {
          // Restore from persistence
          this.restoreChartsFromPersistence(initialCharts);
        } else {
          // Add default chart if no initial charts and none restored yet
          this.addDefaultChart();
        }
      }
    });

    // Effect to emit chart changes for persistence
    effect(() => {
      const active = this.activeCharts();
      const chartTitles = active.map(chart => chart.title);
      this.chartsChanged.emit(chartTitles);
    });

    // Set up debounced resize handling
    this.setupResizeHandling();
  }

  ngAfterViewInit(): void {
    this.setupResizeObserver();
  }

  ngOnDestroy(): void {
    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // Clean up all chart elements and Vega instances
    this.cleanupAllCharts();

    this.destroy$.next();
    this.destroy$.complete();
    this.clearChartCache();
  }

  // Set up debounced resize handling
  private setupResizeHandling(): void {
    this.resizeSubject$
      .pipe(
        debounceTime(300), // 300ms debounce
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.reRenderAllCharts();
      });
  }

  // Set up ResizeObserver to watch for container size changes
  private setupResizeObserver(): void {
    console.log(`[${this.workspaceId()}] Setting up ResizeObserver`);
    if (typeof ResizeObserver === 'undefined') {
      console.warn(`[${this.workspaceId()}] ResizeObserver not supported`);
      return;
    }

    this.resizeObserver = new ResizeObserver(_entries => {
      // Check if any of the observed elements have changed size
      this.resizeSubject$.next();
    });

    // Observe the charts grid container
    const chartsGrid = this.chartsGridWrapper.nativeElement;

    if (chartsGrid) {
      this.resizeObserver.observe(chartsGrid);
      console.log(`[${this.workspaceId()}] ResizeObserver attached to charts grid`);
    }
  }

  // Re-render all active charts with new width calculations
  private reRenderAllCharts(): void {
    const activeCharts = this.activeCharts();

    activeCharts.forEach(chart => {
      // Only re-render charts that are successfully loaded
      if (!chart.isLoading && !chart.hasError && chart.vegaResult) {
        this.reRenderChart(chart.id);
      }
    });
  }

  // Re-render a specific chart with updated width
  private reRenderChart(chartId: string): void {
    const chart = this.activeCharts().find(c => c.id === chartId);
    const job = this.job();

    if (!chart || !job) return;

    const cacheKey = `${job.id}-${chart.filename}`;
    const cache = this.chartCache();
    const chartSpec = cache[cacheKey];

    if (!chartSpec) {
      console.warn(`[${this.workspaceId()}] No cached spec found for chart: ${chartId}`);
      return;
    }

    // Clean up existing chart
    const container = this.getChartContainer(chartId);
    if (container && chart.vegaResult) {
      try {
        chart.vegaResult.finalize();
        container.innerHTML = '';
      } catch (error) {
        console.warn(`[${this.workspaceId()}] Error cleaning up chart for re-render:`, error);
      }
    }

    // Re-render with new width calculation
    this.renderChartWithSpec(chartId, chartSpec);
  }

  // Process job results to extract available charts
  private processJobResults(job: JobDetailsResponse['job']): void {
    console.log(`[${this.workspaceId()}] Processing job results for job ${job.id}`);

    // Clear existing cache for different jobs
    this.clearChartCache();

    // Reset restoration flag when processing new job results
    this.hasRestoredFromPersistence.set(false);

    // Extract chart information from job payload
    try {
      if (!job.assignments || job.assignments.length === 0) {
        console.warn(`[${this.workspaceId()}] No assignments found in job ${job.id}`);
        this.availableChartsSignal.set([]);
        return;
      }

      const resultPayload = job.assignments[0].result?.result_payload as AdriaModelRunResult;
      const files = resultPayload.available_charts || {};

      const charts: ChartInfo[] = Array.from(Object.entries(files)).map(([name, filename]) => ({
        title: this.formatChartTitle(name),
        filename,
        description: `Chart from ${filename}`
      }));

      console.log(
        `[${this.workspaceId()}] Found ${charts.length} charts:`,
        charts.map(c => c.title)
      );
      this.availableChartsSignal.set(charts);
    } catch (error) {
      console.error(`[${this.workspaceId()}] Failed to process job results:`, error);
      this.availableChartsSignal.set([]);
    }
  }

  // Add default chart (Relative Coral Cover Over Time) if available
  private addDefaultChart(): void {
    const defaultChartTitle = 'Relative Coral Cover Over Time';
    const defaultChart = this.availableCharts().find(chart => chart.title === defaultChartTitle);

    if (defaultChart) {
      console.log(`[${this.workspaceId()}] Adding default chart: ${defaultChartTitle}`);

      // Mark that we've restored from persistence (even though we're adding default)
      this.hasRestoredFromPersistence.set(true);

      // Add the default chart
      this.addChart(defaultChart.filename);
    } else {
      console.log(`[${this.workspaceId()}] Default chart "${defaultChartTitle}" not available`);
      // Still mark as restored so we don't keep trying
      this.hasRestoredFromPersistence.set(true);
    }
  }

  // Restore charts from persistence
  private restoreChartsFromPersistence(chartTitles: string[]): void {
    console.log(`[${this.workspaceId()}] Restoring charts from persistence:`, chartTitles);

    const available = this.availableCharts();
    const chartsToRestore = chartTitles
      .map(title => available.find(chart => chart.title === title))
      .filter((chart): chart is ChartInfo => chart !== undefined);

    console.log(`[${this.workspaceId()}] Found ${chartsToRestore.length} charts to restore`);

    // Mark that we've restored from persistence
    this.hasRestoredFromPersistence.set(true);

    // Add charts without triggering individual events
    const newActiveCharts: ActiveChart[] = chartsToRestore.map(chart => ({
      id: this.generateChartId(),
      title: chart.title,
      filename: chart.filename,
      isLoading: true,
      hasError: false
    }));

    this.activeChartsSignal.set(newActiveCharts);

    // Load all charts after DOM elements are created
    setTimeout(() => {
      newActiveCharts.forEach(chart => {
        this.loadChart(chart.id);
      });
    }, 100);
  }

  // Add a new chart
  addChart(filename: string): void {
    if (!filename) return;

    const chartInfo = this.availableCharts().find(chart => chart.filename === filename);
    if (!chartInfo) {
      console.warn(`[${this.workspaceId()}] Chart not found: ${filename}`);
      return;
    }

    // Check if chart is already active
    const isAlreadyActive = this.activeCharts().some(chart => chart.filename === filename);
    if (isAlreadyActive) {
      this.snackBar.open('Chart is already displayed', 'Dismiss', { duration: 3000 });
      return;
    }

    const newChart: ActiveChart = {
      id: this.generateChartId(),
      title: chartInfo.title,
      filename: chartInfo.filename,
      isLoading: true,
      hasError: false
    };

    console.log(`[${this.workspaceId()}] Adding chart: ${newChart.title}`);

    // Add to active charts
    const currentCharts = this.activeCharts();
    this.activeChartsSignal.set([...currentCharts, newChart]);

    // Load the chart data after DOM element is created
    setTimeout(() => {
      this.loadChart(newChart.id);
    }, 100);
  }

  // Remove a chart
  removeChart(chartId: string): void {
    const chart = this.activeCharts().find(c => c.id === chartId);
    if (!chart) return;

    console.log(`[${this.workspaceId()}] Removing chart: ${chart.title}`);

    // Clean up Vega instance and DOM element
    this.cleanupChart(chartId);

    // Remove from active charts
    const updatedCharts = this.activeCharts().filter(c => c.id !== chartId);
    this.activeChartsSignal.set(updatedCharts);
  }

  // Retry loading a chart
  retryChart(chartId: string): void {
    const currentCharts = this.activeCharts();
    const chartIndex = currentCharts.findIndex(c => c.id === chartId);

    if (chartIndex === -1) return;

    console.log(`[${this.workspaceId()}] Retrying chart: ${currentCharts[chartIndex].title}`);

    // Clean up existing chart first
    this.cleanupChart(chartId);

    // Reset chart state
    const updatedCharts = [...currentCharts];
    updatedCharts[chartIndex] = {
      ...updatedCharts[chartIndex],
      isLoading: true,
      hasError: false,
      errorMessage: undefined,
      vegaResult: undefined
    };

    this.activeChartsSignal.set(updatedCharts);

    // Retry loading after a short delay
    setTimeout(() => {
      this.loadChart(chartId);
    }, 100);
  }

  // Load chart data and render
  private loadChart(chartId: string): void {
    const chart = this.activeCharts().find(c => c.id === chartId);
    const job = this.job();

    if (!chart || !job) return;

    const cacheKey = `${job.id}-${chart.filename}`;
    const cache = this.chartCache();

    // Check cache first
    if (cache[cacheKey]) {
      console.log(`[${this.workspaceId()}] Loading chart from cache: ${chart.title}`);
      this.renderChart(chartId, cache[cacheKey]);
      return;
    }

    // Download chart data
    console.log(`[${this.workspaceId()}] Downloading chart data: ${chart.title}`);

    this.api
      .downloadJobResults(job.id, undefined, chart.filename)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(response => {
          const files = response.files;
          const chartDataUrl = files[chart.filename];

          if (!chartDataUrl) {
            throw new Error(`Chart file not found: ${chart.filename}`);
          }

          // Fetch the actual chart data from the presigned URL
          return fetch(chartDataUrl).then(res => {
            if (!res.ok) {
              throw new Error(`Failed to fetch chart data: ${res.status} ${res.statusText}`);
            }
            return res.text();
          });
        }),
        map(chartDataText => {
          // Parse the chart specification
          try {
            return JSON.parse(chartDataText);
          } catch (parseError) {
            throw new Error(`Invalid chart data format: ${parseError}`);
          }
        }),
        catchError(error => {
          console.error(`[${this.workspaceId()}] Failed to load chart ${chart.title}:`, error);
          this.setChartError(chartId, error.message || 'Failed to load chart');
          return of(null);
        })
      )
      .subscribe(chartSpec => {
        if (chartSpec) {
          // Cache the chart spec
          const updatedCache = { ...this.chartCache() };
          updatedCache[cacheKey] = chartSpec;
          this.chartCache.set(updatedCache);

          // Render the chart
          this.renderChart(chartId, chartSpec);
        }
      });
  }

  // Render chart using Vega-Lite
  private renderChart(chartId: string, chartSpec: any): void {
    // Wait for the DOM element to be available
    setTimeout(() => {
      this.renderChartWithSpec(chartId, chartSpec);
    }, 50);
  }

  // Render chart with provided spec (extracted for reuse)
  private renderChartWithSpec(chartId: string, chartSpec: any): void {
    const container = this.getChartContainer(chartId);
    if (!container) {
      console.warn(`[${this.workspaceId()}] Chart container not found: ${chartId}`);
      this.setChartError(chartId, 'Chart container not available');
      return;
    }

    console.log(`[${this.workspaceId()}] Rendering chart: ${chartId}`);

    // Get the chart card container (parent) to measure available width
    const chartCard = container.closest('.chart-card') as HTMLElement;
    let containerWidth = 600; // Fallback width

    if (chartCard) {
      containerWidth = chartCard.clientWidth;
    } else {
      console.warn(`[${this.workspaceId()}] Could not find chart card, using fallback width`);
    }

    // Calculate dynamic width with padding consideration
    const dynamicWidth = Math.max(400, containerWidth - 275); // 275px for padding

    // Configure Vega-Lite options
    const options = {
      theme: 'quartz',
      renderer: 'canvas' as const,
      actions: {
        export: true,
        source: false,
        compiled: false,
        editor: false
      },
      width: dynamicWidth
    } satisfies EmbedOptions;

    // Render the chart
    embed(container, chartSpec, options)
      .then(result => {
        // Store the Vega result for cleanup
        this.updateChartVegaResult(chartId, result);

        // Set chart to loaded state (this will hide loading overlay and show chart)
        this.setChartLoaded(chartId);
      })
      .catch(error => {
        console.error(`[${this.workspaceId()}] Failed to render chart ${chartId}:`, error);
        this.setChartError(chartId, 'Failed to render chart');
      });
  }

  // Get chart container element
  private getChartContainer(chartId: string): HTMLElement | null {
    return document.getElementById(`chart-container-${chartId}`);
  }

  // Update chart's Vega result for cleanup purposes
  private updateChartVegaResult(chartId: string, vegaResult: Result): void {
    const currentCharts = this.activeCharts();
    const chartIndex = currentCharts.findIndex(c => c.id === chartId);

    if (chartIndex === -1) return;

    const updatedCharts = [...currentCharts];
    updatedCharts[chartIndex] = {
      ...updatedCharts[chartIndex],
      vegaResult
    };

    this.activeChartsSignal.set(updatedCharts);
  }

  // Update chart state to loaded
  private setChartLoaded(chartId: string): void {
    const currentCharts = this.activeCharts();
    const chartIndex = currentCharts.findIndex(c => c.id === chartId);

    if (chartIndex === -1) return;

    const updatedCharts = [...currentCharts];
    updatedCharts[chartIndex] = {
      ...updatedCharts[chartIndex],
      isLoading: false,
      hasError: false,
      errorMessage: undefined
    };

    this.activeChartsSignal.set(updatedCharts);
  }

  // Update chart state to error
  private setChartError(chartId: string, errorMessage: string): void {
    const currentCharts = this.activeCharts();
    const chartIndex = currentCharts.findIndex(c => c.id === chartId);

    if (chartIndex === -1) return;

    const updatedCharts = [...currentCharts];
    updatedCharts[chartIndex] = {
      ...updatedCharts[chartIndex],
      isLoading: false,
      hasError: true,
      errorMessage
    };

    this.activeChartsSignal.set(updatedCharts);
  }

  // Clean up a specific chart
  private cleanupChart(chartId: string): void {
    const chart = this.activeCharts().find(c => c.id === chartId);
    if (!chart) return;

    // Finalize Vega view if it exists
    if (chart.vegaResult) {
      try {
        chart.vegaResult.finalize();
      } catch (error) {
        console.warn(`[${this.workspaceId()}] Error finalizing Vega chart ${chartId}:`, error);
      }
    }

    // Clear the container
    const container = this.getChartContainer(chartId);
    if (container) {
      container.innerHTML = '';
    }

    // Remove element reference
    this.chartElementRefs.delete(chartId);
  }

  // Clean up all charts
  private cleanupAllCharts(): void {
    console.log(`[${this.workspaceId()}] Cleaning up all charts`);

    const currentCharts = this.activeCharts();
    currentCharts.forEach(chart => {
      this.cleanupChart(chart.id);
    });

    this.chartElementRefs.clear();
  }

  // Clear all charts
  private clearCharts(): void {
    console.log(`[${this.workspaceId()}] Clearing all charts`);

    // Clean up existing charts before clearing
    this.cleanupAllCharts();

    // Reset restoration flag when clearing charts
    this.hasRestoredFromPersistence.set(false);

    this.activeChartsSignal.set([]);
    this.availableChartsSignal.set([]);
  }

  // Clear chart cache
  private clearChartCache(): void {
    this.chartCache.set({});
  }

  // Generate unique chart ID
  private generateChartId(): string {
    const counter = this.chartIdCounter();
    this.chartIdCounter.set(counter + 1);
    return `chart-${this.workspaceId()}-${counter}`;
  }

  // Format chart title from chart name
  private formatChartTitle(chartName: string): string {
    // Convert snake_case or kebab-case to Title Case
    return chartName
      .replace(/[_-]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  // TrackBy function for chart list
  trackByChartId(index: number, chart: ActiveChart): string {
    return chart.id;
  }
}
