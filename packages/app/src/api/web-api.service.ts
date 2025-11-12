import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { JobType, User, UserRole } from '@reefguide/db';
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
import Style, { StyleFunction } from 'ol/style/Style';
import { Fill, Stroke } from 'ol/style';
import { getGeomorphicZonationColorPaletteStyle } from '../app/map/openlayers-hardcoded';

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
    /*
    Layer definitions could come from the API/database in the future, so should avoid
    anything that can't be encoded in JSON (e.g. functions)
     */
    return [
      {
        id: 'world_imagery_basemap',
        title: 'Base map (Esri World Imagery Firefly)',
        infoUrl: 'https://www.esri.com/',
        url: 'https://fly.maptiles.arcgis.com/arcgis/rest/services/World_Imagery_Firefly/MapServer/tile/{z}/{y}/{x}',
        urlType: 'XYZ',
        attributions:
          'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      },
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
        id: 'cities',
        title: 'Cities',
        url: 'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/Cities/FeatureServer/',
        urlType: 'ArcGisFeatureServer',
        layerId: '0',
        labelProp: 'name',
        infoUrl:
          'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/Cities/FeatureServer/',
        layerOptions: {
          style: {
            'text-value': ['get', 'name'],
            'text-font': '14px Roboto',
            'text-fill-color': '#ffffff',
            'text-stroke-color': '#000000',
            'text-stroke-width': 2
          }
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
          opacity: 0.5
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
        id: 'hybrid_geomorphic',
        title: 'Hybrid Geomorphic',
        url: [
          'https://tiledimageservices3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/rgFarNorthern_hybrid_geomorphichyb/ImageServer',
          'https://tiledimageservices3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/rgCairns_Cooktown_hybrid_geomorphichyb/ImageServer',
          'https://tiledimageservices3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/rgTownsville_Whitsunday_hybrid_geomorphichyb/ImageServer',
          'https://tiledimageservices3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/rgMackay_Capricorn_hybrid_geomorphichyb/ImageServer'
        ],
        urlType: 'ArcGisImageServer',
        layerOptions: {
          visible: false,
          style: {
            color: getGeomorphicZonationColorPaletteStyle()
          }
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
          minZoom: 8,
          opacity: 0.8,
          // only declutter with self
          declutter: 'reefs',
          // Note: nice_reef_name and significance are added in openlayers-hardcoded.ts
          style: {
            'fill-color': 'rgba(35,96,165,0.01)',
            'stroke-color': 'rgba(70,150,255,0.9)',
            'stroke-line-dash': [4, 6],
            'stroke-width': 1,
            'text-value': [
              'match',
              ['get', 'significance'],
              // always show reef text for significant reefs
              1,
              ['get', 'nice_reef_name'],
              // default
              // show text when resolution < 75
              ['case', ['<', ['resolution'], 75], ['get', 'nice_reef_name'], '']
              // view resolution with: ['to-string', ['resolution']]
            ],
            'text-font': [
              'match',
              ['get', 'significance'],
              // larger text for more significant reefs
              1,
              '12px Verdana, sans-serif',
              // default (i.e. unnamed reefs)
              '10px Verdana, sans-serif'
            ],
            'text-fill-color': '#ffffff',
            'text-stroke-color': '#000000',
            'text-stroke-width': 2,
            // required otherwise text does not show until zoom far in
            'text-overflow': true,
            // reduce how many labels are shown when crowded by setting padding
            'text-padding': [4, 2, 4, 2] // top, right, bottom, left
          }
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
          // TODO should convert to JSON or hardcoded style
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
