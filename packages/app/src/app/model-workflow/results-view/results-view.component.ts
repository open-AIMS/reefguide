import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  ViewChild,
  effect,
  AfterViewInit
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { JobDetailsResponse } from '@reefguide/types';
import { catchError, map, of, switchMap } from 'rxjs';
import embed, { VisualizationSpec } from 'vega-embed';
import { WebApiService } from '../../../api/web-api.service';

/**
 * Results View Component
 *
 * Displays the results of a completed model run job including:
 * - A static PNG figure from the job results
 * - An interactive Vega-Lite chart for relative cover over time
 *
 * The component handles two download scenarios:
 * 1. PNG figure: Downloaded reactively using RxJS streams
 * 2. Vega chart: Downloaded imperatively using async/await when job completes
 */
@Component({
  selector: 'app-results-view',
  standalone: true,
  imports: [CommonModule, MatCardModule],
  templateUrl: './results-view.component.html',
  styleUrl: './results-view.component.scss'
})
export class ResultsViewComponent implements AfterViewInit {
  private readonly webApi = inject(WebApiService);

  /** Input job from the parent workflow component */
  job = input<JobDetailsResponse['job'] | undefined>(undefined);

  /** Reference to the Vega chart container element */
  @ViewChild('vegaChart', { static: false }) vegaChartRef!: ElementRef;

  /** Prevents duplicate chart rendering */
  private hasRenderedChart = false;

  /** Computed job ID for reactive streams */
  private readonly jobId = computed(() => {
    const job = this.job();
    return job?.id || undefined;
  });

  /**
   * Reactive download of the PNG result figure
   * Uses RxJS streams to automatically download the figure when job completes
   */
  readonly resultFigure = toSignal(
    toObservable(this.jobId).pipe(
      switchMap(jobId => {
        if (!jobId) return of(undefined);

        return this.webApi.getJob(jobId).pipe(
          switchMap(jobResponse => {
            const job = jobResponse.job;
            if (job.status === 'SUCCEEDED') {
              return this.webApi.downloadJobResults(jobId, undefined, 'figure.png').pipe(
                map(downloadResponse => downloadResponse.files['figure.png']),
                catchError(error => {
                  console.error('Error downloading PNG figure:', error);
                  return of(undefined);
                })
              );
            }
            return of(undefined);
          }),
          catchError(error => {
            console.error('Error fetching job for PNG:', error);
            return of(undefined);
          })
        );
      })
    )
  );

  constructor() {
    /**
     * Effect to handle Vega chart rendering when job completes
     * Triggers when job status changes to 'SUCCEEDED' and ViewChild is available
     */
    effect(() => {
      const job = this.job();

      if (job?.status === 'SUCCEEDED' && this.vegaChartRef && !this.hasRenderedChart) {
        this.hasRenderedChart = true;
        this.downloadAndRenderVegaChart(job.id);
      }
    });
  }

  /**
   * AfterViewInit lifecycle hook
   * Handles the case where the job was already completed before the view initialized
   */
  ngAfterViewInit(): void {
    const job = this.job();

    if (job?.status === 'SUCCEEDED' && !this.hasRenderedChart) {
      this.hasRenderedChart = true;
      this.downloadAndRenderVegaChart(job.id);
    }
  }

  /**
   * Downloads the Vega-Lite specification and renders the interactive chart
   * @param jobId - The ID of the completed job
   */
  private async downloadAndRenderVegaChart(jobId: number): Promise<void> {
    try {
      // Download the Vega-Lite specification file
      const downloadResponse = await this.webApi
        .downloadJobResults(jobId, undefined, 'relative_cover_vega_spec.vegalite')
        .toPromise();

      const vegaUrl = downloadResponse?.files['relative_cover_vega_spec.vegalite'];

      if (!vegaUrl) {
        console.warn('No Vega spec URL found in download response');
        return;
      }

      // Fetch and parse the JSON specification
      const response = await fetch(vegaUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch Vega spec: ${response.status}`);
      }

      const spec = await response.json();

      // Render the interactive chart
      await this.renderVegaChart(spec);
    } catch (error) {
      console.error('Error downloading/rendering Vega chart:', error);
    }
  }

  /**
   * Renders a Vega-Lite chart in the designated container
   * @param spec - The Vega-Lite specification object
   */
  private async renderVegaChart(spec: VisualizationSpec): Promise<void> {
    try {
      if (!this.vegaChartRef?.nativeElement) {
        console.warn('Vega chart container not available');
        return;
      }

      // Clear any existing chart content
      this.vegaChartRef.nativeElement.innerHTML = '';

      // Render the interactive chart with Vega-Embed
      await embed(this.vegaChartRef.nativeElement, spec, {
        actions: true, // Enable download/edit actions
        theme: 'googlecharts' // Clean theme
      });
    } catch (error) {
      console.error('Error rendering Vega chart:', error);
    }
  }
}
