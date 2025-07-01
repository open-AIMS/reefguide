import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { JobType, Polygon, PolygonNote, User, UserRole } from '@reefguide/db';
import {
  CreateJobResponse,
  DownloadResponse,
  JobDetailsResponse,
  ListJobsResponse,
  ListUserLogsResponse,
  LoginResponse,
  ProfileResponse
} from '@reefguide/types';
import {
  BehaviorSubject,
  distinctUntilKeyChanged,
  interval,
  map,
  Observable,
  finalize,
  shareReplay,
  switchMap,
  takeWhile,
  tap
} from 'rxjs';
import { environment } from '../environments/environment';
import { retryHTTPErrors } from '../util/http-util';

type JobId = CreateJobResponse['jobId'];

// API's job status plus 'CREATING'
type ExtendedJobStatus = JobDetailsResponse['job']['status'] | 'CREATING';

/**
 * @see WebApiService.startJob
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
};

/**
 * MADAME/ReefGuide Web API - see packages/web-api
 *
 * This is a low-level HTTP API providing methods for all of the web-api features -
 * auth, user management, jobs, polygons, etc. Other services such as AuthService
 * and JobsManagerService are built on top of this.
*/
@Injectable({
  providedIn: 'root'
})
export class WebApiService {
  private readonly http = inject(HttpClient);
  base = environment.webApiUrl;
  baseUsers = `${environment.webApiUrl}/users`;

  constructor() {}

  register(user: { email: string; password: string }) {
    return this.http.post<{ userId: number }>(`${this.base}/auth/register`, user);
  }

  login(user: { email: string; password: string }) {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, user);
  }

  refreshToken(refreshToken: string): Observable<string> {
    return this.http
      .post<{ token: string }>(`${this.base}/auth/token`, { refreshToken })
      .pipe(map(resp => resp.token));
  }

  getProfile() {
    return this.http.get<ProfileResponse>(`${this.base}/auth/profile`);
  }

  getPolygons(): Observable<Polygon[]> {
    return this.http.get<Polygon[]>(`${this.base}/polygons`);
  }

  getPolygon(id: string): Observable<Polygon> {
    return this.http.get<Polygon>(`${this.base}/polygons/${id}`);
  }

  // TODO fix types where using any
  createPolygon(geoJSON: any): Observable<any> {
    return this.http.post<any>(`${this.base}/polygons`, geoJSON);
  }

  updatePolygon(id: string, geoJSON: any): Observable<void> {
    return this.http.put<any>(`${this.base}/polygons/${id}`, geoJSON);
  }

  deletePolygon(id: string) {
    return this.http.delete(`${this.base}/polygons/${id}`);
  }

  // TODO remaining note endpoints, types
  getNotes(): Observable<Array<PolygonNote>> {
    return this.http.get<Array<PolygonNote>>(`${this.base}/notes`);
  }

  getNote(id: string): Observable<PolygonNote> {
    return this.http.get<PolygonNote>(`${this.base}/notes/${id}`);
  }

  createNote(polygonId: number, content: string) {
    return this.http.post(`${this.base}/notes`, {
      polygonId,
      content
    });
  }

  updateNote(id: string, content: string) {
    return this.http.put(`${this.base}/notes/${id}`, { content });
  }

  getClusterStatus() {
    return this.http.get<any>(`${this.base}/admin/status`);
  }

  scaleCluster(desiredCount: number) {
    return this.http.post(`${this.base}/admin/scale`, { desiredCount });
  }

  redeployCluster() {
    return this.http.post(`${this.base}/admin/redeploy`, {});
  }

  getUsers() {
    return this.http.get<User[]>(this.baseUsers);
  }

  getUser(id: number) {
    return this.http.get<User>(`${this.baseUsers}/${id}`);
  }

  createUser(userData: { email: string; password: string; roles: UserRole[] }) {
    return this.http.post<{ id: number }>(this.baseUsers, userData);
  }

  updateUserRoles(userId: number, roles: UserRole[]) {
    return this.http.put<User>(`${this.baseUsers}/${userId}/roles`, { roles });
  }

  updatePassword(userId: number, password: string) {
    return this.http.put(`${this.baseUsers}/${userId}/password`, { password });
  }

  deleteUser(userId: number) {
    return this.http.delete(`${this.baseUsers}/${userId}`);
  }

  userLogs({ page, limit }: { page: number; limit: number }) {
    return this.http.get<ListUserLogsResponse>(
      `${this.baseUsers}/utils/log?page=${page}&limit=${limit}`
    );
  }

  // ## Jobs System ##

  createJob(type: string, payload: Record<string, any>): Observable<CreateJobResponse> {
    return this.http.post<CreateJobResponse>(`${this.base}/jobs`, {
      type,
      inputPayload: payload
    });
  }

  getJob(jobId: JobId): Observable<JobDetailsResponse> {
    return this.http.get<JobDetailsResponse>(`${this.base}/jobs/${jobId}`);
  }

  downloadJobResults(jobId: JobId, expirySeconds?: number): Observable<DownloadResponse> {
    return this.http.get<DownloadResponse>(`${this.base}/jobs/${jobId}/download`, {
      params: expirySeconds !== undefined ? { expirySeconds } : undefined
    });
  }

  // TODO API supports status filter
  listJobs(): Observable<ListJobsResponse> {
    return this.http.get<ListJobsResponse>(`${this.base}/jobs`);
  }

  // ## Jobs System: high-level API ##

  /**
   * Create a job and poll its details every period. Returns 3 observables to track the job
   * creation, job details, and status.
   * @param jobType job type
   * @param payload job type's payload
   * @param period how often to request job status in milliseconds (default 2 seconds)
   * @returns StartedJob with observables to track creation, job details, and status.
   */
  startJob(jobType: JobType, payload: Record<string, any>, period = 2_000): StartedJob {
    const createJob$ = this.createJob(jobType, payload).pipe(shareReplay(1));
    const status$ = new BehaviorSubject<ExtendedJobStatus>('CREATING');

    const jobDetails$ = createJob$.pipe(
      retryHTTPErrors(3),
      switchMap(createJobResp => {
        const jobId = createJobResp.jobId;
        status$.next('PENDING');
        return interval(period).pipe(
          // Future: if client is tracking many jobs, it would be more efficient to
          // share the query/request for all of them (i.e. switchMap to shared observable),
          // but this is simplest for now.
          switchMap(() => this.getJob(jobId).pipe(retryHTTPErrors(3))),
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
          finalize(() => {
            status$.complete();
          }),
          shareReplay(1)
        );
      })
    );

    return { createJob$, jobDetails$, status$ };
  }
}
