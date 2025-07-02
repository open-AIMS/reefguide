// src/app/model-run/model-run.component.ts
import {
  Component,
  computed,
  inject,
  input,
  Signal,
  ViewChild,
  ChangeDetectorRef
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { AsyncPipe, DatePipe, NgIf, CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ArcgisMap, ComponentLibraryModule } from '@arcgis/map-components-angular';
import { AdriaApiService } from '../adria-api.service';
import { map, Observable, switchMap, of, catchError } from 'rxjs';
import { DataFrame, ResultSetInfo } from '../../types/api.type';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatTabsModule } from '@angular/material/tabs';
import { TableComponent } from '../table/table.component';
import { MatExpansionModule } from '@angular/material/expansion';
import { ModelspecExplorerComponent } from '../model/modelspec-explorer/modelspec-explorer.component';
import { dataframeToTable, SimpleTable } from '../../util/dataframe-util';
import { ReefMapComponent } from '../reef-map/reef-map.component';
import { ResultSetService } from '../contexts/result-set.service';
import { MatToolbar } from '@angular/material/toolbar';
import { MatCardModule } from '@angular/material/card';
import { WebApiService } from '../../api/web-api.service';
import { JobStatusComponent } from '../jobs/job-status/job-status.component';
import { JobStatusConfig, getDefaultJobConfig } from '../jobs/job-status/job-status.types';
import { JobDetailsResponse } from '@reefguide/types';

