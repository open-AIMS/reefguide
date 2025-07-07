import { inject, Injectable, signal } from '@angular/core';
import { WebApiService } from '../../api/web-api.service';
import { JobStatus, JobType } from '@reefguide/db';
import { CreateJobResponse, JobDetailsResponse, ListJobsResponse } from '@reefguide/types';
import {
  BehaviorSubject,
  finalize,
  interval,
  map,
  shareReplay,
  switchMap,
  takeWhile,
  tap,
  distinctUntilKeyChanged,
  Observable,
  of,
  Subject,
  takeUntil
} from 'rxjs';
import { retryHTTPErrors } from '../../util/http-util';
import { AuthService } from '../auth/auth.service';

// API's job status plus 'CREATING'
export type ExtendedJobStatus = JobStatus | 'CREATING';

/**
 * @see JobsManagerService._startJob
 */
export type StartedJob = {
  /**
   * Shared+replay observable from createJob.
   */
  createJob$: Observable<CreateJobResponse>;
  /**
   * Shared+replay observable with latest job details.
   * Emits when status changes, completes when not pending OR in-progress.
   */
  jobDetails$: Observable<JobDetailsResponse['job']>;
  /**
   * Current job status
   */
  status$: Observable<ExtendedJobStatus>;
  /**
   * stop jobDetails$ interval
   */
  cancel$: Subject<void>;
};

/**
 * Start jobs and track the user's current jobs.
 * This service should be used for starting jobs instead of WebApiService.
 */
@Injectable({
  providedIn: 'root'
})
export class JobsManagerService {
  private readonly webApi = inject(WebApiService);
  private readonly authService = inject(AuthService);

  // user's current jobs
  readonly jobs = signal<TrackedJob[]>([]);

  // auto-remove when succeeded after this many milliseconds.
  autoRemoveTime: number = 1_000;

  // poll job details every milliseconds
  jobDetailsInterval: number = 2_000;

  private _reset$ = new Subject<void>();

  constructor() {
    this.authService.user$.subscribe(user => {
      if (user) {
        this.refresh();
      } else {
        this.reset();
      }
    });
  }

  /**
   * Start the job and track it.
   * Auto-removes successful job after autoRemoveTime.
   * @see WebApiService.startJob
   */
  startJob(jobType: JobType, payload: Record<string, any>) {
    const startedJob = this._startJob(jobType, payload);
    const trackedJob = new TrackedJob(jobType, payload, startedJob);
    this._addTrackedJob(trackedJob);
    return trackedJob;
  }

  private addExistingJobs(list: ListJobsResponse) {
    const jobs = this.jobs();
    for (let job of list.jobs) {
      if (jobs.find(j => j.jobId === job.id)) {
        continue;
      }

      const payload = job.input_payload ?? {};
      const startedJob = this._watchExistingJob(job);
      const trackedJob = new TrackedJob(job.type, payload, startedJob);
      this._addTrackedJob(trackedJob);
    }
  }

  /**
   * Query API for jobs list and track them.
   */
  refresh() {
    // TODO PENDING or IN-PROGRESS
    // TODO update API to support only my jobs, if admin, you'll see everyone's jobs
    this.webApi.listJobs({ status: 'PENDING' }).subscribe(jobs => {
      this.addExistingJobs(jobs);
    });
  }

  /**
   * Clear the jobs list and unsubscribe everything.
   */
  reset() {
    this.jobs.set([]);
    this._reset$.next();
  }

  cancel(trackedJob: TrackedJob) {
    const jobId = trackedJob.jobId;
    if (jobId === undefined) {
      throw new Error(`Cannot cancel TrackedJob without jobId`);
    }

    trackedJob.cancel();
    this.remove(trackedJob.id);

    this.webApi.cancelJob(jobId).subscribe(x => {
      console.log(`job ${jobId} cancelled`, x);
    });
  }

  /**
   * Cancel all jobs currently tracked in the jobs list.
   */
  cancelAll() {
    const jobs = this.jobs();
    for (let job of jobs) {
      this.cancel(job);
    }
  }

  /**
   * Remove the corresponding TrackedJob from jobs list.
   * This does not cancel the job, it simply removes it.
   * @param trackedJobId
   */
  remove(trackedJobId: number) {
    this.jobs.update(jobs => jobs.filter(j => j.id !== trackedJobId));
  }

