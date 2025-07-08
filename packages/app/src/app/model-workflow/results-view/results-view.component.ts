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
  OnDestroy
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { JobDetailsResponse } from '@reefguide/types';
import embed, { VisualizationSpec } from 'vega-embed';
import { WebApiService } from '../../../api/web-api.service';

/**
 * Results View Component
 *
 * Displays the results of a completed model run job including:
 * - An interactive Vega-Lite chart for relative cover over time
 *
 * The component handles workspace isolation by:
 * - Tracking workspace ID to detect workspace changes
 * - Re-rendering charts when workspace or job changes
 * - Cleaning up previous charts before rendering new ones
 */
@Component({
  selector: 'app-results-view',
  standalone: true,
  imports: [CommonModule, MatCardModule],
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

  /** Track the last rendered job/workspace combination to prevent unnecessary re-renders */
  private lastRenderedJobId: number | null = null;
  private lastRenderedWorkspaceId: string | null = null;

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
     * Effect to handle Vega chart rendering when job completes OR workspace changes
     * Triggers when:
     * - Job status changes to 'SUCCEEDED'
     * - Workspace ID changes (tab switch)
     * - ViewChild becomes available
     */
    effect(() => {
      const job = this.job();
      const workspaceId = this.currentWorkspaceId();

      if (job?.status === 'SUCCEEDED' && this.vegaChartRef && workspaceId) {
        // Check if we need to re-render (job changed OR workspace changed)
        const needsRender =
          this.lastRenderedJobId !== job.id ||
          this.lastRenderedWorkspaceId !== workspaceId;

        if (needsRender) {
          console.log(`[${workspaceId}] Rendering Vega chart for job ${job.id}`);
          this.downloadAndRenderVegaChart(job.id, workspaceId);
          this.lastRenderedJobId = job.id;
          this.lastRenderedWorkspaceId = workspaceId;
        }
      }
    });
  }

  /**
   * AfterViewInit lifecycle hook
   * Handles the case where the job was already completed before the view initialized
   */
  ngAfterViewInit(): void {
    const job = this.job();
    const workspaceId = this.currentWorkspaceId();

    if (job?.status === 'SUCCEEDED' && workspaceId) {
      const needsRender =
        this.lastRenderedJobId !== job.id ||
        this.lastRenderedWorkspaceId !== workspaceId;

      if (needsRender) {
        console.log(`[${workspaceId}] Initial render of Vega chart for job ${job.id}`);
        this.downloadAndRenderVegaChart(job.id, workspaceId);
        this.lastRenderedJobId = job.id;
        this.lastRenderedWorkspaceId = workspaceId;
      }
    }
  }

  /**
   * OnDestroy lifecycle hook
   * Clean up any rendered charts
   */
  ngOnDestroy(): void {
    this.clearChart();
  }

  /**
   * Downloads the Vega-Lite specification and renders the interactive chart
   * @param jobId - The ID of the completed job
   * @param workspaceId - The ID of the workspace (for logging)
   */
  private async downloadAndRenderVegaChart(jobId: number, workspaceId: string): Promise<void> {
    try {
      console.log(`[${workspaceId}] Downloading Vega spec for job ${jobId}`);

      // Clear any existing chart first
      this.clearChart();

      // Download the Vega-Lite specification file
      const downloadResponse = await this.webApi
        .downloadJobResults(jobId, undefined, 'relative_cover_vega_spec.vegalite')
        .toPromise();

      const vegaUrl = downloadResponse?.files['relative_cover_vega_spec.vegalite'];

      if (!vegaUrl) {
        console.warn(`[${workspaceId}] No Vega spec URL found in download response`);
        return;
      }

      // Fetch and parse the JSON specification
      const response = await fetch(vegaUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch Vega spec: ${response.status}`);
      }

      const spec = await response.json();

      // Render the interactive chart
      await this.renderVegaChart(spec, workspaceId);

      console.log(`[${workspaceId}] Successfully rendered Vega chart for job ${jobId}`);
    } catch (error) {
      console.error(`[${workspaceId}] Error downloading/rendering Vega chart:`, error);
    }
  }

  /**
   * Renders a Vega-Lite chart in the designated container
   * @param spec - The Vega-Lite specification object
   * @param workspaceId - The ID of the workspace (for logging)
   */
  private async renderVegaChart(spec: VisualizationSpec, workspaceId: string): Promise<void> {
    try {
      if (!this.vegaChartRef?.nativeElement) {
        console.warn(`[${workspaceId}] Vega chart container not available`);
        return;
      }

      // Clear any existing chart content
      this.clearChart();

      // Render the interactive chart with Vega-Embed
      await embed(this.vegaChartRef.nativeElement, spec, {
        actions: true, // Enable download/edit actions
        theme: 'googlecharts' // Clean theme
      });

      console.log(`[${workspaceId}] Vega chart rendered successfully`);
    } catch (error) {
      console.error(`[${workspaceId}] Error rendering Vega chart:`, error);
    }
  }

  /**
   * Clear the chart container
   */
  private clearChart(): void {
    if (this.vegaChartRef?.nativeElement) {
      this.vegaChartRef.nativeElement.innerHTML = '';
    }
  }
}