@Component({
  selector: 'app-model-run',
  templateUrl: './model-run.component.html',
  styleUrl: './model-run.component.scss',
  imports: [
    CommonModule,
    MatExpansionModule,
    MatButtonModule,
    DatePipe,
    MatIconModule,
    RouterLink,
    ComponentLibraryModule,
    AsyncPipe,
    NgIf,
    MatTabsModule,
    TableComponent,
    ModelspecExplorerComponent,
    ReefMapComponent,
    MatToolbar,
    MatCardModule,
    JobStatusComponent
  ],
  providers: [ResultSetService]
})
export class ModelRunComponent {
  private readonly adriaApi = inject(AdriaApiService);
  private readonly webApi = inject(WebApiService);
  private readonly resultSetContext = inject(ResultSetService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdf = inject(ChangeDetectorRef);

  // Input can be either a job ID (number) or result set ID (string)
  id = input.required<string>();

  // Job-related signals
  public readonly jobId = computed(() => {
    const id = this.id();
    // If it's a numeric string, treat as job ID
    const numericId = parseInt(id, 10);
    return !isNaN(numericId) ? numericId : null;
  });

  private readonly resultSetId = computed(() => {
    const id = this.id();
    const numericId = parseInt(id, 10);
    // If it's not numeric, treat as result set ID
    return isNaN(numericId) ? id : null;
  });

  // Job status tracking
  job$: Observable<JobDetailsResponse['job'] | null>;
  job: Signal<JobDetailsResponse['job'] | null | undefined>;

  // Job configuration
  jobConfig: JobStatusConfig = getDefaultJobConfig('ADRIA_MODEL_RUN');

  // Result data (only available after job completion or for direct result sets)
  run$: Observable<ResultSetInfo | null>;
  run: Signal<ResultSetInfo | null | undefined>;

  modelspecDataframe$: Observable<DataFrame | null>;
  scenariosTable$: Observable<SimpleTable | null>;

  // Figure display
  resultFigure: Signal<string | undefined> = toSignal(
    toObservable(this.jobId).pipe(
      switchMap(jobId => {
        if (!jobId) return of(undefined);

        // Only try to download figure if job exists and is complete
        return this.webApi.getJob(jobId).pipe(
          switchMap(jobResponse => {
            const job = jobResponse.job;
            if (job.status === 'SUCCEEDED') {
              return this.webApi.downloadJobResults(jobId).pipe(
                map(downloadResponse => {
                  // Get the figure URL from the files object
                  // TODO unhardcode this
                  const figureUrl = downloadResponse.files['figure.png'];
                  return figureUrl || undefined;
                }),
                catchError(err => {
                  console.error('Failed to download job results:', err);
                  return of(undefined);
                })
              );
            }
            return of(undefined);
          }),
          catchError(err => {
            console.error('Failed to get job details:', err);
            return of(undefined);
          })
        );
      })
    )
  );

  // Legacy properties for existing functionality
  mapItemId = '94fe3f59dcc64b9eb94576a1f1f17ec9';
  selected_metric: string = 'relative_cover';
  metrics_figures: Array<[number, SafeHtml]> = [];
  metrics: string[] = [
    'relative_cover',
    'total_cover',
    'rsv',
    'asv',
    'relative_juveniles',
    'absolute_juveniles',
    'coral_evenness'
  ];

  @ViewChild(ArcgisMap) map!: ArcgisMap;

  constructor() {
    const id$ = toObservable(this.id);

    // Set up job tracking if this is a job ID
    this.job$ = toObservable(this.jobId).pipe(
      switchMap(jobId => {
        if (!jobId) return of(null);

        return this.webApi.getJob(jobId).pipe(
          map(response => response.job),
          catchError(err => {
            console.error('Failed to fetch job:', err);
            return of(null);
          })
        );
      })
    );

    this.job = toSignal(this.job$);

    // Set up result set tracking
    this.run$ = toObservable(this.resultSetId).pipe(
      switchMap(resultSetId => {
        if (!resultSetId) return of(null);

        // Update the ResultSet context if we have a result set ID
        this.resultSetContext.id = resultSetId;
        return this.resultSetContext.info$.pipe(
          catchError(err => {
            console.error('Failed to fetch result set:', err);
            return of(null);
          })
        );
      })
    );

    this.run = toSignal(this.run$);

    // Set up data streams (only for result sets)
    this.modelspecDataframe$ = toObservable(this.resultSetId).pipe(
      switchMap(resultSetId => {
        if (!resultSetId) return of(null);
        return this.adriaApi.getResultSetModelSpec(resultSetId).pipe(catchError(() => of(null)));
      })
    );

    this.scenariosTable$ = toObservable(this.resultSetId).pipe(
      switchMap(resultSetId => {
        if (!resultSetId) return of(null);
        return this.adriaApi.getResultSetScenarios(resultSetId).pipe(
          map(dataframeToTable),
          catchError(() => of(null))
        );
      })
    );
  }

  // Computed properties for template
  isJobView = computed(() => this.jobId() !== null);
  isResultSetView = computed(() => this.resultSetId() !== null);

  showJobStatus = computed(() => {
    const job = this.job();
    return job && (job.status === 'PENDING' || job.status === 'IN_PROGRESS');
  });

  showResults = computed(() => {
    const job = this.job();
    const resultSet = this.run();

    // Show results if we have a completed job or a direct result set
    return (job && job.status === 'SUCCEEDED') || resultSet;
  });

  showJobError = computed(() => {
    const job = this.job();
    return (
      job && (job.status === 'FAILED' || job.status === 'CANCELLED' || job.status === 'TIMED_OUT')
    );
  });

  // Event handlers
  onJobCompleted(job: JobDetailsResponse['job']) {
    console.log('Job completed:', job);

    if (job.status === 'SUCCEEDED') {
      // Job succeeded, results should now be available
      console.log('Job succeeded, results should be available');
    }
  }

  onRetryRequested() {
    console.log('Retry requested for job');
    // Could implement retry logic here
  }

  // Legacy methods for existing functionality
  onSelectMetric(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    this.selected_metric = selectElement.value;
  }

  getMetricFigure(): void {
    const resultSetId = this.resultSetId();
    if (!resultSetId || !this.selected_metric) return;

    this.adriaApi.getMetricFigure(resultSetId, this.selected_metric).subscribe({
      next: response => {
        const sanitizedHtml = this.sanitizer.bypassSecurityTrustHtml(response);
        this.metrics_figures.push([this.metrics_figures.length + 1, sanitizedHtml]);
        this.cdf.detectChanges();
        console.log(this.metrics_figures.length);
      },
      error: error => {
        console.log(error.message);
      }
    });
    const index = this.metrics.findIndex(item => item === this.selected_metric);
    if (index !== -1) {
      this.metrics.splice(index, 1);
    }
    this.selected_metric = this.metrics[0];
  }
}
