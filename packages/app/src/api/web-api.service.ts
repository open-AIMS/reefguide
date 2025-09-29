import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { JobType, Polygon, PolygonNote, User, UserRole } from '@reefguide/db';
import {
  AddGroupManagersInput,
  AddGroupManagersResponse,
  AddGroupMembersInput,
  AddGroupMembersResponse,
  CreateGroupInput,
  CreateGroupResponse,
  CreateJobResponse,
  CreateProjectInput,
  CreateProjectResponse,
  CriteriaRangeOutput,
  DeleteGroupResponse,
  DeleteProjectResponse,
  DownloadResponse,
  GetGroupResponse,
  GetGroupsResponse,
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
  TransferGroupOwnershipInput,
  TransferGroupOwnershipResponse,
  UpdateGroupInput,
  UpdateGroupResponse,
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
import Style, { StyleFunction } from 'ol/style/Style';
import { Fill, Stroke } from 'ol/style';
import { gbrmpZoneStyleFunction } from './styling-helpers';

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
        id: 'ssr_sentinel_2018',
        title: 'SSR Sentinel 2018',
        infoUrl:
          'https://tiles-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/SSR_Sentinel_2018/MapServer',
        url: 'https://tiles-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/SSR_Sentinel_2018/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
        urlType: 'WMTSCapabilitiesXml',
        layerOptions: {
          visible: false
        }
      },
      {
        id: 'GBRMPA_Zoning',
        title: 'GBRMPA Zoning',
        // NAME exists, specific id like P-16-15, but TYPE more friendly text
        labelProp: 'TYPE',
        layerId: '53',
        infoUrl:
          'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Zoning_20/FeatureServer/',
        url: 'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Zoning_20/FeatureServer/',
        urlType: 'ArcGisFeatureServer',
        layerOptions: {
          visible: false,
          opacity: 0.5,
          style: gbrmpZoneStyleFunction
        }
      },
      {
        id: 'canonical_reefs',
        title: 'RRAP Canonical Reefs',
        layerPrefix: 'Reef: ',
        labelProp: 'reef_name',
        infoUrl:
          'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/RRAP_Canonical_Reefs/FeatureServer',
        url: 'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/RRAP_Canonical_Reefs/FeatureServer',
        urlType: 'ArcGisFeatureServer',
        layerOptions: {
          visible: true,
          opacity: 0.8,
          style: {
            'fill-color': 'rgba(35,96,165,0.01)',
            'stroke-color': 'rgba(35,96,165,0.6)',
            'stroke-line-dash': [4, 6],
            'stroke-width': 0,
            'text-value': ['get', 'reef_name']
          }
        }
      },

      // can zoom in approx to scale 36100, 134MB
      // {
      //   id: 'hybrid_benthic_2',
      //   title: 'Hybrid Benthic',
      //   infoUrl:
      //     'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/ExportTilecache/MapServer',
      //   url: 'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/ExportTilecache/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
      //   urlType: 'WMTSCapabilitiesXml'
      // },
      // can zoom in approx to scale 18055, 443MB
      {
        id: 'hybrid_benthic',
        title: 'Hybrid Benthic',
        infoUrl:
          'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/hybrid_benthic/MapServer',
        url: 'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/hybrid_benthic/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
        urlType: 'WMTSCapabilitiesXml',
        layerOptions: {
          opacity: 0.8,
          visible: false
        }
      },
      {
        id: 'ecorrap_site_locations',
        title: 'EcoRRAP Site Locations',
        layerPrefix: 'EcoRRAP Site: ',
        labelProp: 'Name',
        infoUrl:
          'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/EcoRRAP_Site_Locations/FeatureServer',
        url: 'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/EcoRRAP_Site_Locations/FeatureServer',
        urlType: 'ArcGisFeatureServer',
        cluster: true
      },
      // QPWS Moorings -
      // https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer/20
      {
        id: 'parks_marine_moorings',
        title: 'QPWS Moorings',
        layerPrefix: 'QPWS Mooring: ',
        labelProp: 'site_and_mooring_reference_numb',
        infoUrl:
          'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer',
        url: 'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer',
        urlType: 'ArcGisFeatureServer',
        layerOptions: {
          visible: false
        },
        // This is the layer to target - notice stripped from URL above
        layerId: '20',
        // Clustering enabled
        cluster: true
      },
      // QPWS Protection Markers -
      // https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer/10
      {
        id: 'parks_protection_markers',
        title: 'GPWS Reef Protection Markers',
        layerPrefix: 'QPWS Protection Markers: ',
        labelProp: 'site_rpm_label',
        infoUrl:
          'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer',
        url: 'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer',
        urlType: 'ArcGisFeatureServer',
        layerOptions: {
          visible: false
        },
        // This is the layer to target - notice stripped from URL above
        layerId: '10',
        // Clustering enabled
        cluster: true
      },
      {
        id: 'gbrmpa_management_regions',
        title: 'GBRMPA Management Regions',
        layerPrefix: 'Management Region: ',
        labelProp: 'AREA_DESCR',
        layerId: '59',
        infoUrl:
          'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Management_Areas_20/FeatureServer',
        url: 'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Management_Areas_20/FeatureServer',
        urlType: 'ArcGisFeatureServer',
        layerOptions: {
          visible: false,
          opacity: 0.8,
          style: {
            'fill-color': 'rgba(24, 113, 214, 0.04)',
            'stroke-color': 'rgba(0, 255, 4, 0.34)',
            'stroke-line-dash': [4, 6],
            'stroke-width': 5,
            'text-value': ['get', 'AREA_DESCR']
          }
        }
      },

      {
        id: 'cruiseship_transit_lanes',
        title: 'GBRMPA Cruise Ship Transit Lanes',
        layerPrefix: 'Cruiseship Lanes: ',
        labelProp: 'AREA_DESCR',
        layerId: '61',
        infoUrl:
          'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Cruise_Ship_Transit_Lanes_20/FeatureServer',
        url: 'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Cruise_Ship_Transit_Lanes_20/FeatureServer',
        urlType: 'ArcGisFeatureServer',
        layerOptions: {
          visible: false,
          opacity: 0.8,
          style: {
            'fill-color': 'rgba(30, 30, 235, 0.15)',
            'stroke-color': 'rgba(13, 13, 239, 0.45)',
            'stroke-line-dash': [4, 6],
            'stroke-width': 3,
            'text-value': ['concat', 'Cruiseship Transit Lane: ', ['get', 'AREA_DESCR']]
          }
        }
      },
      {
        id: 'maritime_safety_port_limits',
        title: 'Maritime Safety Port Limits',
        layerPrefix: 'Port Limits: ',
        labelProp: 'NAME',
        layerId: '0',
        infoUrl:
          'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Maritime_Safety_Port_Limits/FeatureServer/',
        url: 'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Maritime_Safety_Port_Limits/FeatureServer/',
        urlType: 'ArcGisFeatureServer',
        layerOptions: {
          visible: false,
          opacity: 0.8,
          style: {
            'fill-color': 'rgba(238, 12, 140, 0.15)',
            'stroke-color': 'rgba(229, 14, 136, 0.88)',
            'stroke-line-dash': [4, 6],
            'stroke-width': 2,
            'text-value': ['get', 'NAME']
          }
        }
      },
      {
        id: 'tumra_agreement',
        title: 'Traditional Use of Marine Resources Agreement',
        layerPrefix: 'TUMRA: ',
        labelProp: 'NAME',
        layerId: '55',
        infoUrl:
          'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Traditional_Use_of_Marine_Resources_TUMRA_20/FeatureServer',
        url: 'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Traditional_Use_of_Marine_Resources_TUMRA_20/FeatureServer',
        urlType: 'ArcGisFeatureServer',
        layerOptions: {
          visible: false,
          opacity: 0.8,
          style: {
            'fill-color': 'rgba(235, 154, 33, 0.17)',
            'stroke-color': 'rgba(244, 149, 7, 0.57)',
            'stroke-line-dash': [4, 6],
            'stroke-width': 3,
            'text-value': ['get', 'NAME']
          }
        }
      },
      {
        id: 'designated_shipping_areas',
        title: 'Designated Shipping Areas',
        layerPrefix: 'Shipping Area: ',
        labelProp: 'NAME',
        layerId: '74',
        infoUrl:
          'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Designated_Shipping_Areas_201/FeatureServer',
        url: 'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Designated_Shipping_Areas_201/FeatureServer',
        urlType: 'ArcGisFeatureServer',
        layerOptions: {
          visible: false,
          opacity: 0.8,
          style: function (feature, resolution) {
            if (feature.get('OBJECTID') == 1) {
              return new Style({
                fill: new Fill({
                  color: 'rgba(149, 246, 22, 0.14)'
                }),
                stroke: new Stroke({
                  color: 'rgba(129, 209, 16, 0.28)',
                  lineDash: [4, 6],
                  width: 2
                })
              });
            } else {
              return new Style({
                fill: new Fill({
                  color: 'rgba(255, 94, 0, 0.2)'
                }),
                stroke: new Stroke({
                  color: 'rgba(255, 4, 0, 0.48)',
                  lineDash: [4, 6],
                  width: 2
                })
              });
            }
          } satisfies StyleFunction
        }
      }
    ];
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

  // Reset actions (don't require auth)
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
    return this.http.get<GetGroupsResponse>(`${this.base}/groups/user/me`);
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
}
