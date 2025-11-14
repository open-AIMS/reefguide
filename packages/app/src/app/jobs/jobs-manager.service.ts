import { inject, Injectable, signal } from '@angular/core';
import { WebApiService } from '../../api/web-api.service';
import { JobStatus, JobType } from '@reefguide/db';
import { CreateJobResponse, JobDetailsResponse, ListJobsResponse } from '@reefguide/types';
import {
  BehaviorSubject,
  finalize,
  map,
  shareReplay,
  switchMap,
  takeWhile,
  tap,
  distinctUntilKeyChanged,
  Observable,
  of,
  Subject,
  takeUntil,
  repeat
} from 'rxjs';
import { retryHTTPErrors } from '../../util/http-util';
import { AuthService } from '../auth/auth.service';

// API's job status plus 'CREATING', 'CREATE_FAILED'
export type ExtendedJobStatus = JobStatus | 'CREATING' | 'CREATE_FAILED';

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

  /**
   * Jobs manager reset
   * @see reset()
   */
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
    this.webApi
      .listMyJobs({
        status: 'PENDING'
      })
      .subscribe(jobs => {
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
   * Create a job and poll its details. Returns 3 observables to track the job
   * creation, job details, and status.
   * @param jobType job type
   * @param payload job type's payload
   * @returns StartedJob with observables to track creation, job details, and status.
   * @see _watchJobDetails
   */
  private _startJob(jobType: JobType, payload: Record<string, any>): StartedJob {
    const status$ = new BehaviorSubject<ExtendedJobStatus>('CREATING');
    const cancel$ = new Subject<void>();

    const createJob$ = this.webApi.createJob(jobType, payload).pipe(
      retryHTTPErrors(3),
      tap(value => {
        if (!value.cached) {
          // eagerly change to next status (PENDING) so UI can reflect this before jobDetails responds
          status$.next('PENDING');
        }
        // REVIEW else does cached always mean SUCCEEDED?
      }),
      // this observable is returned and of interest to multiple subscribers
      shareReplay(1)
    );

    const jobDetails$ = createJob$.pipe(
      switchMap(createJobResp => this._watchJobDetails(createJobResp.jobId, status$, cancel$)),
      // replay needed here, otherwise each subscription will execute a new switchMap
      shareReplay({ bufferSize: 1, refCount: true })
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

    const jobDetails$ = this._watchJobDetails(job.id, status$, cancel$).pipe(
      shareReplay({ bufferSize: 1, refCount: true })
    );

    return { createJob$, jobDetails$, status$, cancel$ };
  }

  /**
   * Poll the job's details on jobDetailsInterval until unsubscribed.
   * Completes when status is not PENDING or IN_PROGRESS
   * Errors when FAILED, CANCELLED, TIMED_OUT
   * Caller is responsible for reploy
   * @param jobId
   * @param status$
   * @param cancel$
   * @private
   */
  private _watchJobDetails(
    jobId: number,
    status$: BehaviorSubject<ExtendedJobStatus>,
    cancel$: Observable<void>
  ): StartedJob['jobDetails$'] {
    // FUTURE if client is tracking many jobs, it would be more efficient to
    //  share the query/request for all of them (i.e. switchMap to shared observable),
    //  but this is simplest for now.
    return this.webApi.getJob(jobId).pipe(
      // infinite error retry
      retryHTTPErrors(undefined, 50),
      // keep polling job details until unsubscribed
      repeat({
        delay: this.jobDetailsInterval
      }),
      // discard extra wrapping object, which has no information.
      map(details => details.job),
      // only emit when job status changes.
      distinctUntilKeyChanged('status'),
      // convert job error statuses to thrown errors.
      tap(details => {
        const s = details.status;
        status$.next(s);
        if (s === 'FAILED' || s === 'CANCELLED' || s === 'TIMED_OUT') {
          throw new Error(`Job id=${details.id} ${s}`);
        }
      }),
      // complete observable when not pending/in-progress; emit the last value
      takeWhile(
        details => details.status === 'PENDING' || details.status === 'IN_PROGRESS',
        true // inclusive: emit the first value that fails the predicate
      ),
      takeUntil(cancel$),
      takeUntil(this._reset$),
      finalize(() => {
        status$.complete();
      })
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