  private _addTrackedJob(trackedJob: TrackedJob) {
    // change detection doesn't work if mutate list with push()
    this.jobs.update(jobs => [...jobs, trackedJob]);

    // auto-remove job when succeeded.
    trackedJob.jobDetails$.subscribe(jobDetails => {
      if (jobDetails.status === 'SUCCEEDED') {
        setTimeout(() => {
          this.remove(trackedJob.id);
        }, this.autoRemoveTime);
      }
    });
  }

  /**
   * Create a job and poll its details every period. Returns 3 observables to track the job
   * creation, job details, and status.
   * @param jobType job type
   * @param payload job type's payload
   * @param period how often to request job status in milliseconds (default 2 seconds)
   * @returns StartedJob with observables to track creation, job details, and status.
   */
  private _startJob(jobType: JobType, payload: Record<string, any>): StartedJob {
    const createJob$ = this.webApi.createJob(jobType, payload).pipe(shareReplay(1));
    const cancel$ = new Subject<void>();
    const status$ = new BehaviorSubject<ExtendedJobStatus>('CREATING');

    const jobDetails$ = createJob$.pipe(
      retryHTTPErrors(3),
      switchMap(createJobResp => this._watchJobDetails(createJobResp.jobId, status$, cancel$))
    );

    return { createJob$, jobDetails$, status$, cancel$ };
  }

  /**
   * Similar to {@link _startJob}, but for an existing pending/in-progress job.
   * @param job
   */
  private _watchExistingJob(job: ListJobsResponse['jobs'][number]): StartedJob {
    // fake create job response
    const createJob$: Observable<CreateJobResponse> = of({
      jobId: job.id,
      // we only call this for pending/in-progress, so it's not cached
      cached: false,
      // FIXME hack, requestId not in ListJobsResponse, but not used in app code
      requestId: -1
    });

    const cancel$ = new Subject<void>();
    const status$ = new BehaviorSubject<ExtendedJobStatus>(job.status);

    const jobDetails$ = this._watchJobDetails(job.id, status$, cancel$);

    return { createJob$, jobDetails$, status$, cancel$ };
  }

  private _watchJobDetails(
    jobId: number,
    status$: BehaviorSubject<ExtendedJobStatus>,
    cancel$: Observable<void>
  ): StartedJob['jobDetails$'] {
    status$.next('PENDING');
    return interval(this.jobDetailsInterval).pipe(
      // Future: if client is tracking many jobs, it would be more efficient to
      // share the query/request for all of them (i.e. switchMap to shared observable),
      // but this is simplest for now.
      switchMap(() => this.webApi.getJob(jobId).pipe(retryHTTPErrors(3))),
      // discard extra wrapping object, which has no information.
      map(v => v.job),
      // only emit when job status changes.
      distinctUntilKeyChanged('status'),
      // convert job error statuses to thrown errors.
      tap(job => {
        const s = job.status;
        status$.next(s);
        if (s === 'FAILED' || s === 'CANCELLED' || s === 'TIMED_OUT') {
          throw new Error(`Job id=${job.id} ${s}`);
        }
      }),
      // complete observable when not pending/in-progress; emit the last value
      takeWhile(
        x => x.status === 'PENDING' || x.status === 'IN_PROGRESS',
        true // inclusive: emit the first value that fails the predicate
      ),
      takeUntil(cancel$),
      takeUntil(this._reset$),
      finalize(() => {
        status$.complete();
      }),
      shareReplay(1)
    );
  }
}

let lastTrackedJobId = 0;

export class TrackedJob {
  // constantly incrementing id (needed by @for track)
  public readonly id: number;
  public jobId?: number;
  public readonly createJob$: StartedJob['createJob$'];
  public readonly status$: StartedJob['status$'];
  public readonly jobDetails$: StartedJob['jobDetails$'];

  private cancel$: Subject<void>;

  constructor(
    public readonly jobType: JobType,
    public readonly payload: Record<string, any>,
    startedJob: StartedJob
  ) {
    this.id = lastTrackedJobId++;
    this.createJob$ = startedJob.createJob$;
    this.status$ = startedJob.status$;
    this.jobDetails$ = startedJob.jobDetails$;
    this.cancel$ = startedJob.cancel$;

    this.createJob$.subscribe(job => {
      this.jobId = job.jobId;
    });
  }

  cancel() {
    this.cancel$.next();
    this.cancel$.complete();
  }
}
