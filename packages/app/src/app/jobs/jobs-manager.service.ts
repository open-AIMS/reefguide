import { inject, Injectable, signal } from '@angular/core';
import { StartedJob, WebApiService } from '../../api/web-api.service';
import { JobType } from '@reefguide/db';
import { JobDetailsResponse } from '@reefguide/types';

/**
 * Start jobs and track the user's current jobs.
 * This service should be used for starting jobs instead of WebApiService.
 */
@Injectable({
  providedIn: 'root'
})
export class JobsManagerService {
  readonly webApi = inject(WebApiService);

  // user's current jobs
  jobs = signal<TrackedJob[]>([]);

  constructor() {
    // TODO query users current active jobs
    // TODO auth concerns. reset on logout
  }

  startJob(jobType: JobType, payload: Record<string, any>) {
    const startedJob = this.webApi.startJob(jobType, payload);
    const trackedJob = new TrackedJob(jobType, payload, startedJob);
    this.jobs.update(jobs => {
      jobs.push(trackedJob);
      return jobs;
    });
    return trackedJob;
  }

  /**
   * Remove the corresponding TrackedJob from jobs list.
   * This does not cancel the job, it simply removes it.
   * @param trackedJobId
   */
  remove(trackedJobId: number) {
    this.jobs.update(jobs => jobs.filter(j => j.id !== trackedJobId));
  }

}

let lastTrackedJobId = 0;

type ExtendedJobStatus = JobDetailsResponse['job']['status'] | 'CREATING' | 'CREATED';

export class TrackedJob {
  // constantly incrementing id (needed by @for track)
  public readonly id: number;
  public readonly createJob$: StartedJob['createJob$'];
  public readonly status$: StartedJob['status$'];
  public readonly jobDetails$: StartedJob['jobDetails$'];

  constructor(
    public readonly jobType: JobType,
    public readonly payload: Record<string, any>,
    startedJob: StartedJob
  ) {
    this.id = lastTrackedJobId++;
    this.createJob$ = startedJob.createJob$;
    this.status$ = startedJob.status$;
    this.jobDetails$ = startedJob.jobDetails$;
  }

}
