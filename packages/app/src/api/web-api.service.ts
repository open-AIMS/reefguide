import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Polygon, PolygonNote, User, UserRole } from '@reefguide/db';
import {
  CreateJobResponse,
  DownloadResponse,
  JobDetailsResponse,
  ListJobsQuery,
  ListJobsResponse,
  ListUserLogsResponse,
  LoginResponse,
  ProfileResponse
} from '@reefguide/types';
import {
  map,
  Observable
} from 'rxjs';
import { environment } from '../environments/environment';

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

  getJob(jobId: JobId): Observable<JobDetailsResponse> {
    return this.http.get<JobDetailsResponse>(`${this.base}/jobs/${jobId}`);
  }

  downloadJobResults(jobId: JobId, expirySeconds?: number): Observable<DownloadResponse> {
    return this.http.get<DownloadResponse>(`${this.base}/jobs/${jobId}/download`, {
      params: expirySeconds !== undefined ? { expirySeconds } : undefined
    });
  }

  listJobs(query?: ListJobsQuery): Observable<ListJobsResponse> {
    return this.http.get<ListJobsResponse>(`${this.base}/jobs`, {
      params: query
    });
  }

}
