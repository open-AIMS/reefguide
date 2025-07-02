// src/app/model-workflow/results-view/results-view.component.ts
import { Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { JobDetailsResponse } from '@reefguide/types';
import { WebApiService } from '../../../api/web-api.service';

@Component({
  selector: 'app-results-view',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule
  ],
  templateUrl: './results-view.component.html',
  styleUrl: './results-view.component.scss'
})
export class ResultsViewComponent {
  private readonly webApi = inject(WebApiService);

  // Input: job from the workflow
  job = input<JobDetailsResponse['job'] | null>(null);

  // Computed job ID from job input
  private jobId = computed(() => {
    const job = this.job();
    console.log('Job changed in results view:', job);
    return job?.id || null;
  });

  // Main result figure from job results - use toObservable to properly react to signal changes
  resultFigure = toSignal(
    toObservable(this.jobId).pipe(
      switchMap(jobId => {
        console.log('JobId changed:', jobId);
        if (!jobId) return of(undefined);

        return this.webApi.getJob(jobId).pipe(
          switchMap(jobResponse => {
            const job = jobResponse.job;
            console.log('Job status:', job.status);
            if (job.status === 'SUCCEEDED') {
              console.log('Job succeeded, downloading results...');
              return this.webApi.downloadJobResults(jobId, undefined, 'figure.png').pipe(
                map(downloadResponse => {
                  console.log('Download response:', downloadResponse);
                  const figureUrl = downloadResponse.files['figure.png'];
                  console.log('Figure URL:', figureUrl);
                  return figureUrl;
                }),
                catchError(error => {
                  console.error('Error downloading results:', error);
                  return of(undefined);
                })
              );
            }
            return of(undefined);
          }),
          catchError(error => {
            console.error('Error getting job:', error);
            return of(undefined);
          })
        );
      })
    )
  );
}
