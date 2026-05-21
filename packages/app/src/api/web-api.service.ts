import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { JobType, User, UserRole } from '@reefguide/db';
import {
  AddGroupManagersInput,
  AddGroupManagersResponse,
  AddGroupMembersInput,
  AddGroupMembersResponse,
  CreateGroupInput,
  CreateGroupResponse,
  CreateJobResponse,
  CreateNoteInput,
  CreateNoteResponse,
  CreatePolygonInput,
  CreatePolygonResponse,
  CreateProjectInput,
  CreateProjectResponse,
  CriteriaRangeOutput,
  DeleteGroupResponse,
  DeleteNoteResponse,
  DeletePolygonResponse,
  DeleteProjectResponse,
  DownloadResponse,
  GetGroupResponse,
  GetGroupsResponse,
  GetMapLayersResponse,
  GetNoteResponse,
  GetNotesResponse,
  GetPolygonResponse,
  GetPolygonsQuery,
  GetPolygonsResponse,
  GetProjectResponse,
  GetProjectsResponse,
  JobDetailsResponse,
  LayerDef,
  ListJobsQuery,
  ListJobsResponse,
  ListMyJobsQuery,
  ListRegionsResponse,
  ListUserLogsResponse,
  LoginResponse,
  PostCreateResetRequest,
  PostCreateResetResponse,
  PostUseResetCodeRequest,
  PostUseResetCodeResponse,
  ProfileResponse,
  RemoveGroupManagersInput,
  RemoveGroupManagersResponse,
  RemoveGroupMembersInput,
  RemoveGroupMembersResponse,
  SearchUsersResponse,
  SetProjectPublicityInput,
  SetProjectPublicityResponse,
  ShareProjectWithGroupsResponse,
  ShareProjectWithUsersResponse,
  TransferGroupOwnershipInput,
  TransferGroupOwnershipResponse,
  UnshareProjectWithGroupsResponse,
  UnshareProjectWithUsersResponse,
  UpdateGroupInput,
  UpdateGroupResponse,
  UpdateNoteInput,
  UpdateNoteResponse,
  UpdatePolygonInput,
  UpdatePolygonResponse,
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

  // ## Polygons ##

  /**
   * Get all polygons for the current user (or all if admin)
   */
  getPolygons({ projectId }: { projectId?: number }): Observable<GetPolygonsResponse> {
    return this.http.get<GetPolygonsResponse>(`${this.base}/polygons`, {
      // Include projectId param if provided
      params: { ...(projectId ? { projectId } : {}) }
    });
  }

  /**
   * Download the polygons in the specified file format.
   * @param params
   */
  getPolygonsFile(params?: {
    projectId?: number;
    format: GetPolygonsQuery['format'];
  }): Observable<Blob> {
    return this.http.get(`${this.base}/polygons`, {
      params: { ...params },
      responseType: 'blob'
    });
  }

  /**
   * Get a specific polygon by ID with full relations (user and notes)
   */
  getPolygon(id: number): Observable<GetPolygonResponse> {
    return this.http.get<GetPolygonResponse>(`${this.base}/polygons/${id}`);
  }

  /**
   * Create a new polygon with GeoJSON data
   */
  createPolygon(polygonData: CreatePolygonInput): Observable<CreatePolygonResponse> {
    return this.http.post<CreatePolygonResponse>(`${this.base}/polygons`, polygonData);
  }

  /**
   * Update an existing polygon
   */
  updatePolygon(id: number, polygonData: UpdatePolygonInput): Observable<UpdatePolygonResponse> {
    return this.http.put<UpdatePolygonResponse>(`${this.base}/polygons/${id}`, polygonData);
  }

  /**
   * Delete a polygon by ID
   */
  deletePolygon(id: number): Observable<DeletePolygonResponse> {
    return this.http.delete<DeletePolygonResponse>(`${this.base}/polygons/${id}`);
  }

  // ## Notes ##

  /**
   * Get all notes for the current user (or all if admin)
   */
  getNotes(): Observable<GetNotesResponse> {
    return this.http.get<GetNotesResponse>(`${this.base}/notes`);
  }

  /**
   * Get all notes for a specific polygon
   */
  getPolygonNotes(polygonId: number): Observable<GetNotesResponse> {
    return this.http.get<GetNotesResponse>(`${this.base}/notes/polygon/${polygonId}`);
  }

  /**
   * Get a specific note by ID with full relations (user and polygon)
   */
  getNote(id: number): Observable<GetNoteResponse> {
    return this.http.get<GetNoteResponse>(`${this.base}/notes/${id}`);
  }

  /**
   * Create a new note for a polygon
   */
  createNote(noteData: CreateNoteInput): Observable<CreateNoteResponse> {
    return this.http.post<CreateNoteResponse>(`${this.base}/notes`, noteData);
  }

  /**
   * Update an existing note
   */
  updateNote(id: number, noteData: UpdateNoteInput): Observable<UpdateNoteResponse> {
    return this.http.put<UpdateNoteResponse>(`${this.base}/notes/${id}`, noteData);
  }

  /**
   * Delete a note by ID
   */
  deleteNote(id: number): Observable<DeleteNoteResponse> {
    return this.http.delete<DeleteNoteResponse>(`${this.base}/notes/${id}`);
  }

  // ## Admin ##

  getClusterStatus() {
    return this.http.get<any>(`${this.base}/admin/status`);
  }

  scaleCluster(desiredCount: number) {
    return this.http.post(`${this.base}/admin/scale`, { desiredCount });
  }

  redeployCluster() {
    return this.http.post(`${this.base}/admin/redeploy`, {});
  }

  // ## Users ##

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
   * Get all map layers the user is allowed to display.
   * Sorted by zIndex ascending.
   */
  getMapLayers(): Observable<GetMapLayersResponse> {
    return this.http.get<GetMapLayersResponse>(`${this.base}/map-layers`);
  }

  // TODO migrate to database
  getPDPLayers(): Array<LayerDef> {
    const layers: Array<any> = [
      {
        id: 'pdp_reefscan_surveys',
        title: 'PDP ReefScan Surveys',
        url: '/reefscan-surveys/pdp_dgs_23Apr2026.geojson',
        urlType: 'File_GeoJSON',
        layerOptions: {
          visible: false
        }
      }
    ];

    const a = 0.8;

    const levels: Array<{
      name: string;
      fillColor: string;
      strokeColor: string;
    }> = [
      {
        name: 'L1 - Desktop',
        fillColor: `rgba(178, 178, 178, ${a})`,
        strokeColor: 'rgba(100, 100, 100, 0.9)'
      },
      {
        name: 'L2 - Heuristics',
        fillColor: `rgba(255, 230, 100, ${a})`,
        strokeColor: 'rgba(200, 160, 0, 0.9)'
      },
      {
        name: 'L3 - Site Bank',
        fillColor: `rgba(100, 200, 255, ${a})`,
        strokeColor: 'rgba(0, 120, 200, 0.9)'
      },
      {
        name: 'L4 - Deployments',
        fillColor: `rgba(100, 220, 100, ${a})`,
        strokeColor: 'rgba(0, 150, 0, 0.9)'
      },
      {
        name: 'L5 - Monitoring',
        fillColor: `rgba(255, 100, 100, ${a})`,
        strokeColor: 'rgba(200, 0, 0, 0.9)'
      }
    ];

    for (const level of levels) {
      layers.push({
        id: `SiteLevelsPDP_${level.name}`,
        title: `PDP Site ${level.name}`,
        // Note: Angular page does not cause error. OpenLayers bug?
        url: `/site-levels-pdp/SiteLevelsPDP_29Apr2026_${level.name}.geojson`,
        urlType: 'File_GeoJSON',
        layerOptions: {
          style: {
            // for point data, need to use circle-*
            // fill-* is for polygons
            'circle-fill-color': level.fillColor,
            'circle-radius': 5,
            'stroke-color': level.strokeColor,
            'stroke-width': 2
          }
        }
      });
    }

    return layers;
  }

  getRegions(): Observable<ListRegionsResponse> {
    return this.http.get<ListRegionsResponse>(`${this.base}/admin/regions`);
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

  // ## Projects ##

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

  // ## Password Reset ##

  requestPasswordReset(payload: PostCreateResetRequest): Observable<PostCreateResetResponse> {
    return this.http.post<PostCreateResetResponse>(`${this.base}/password-reset/request`, payload);
  }

  confirmPasswordReset(payload: PostUseResetCodeRequest): Observable<PostUseResetCodeResponse> {
    return this.http.post<PostUseResetCodeResponse>(`${this.base}/password-reset/confirm`, payload);
  }

  // ## Groups System ##

  /**
   * Get all groups the current user has access to
   */
  getGroups(query?: {
    name?: string;
    limit?: number;
    offset?: number;
  }): Observable<GetGroupsResponse> {
    return this.http.get<GetGroupsResponse>(`${this.base}/groups`, {
      params: query as any
    });
  }

  /**
   * Get a specific group by ID
   */
  getGroup(id: number): Observable<GetGroupResponse> {
    return this.http.get<GetGroupResponse>(`${this.base}/groups/${id}`);
  }

  /**
   * Create a new group
   */
  createGroup(groupData: CreateGroupInput): Observable<CreateGroupResponse> {
    return this.http.post<CreateGroupResponse>(`${this.base}/groups`, groupData);
  }

  /**
   * Update an existing group
   */
  updateGroup(id: number, groupData: UpdateGroupInput): Observable<UpdateGroupResponse> {
    return this.http.put<UpdateGroupResponse>(`${this.base}/groups/${id}`, groupData);
  }

  /**
   * Delete a group
   */
  deleteGroup(id: number): Observable<DeleteGroupResponse> {
    return this.http.delete<DeleteGroupResponse>(`${this.base}/groups/${id}`);
  }

  /**
   * Get groups the current user is part of (owned, managed, or member)
   */
  getUserGroups(): Observable<GetGroupsResponse> {
    return this.http.get<GetGroupsResponse>(`${this.base}/groups`);
  }

  /**
   * Add members to a group
   */
  addGroupMembers(
    groupId: number,
    memberData: AddGroupMembersInput
  ): Observable<AddGroupMembersResponse> {
    return this.http.post<AddGroupMembersResponse>(
      `${this.base}/groups/${groupId}/members`,
      memberData
    );
  }

  /**
   * Remove members from a group
   */
  removeGroupMembers(
    groupId: number,
    memberData: RemoveGroupMembersInput
  ): Observable<RemoveGroupMembersResponse> {
    return this.http.delete<RemoveGroupMembersResponse>(`${this.base}/groups/${groupId}/members`, {
      body: memberData
    });
  }

  /**
   * Add managers to a group
   */
  addGroupManagers(
    groupId: number,
    managerData: AddGroupManagersInput
  ): Observable<AddGroupManagersResponse> {
    return this.http.post<AddGroupManagersResponse>(
      `${this.base}/groups/${groupId}/managers`,
      managerData
    );
  }

  /**
   * Remove managers from a group
   */
  removeGroupManagers(
    groupId: number,
    managerData: RemoveGroupManagersInput
  ): Observable<RemoveGroupManagersResponse> {
    return this.http.delete<RemoveGroupManagersResponse>(
      `${this.base}/groups/${groupId}/managers`,
      {
        body: managerData
      }
    );
  }

  /**
   * Transfer group ownership to another user
   */
  transferGroupOwnership(
    groupId: number,
    transferData: TransferGroupOwnershipInput
  ): Observable<TransferGroupOwnershipResponse> {
    return this.http.post<TransferGroupOwnershipResponse>(
      `${this.base}/groups/${groupId}/transfer-ownership`,
      transferData
    );
  }

  /**
   * Search users by email (for adding to groups)
   */
  searchUsers(query: string, limit?: number): Observable<SearchUsersResponse> {
    return this.http.get<SearchUsersResponse>(`${this.baseUsers}/search`, {
      params: {
        q: query,
        ...(limit !== undefined ? { limit: limit.toString() } : {})
      }
    });
  }

  // ## Project Sharing ##

  /**
   * Set project publicity (public or private)
   */
  setProjectPublic(
    id: number,
    input: SetProjectPublicityInput
  ): Observable<SetProjectPublicityResponse> {
    return this.http.put<SetProjectPublicityResponse>(
      `${this.base}/projects/${id}/publicity`,
      input
    );
  }

  /**
   * Share project with users
   */
  shareProjectWithUsers(
    projectId: number,
    body: { userIds: number[] }
  ): Observable<ShareProjectWithUsersResponse> {
    return this.http.post<ShareProjectWithUsersResponse>(
      `${this.base}/projects/${projectId}/share/users`,
      body
    );
  }

  /**
   * Remove project sharing with users
   */
  unshareProjectWithUsers(
    projectId: number,
    body: { userIds: number[] }
  ): Observable<UnshareProjectWithUsersResponse> {
    return this.http.delete<UnshareProjectWithUsersResponse>(
      `${this.base}/projects/${projectId}/share/users`,
      { body }
    );
  }

  /**
   * Share project with groups
   */
  shareProjectWithGroups(
    projectId: number,
    body: { groupIds: number[] }
  ): Observable<ShareProjectWithGroupsResponse> {
    return this.http.post<ShareProjectWithGroupsResponse>(
      `${this.base}/projects/${projectId}/share/groups`,
      body
    );
  }

  /**
   * Remove project sharing with groups
   */
  unshareProjectWithGroups(
    projectId: number,
    body: { groupIds: number[] }
  ): Observable<UnshareProjectWithGroupsResponse> {
    return this.http.delete<UnshareProjectWithGroupsResponse>(
      `${this.base}/projects/${projectId}/share/groups`,
      { body }
    );
  }
}
