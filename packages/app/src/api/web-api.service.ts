import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { JobType, Polygon, PolygonNote, User, UserRole } from '@reefguide/db';
import {
  CreateJobResponse,
  CreateProjectInput,
  CreateProjectResponse,
  CriteriaRangeOutput,
  DeleteProjectResponse,
  DownloadResponse,
  GetProjectResponse,
  GetProjectsResponse,
  JobDetailsResponse,
  LayerDef,
  ListJobsQuery,
  ListJobsResponse,
  ListMyJobsQuery,
  ListUserLogsResponse,
  LoginResponse,
  ProfileResponse,
  UpdateProjectInput,
  UpdateProjectResponse
} from '@reefguide/types';
import {
  distinctUntilKeyChanged,
  interval,
  map,
  Observable,
  switchMap,
  takeWhile,
  tap
} from 'rxjs';
import { environment } from '../environments/environment';
import { retryHTTPErrors } from '../util/http-util';

type JobId = CreateJobResponse['jobId'];

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

  cancelJob(jobId: JobId): Observable<JobDetailsResponse> {
    return this.http.post<JobDetailsResponse>(`${this.base}/jobs/${jobId}/cancel`, null);
  }

  getJob(jobId: JobId): Observable<JobDetailsResponse> {
    return this.http.get<JobDetailsResponse>(`${this.base}/jobs/${jobId}`);
  }

  downloadJobResults(
    jobId: JobId,
    expirySeconds?: number,
    filterPrefix?: string
  ): Observable<DownloadResponse> {
    return this.http.get<DownloadResponse>(`${this.base}/jobs/${jobId}/download`, {
      params: {
        ...(expirySeconds !== undefined ? { expirySeconds } : undefined),
        ...(filterPrefix !== undefined ? { filterPrefix } : undefined)
      }
    });
  }

  listAllJobs(query?: ListJobsQuery): Observable<ListJobsResponse> {
    return this.http.get<ListJobsResponse>(`${this.base}/jobs`, {
      params: query
    });
  }

  listMyJobs(query?: ListMyJobsQuery): Observable<ListJobsResponse> {
    return this.http.get<ListJobsResponse>(`${this.base}/jobs/mine`, {
      params: query
    });
  }

  /**
   * Get criteria visualization layer definitions.
   * TODO return from API instead of hardcoding in app code.
   */
  getCriteriaLayers(): LayerDef[] {
    return [
      {
        id: 'Depth',
        title: 'Depth',
        infoUrl:
          'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_bathymetry/MapServer',
        url: 'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_bathymetry/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
        urlType: 'WMTSCapabilitiesXml',
        reverseRange: true
      },
      {
        id: 'Slope',
        title: 'Slope',
        infoUrl:
          'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_slope_data/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
        url: 'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_slope_data/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
        urlType: 'WMTSCapabilitiesXml'
      },
      {
        id: 'WavesHs',
        title: 'WavesHs',
        infoUrl:
          'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_wave_Hs_data/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
        url: 'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_wave_Hs_data/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
        urlType: 'WMTSCapabilitiesXml'
      },
      {
        id: 'WavesTp',
        title: 'WavesTp',
        infoUrl:
          'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_waves_Tp/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
        url: 'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_waves_Tp/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
        urlType: 'WMTSCapabilitiesXml'
      }
    ];
  }

  /**
   * Get informational layers
   */
  getInfoLayers(): Array<LayerDef> {
    return [
      {
        id: 'canonical_reefs',
        title: 'RRAP Canonical Reefs',
        url: 'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/RRAP_Canonical_Reefs/FeatureServer',
        urlType: 'ArcGisFeatureServer'
      },
      {
        id: 'ecorrap_site_locations',
        title: 'EcoRRAP Site Locations',
        url: 'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/EcoRRAP_Site_Locations/FeatureServer',
        urlType: 'ArcGisFeatureServer'
      }
      // FIXME ImageServer not working
      // {
      //   id: 'ccgeo',
      //   title: 'CC Geo',
      //   url: 'https://tiledimageservices3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/rgCairns_Cooktown_hybrid_geomorphichyb/ImageServer',
      //   urlType: 'TileArcGISRest'
      // },
      // {
      //   id: 'twbenth',
      //   title: 'TSV Whit Benthic',
      //   url: 'https://tiledimageservices3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/rgTownsville_Whitsunday_hybrid_benthichyb/ImageServer',
      //   urlType: 'TileArcGISRest'
      // }
    ];
  }

  getRegionCriteria(region: string): Observable<CriteriaRangeOutput> {
    return this.http.get<CriteriaRangeOutput>(`${this.base}/admin/criteria/${region}/ranges`);
  }

  /**
   * DEPRECATED
   * ==========
   *
   * This was removed as jobs were moved to the job manager, however it didn't
   * expose a simple equivalent interface for launching and monitoring a single
   * job with polling. We should merge these capabilities - but copying back
   * here for now.
   *
   * Create a job and return Observable that emits job details when status
   * changes. Completes when status changes from pending/in-progress.
   * @param jobType job type
   * @param payload job type's payload
   * @param period how often to request job status in milliseconds (default 2
   * seconds)
   * @returns Observable of job details job sub property
   */
  startJob(
    jobType: JobType,
    payload: Record<string, any>,
    period = 2_000
  ): Observable<JobDetailsResponse['job']> {
    return this.createJob(jobType, payload).pipe(
      retryHTTPErrors(3),
      switchMap(createJobResp => {
        const jobId = createJobResp.jobId;
        return interval(period).pipe(
          // Future: if client is tracking many jobs, it would be more efficient to
          // share the query/request for all of them (i.e. switchMap to shared observable),
          // but this is simplest for now.
          switchMap(() => this.getJob(jobId).pipe(retryHTTPErrors(3))),
          // discard extra wrapping object, which has no information.
          map(v => v.job),
          // only emit when job status changes.
          distinctUntilKeyChanged('status'),
          // complete observable when not pending/in-progress; emit the last value
          takeWhile(
            x => x.status === 'PENDING' || x.status === 'IN_PROGRESS',
            true // inclusive: emit the first value that fails the predicate
          ),
          // convert job error statuses to thrown errors.
          tap(job => {
            const s = job.status;
            if (s === 'FAILED' || s === 'CANCELLED' || s === 'TIMED_OUT') {
              throw new Error(`Job id=${job.id} ${s}`);
            }
            return job;
          })
        );
      })
    );
  }

  getProjects(query?: {
    type?: string;
    name?: string;
    limit?: number;
    offset?: number;
  }): Observable<GetProjectsResponse> {
    return this.http.get<GetProjectsResponse>(`${this.base}/projects`, {
      params: query as any
    });
  }

  getProject(id: number): Observable<GetProjectResponse> {
    return this.http.get<GetProjectResponse>(`${this.base}/projects/${id}`);
  }

  createProject(projectData: CreateProjectInput): Observable<CreateProjectResponse> {
    return this.http.post<CreateProjectResponse>(`${this.base}/projects`, projectData);
  }

  updateProject(id: number, projectData: UpdateProjectInput): Observable<UpdateProjectResponse> {
    return this.http.put<UpdateProjectResponse>(`${this.base}/projects/${id}`, projectData);
  }

  deleteProject(id: number): Observable<DeleteProjectResponse> {
    return this.http.delete<DeleteProjectResponse>(`${this.base}/projects/${id}`);
  }

  getUserProjects(): Observable<GetProjectsResponse> {
    return this.http.get<GetProjectsResponse>(`${this.base}/projects/user/me`);
  }
}
