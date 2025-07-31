import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  InjectionToken,
  INJECTOR,
  runInInjectionContext,
  signal,
  Signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Map as OLMap } from 'ol';
import { JobType } from '@reefguide/db';
import {
  BehaviorSubject,
  filter,
  finalize,
  forkJoin,
  from,
  map,
  Observable,
  of,
  Subject,
  switchMap,
  takeUntil,
  tap,
  throttleTime
} from 'rxjs';
import { WebApiService } from '../../api/web-api.service';
import { environment } from '../../environments/environment';
import { getFirstFileFromResults } from '../../util/api-util';
import { urlToBlobObjectURL } from '../../util/http-util';
import { isDefined } from '../../util/js-util';
import { ReefGuideConfigService } from './reef-guide-config.service';
import {
  RegionDownloadResponse,
  RegionJobsManager
} from './selection-criteria/region-jobs-manager';
import { RegionalAssessmentInput, SuitabilityAssessmentInput } from '@reefguide/types';
import { JobsManagerService } from '../jobs/jobs-manager.service';
import { fromLonLat } from 'ol/proj';
import LayerGroup from 'ol/layer/Group';
import { GeoTIFF } from 'ol/source';
import TileLayer from 'ol/layer/WebGLTile';
import { openlayersRegisterEPSG7844 } from '../map/openlayers-config';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { GeoJSON } from 'ol/format';
import { Fill, Stroke, Style } from 'ol/style';
import { disposeLayerGroup, onLayerDispose } from '../map/openlayers-util';
import Layer from 'ol/layer/Layer';
import { createLayerFromDef } from '../../util/arcgis/arcgis-openlayer-util';
import { LayerController, LayerControllerOptions } from '../map/open-layers-model';
import { LayerProperties } from '../../types/layer.type';

/**
 * Map UI actions implemented by the overall app design.
 *
 * @see LocationSelectionComponent
 */
export interface MapUI {
  openLayerStyleEditor(layer: Layer): void;
}

export const MAP_UI = new InjectionToken<MapUI>('high-level map UI service');

/**
 * Region layer data that is ready to be loaded.
 */
export interface ReadyRegion {
  region: string;
  cogUrl: string;
  originalUrl: string;
}

/**
 * Reef Guide map context and layer management.
 * Higher-level abstraction over the map component.
 */
@Injectable()
export class ReefGuideMapService {
  readonly config = inject(ReefGuideConfigService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(INJECTOR);
  private readonly api = inject(WebApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly jobsManager = inject(JobsManagerService);

  // map is set shortly after construction
  private map!: OLMap;

  // TODO apply default style for assessed layer
  assessColor = [241, 192, 12, 1]; // ColorRGBA

  criteriaLayers: Record<string, LayerController | undefined> = {};

  /**
   * HTTP errors encounter by map layers.
   * TODO hookup OpenLayers error reporting
   */
  httpErrors: Subject<Error> = new Subject<Error>();

  /**
   * Progress on loading incremental map layers, i.e. tiles
   */
  progress$ = new BehaviorSubject<number>(1);

  private cancelAssess$ = new Subject<void>();

  /**
   * Site Suitability polygons are loading.
   *
   * TODO better map layer management and progress system.
   * This is too hardcoded, in the future will abstract this, but wait til OpenLayers.
   * region_assessment code is similar to site_suitability in purpose, but the code
   * differs wildly here. Patterns here need to be reviewed and redesigned properly.
   */
  siteSuitabilityLoading = signal(false);
  regionAssessmentLoading = signal(false);

  /**
   * Site Suitability job regions that are currently running.
   */
  private activeSiteSuitabilityRegions = new Set<string>();

  private readonly pendingRequests = new Set<string>();
  private pendingHighPoint: number = 0;

  // criteria data layers
  private readonly criteriaLayerGroup = signal<LayerGroup | undefined>(undefined);

  // region assessment raster layers. COG vs Tile depends on app config.
  private readonly cogAssessRegionsLayerGroup = signal<LayerGroup | undefined>(undefined);

  // suitable sites polygons group layer
  private readonly siteSuitabilityLayerGroup = signal<LayerGroup | undefined>(undefined);

  private layerControllers = new Map<Layer, LayerController>();

  // whether to show the clear layers button
  showClear = computed(() => {
    return this.cogAssessRegionsLayerGroup() !== undefined;
  });

  /**
   * Layers the user may style
   */
  styledLayers: Signal<Array<LayerGroup>> = computed(() => {
    return [
      this.cogAssessRegionsLayerGroup(),
      this.criteriaLayerGroup(),
      this.siteSuitabilityLayerGroup()
    ].filter(isDefined);
  });

  constructor() {
    this.setupOpenLayers();
    this.setupRequestInterceptor();

    this.httpErrors
      .pipe(throttleTime(2_000), takeUntilDestroyed(this.destroyRef))
      .subscribe(err => {
        // TODO openlayers error handling
        // const status = err.details.httpStatus;
        // err.details.url
        // this.snackbar.open(`Map layer error (HTTP ${status})`, 'OK');
      });
  }

  private setupOpenLayers() {
    // region assessment COGs are 7844
    openlayersRegisterEPSG7844();
  }

  private setupRequestInterceptor() {
    const apiUrl = environment.reefGuideApiUrl;

    /*
    ArcGIS map seems to have its own queue and do 10 tile requests at a time by default.
    This makes the progress appear to be doing nothing even though tiles are being loaded.
    Ideally would get the total pending tiles from ArcGIS SDK.
     */
    const onRequestDone = (url: string) => {
      this.pendingRequests.delete(url);
      if (this.pendingRequests.size === 0) {
        // finished, reset
        this.pendingHighPoint = 0;
        this.progress$.next(1); // 100%
      } else {
        this.progress$.next(
          (this.pendingHighPoint - this.pendingRequests.size) / this.pendingHighPoint
        );
      }
    };
  }

  /**
   * Map provided by ReefGuideMapComponent
   * @param map
   */
  setMap(map: OLMap) {
    this.map = map;

    this.addInfoLayers();
    void this.addCriteriaLayers();
  }

  /**
   * Reset to default home view with animation.
   */
  goHome() {
    this.map.getView().animate({
      center: fromLonLat([146.1979986145376, -16.865253472483754]),
      zoom: 10
    });
  }

  /**
   * Start region jobs and add layers using the job results.
   * @param jobType
   * @param payload
   */
  addJobLayers(jobType: JobType, payload: RegionalAssessmentInput): RegionJobsManager {
    console.log('addJobLayers', payload);

    // TODO cleanup old multi-region code
    const regions$ = of(payload.region);

    const jobManager = runInInjectionContext(
      this.injector,
      () => new RegionJobsManager(jobType, payload, regions$)
    );

    const layerGroup = this.setupCOGAssessRegionsLayerGroup();

    jobManager.regionError$.subscribe(region => this.handleRegionError(region));

    this.regionAssessmentLoading.set(true);
    jobManager.jobResultsDownload$
      .pipe(
        // unsubscribe when this component is destroyed
        takeUntilDestroyed(this.destroyRef),
        takeUntil(this.cancelAssess$),
        switchMap(results => this.jobResultsToReadyRegion(results))
      )
      .subscribe({
        next: readyRegion => {
          this.addRegionLayer(readyRegion, layerGroup);
        },
        complete: () => {
          this.regionAssessmentLoading.set(false);
        },
        error: err => {
          console.error(err);
          this.regionAssessmentLoading.set(false);
          if (err instanceof Error) {
            this.snackbar.open(`Regional Assessment ${err.message}`, 'OK');
          } else {
            this.snackbar.open('Region Assessment job error', 'OK');
          }
        }
      });

    return jobManager;
  }

  /**
   * Download job results and create map layer to display it.
   * @param jobId
   */
  loadLayerFromJobResults(jobId: number, region?: string) {
    const layerGroup = this.setupCOGAssessRegionsLayerGroup();

    // standardize getting region as an Observable
    let region$: Observable<string>;
    if (region !== undefined) {
      region$ = of(region);
    } else {
      region$ = this.api.getJob(jobId).pipe(map(x => x.job.input_payload.region));
    }

    forkJoin([region$, this.api.downloadJobResults(jobId)]).subscribe(([region, results]) => {
      const regionResults = { ...results, region };
      this.jobResultsToReadyRegion(regionResults).subscribe(readyRegion => {
        this.addRegionLayer(readyRegion, layerGroup);
      });
    });
  }

  private jobResultsToReadyRegion(results: RegionDownloadResponse): Observable<ReadyRegion> {
    const url = getFirstFileFromResults(results);

    if (this.config.enableCOGBlob()) {
      // assuming file is small and better to download whole thing to blob
      // TODO only convert to local Blob if less than certain size
      return from(urlToBlobObjectURL(url, '.tif')).pipe(
        map(blobUrl => {
          return {
            region: results.region,
            cogUrl: blobUrl,
            originalUrl: url
          } satisfies ReadyRegion;
        })
      );
    } else {
      // no local Blob
      return of({
        region: results.region,
        cogUrl: url,
        originalUrl: url
      });
    }
  }

  private setupCOGAssessRegionsLayerGroup() {
    const existingLayerGroup = this.cogAssessRegionsLayerGroup();
    if (existingLayerGroup) {
      return existingLayerGroup;
    }

    const layerGroup = new LayerGroup({
      properties: {
        title: 'Assessed Regions'
      }
    });
    this.cogAssessRegionsLayerGroup.set(layerGroup);
    this.map.addLayer(layerGroup);
    return layerGroup;
  }

  private setupSiteSuitabilityLayerGroup() {
    const existingLayerGroup = this.siteSuitabilityLayerGroup();
    if (existingLayerGroup) {
      return existingLayerGroup;
    }

    const layerGroup = new LayerGroup({
      properties: {
        title: 'Site Suitability'
      }
    });
    this.siteSuitabilityLayerGroup.set(layerGroup);
    this.map.addLayer(layerGroup);
    return layerGroup;
  }

  /**
   * Start job, add map layer based on result
   * @param payload
   */
  addSiteSuitabilityLayer(payload: SuitabilityAssessmentInput) {
    // TODO[OpenLayers] site suitability loading indicator
    // TODO:region rework multi-request progress tracking, review RegionJobsManager
    // this works, but is bespoke for this kind of request, will refactor job requests
    // to share same region job-dispatch code in user-selected region PR.
    const layerGroup = this.setupSiteSuitabilityLayerGroup();
    const region = payload.region;
    this.siteSuitabilityLoading.set(true);
    this.activeSiteSuitabilityRegions.add(region);

    const job = this.jobsManager.startJob('SUITABILITY_ASSESSMENT', payload);
    job.jobDetails$
      .pipe(
        tap(job => {
          console.log(`Job id=${job.id} type=${job.type} update`, job);
        }),
        filter(x => x.status === 'SUCCEEDED'),
        switchMap(job => this.api.downloadJobResults(job.id)),
        takeUntil(this.cancelAssess$),
        finalize(() => this.removeActiveSiteSuitabilityRegion(region))
      )
      .subscribe(jobResults => {
        this.removeActiveSiteSuitabilityRegion(region);
        const url = getFirstFileFromResults(jobResults);

        const style = new Style({
          stroke: new Stroke({
            color: 'rgba(241, 192, 12, 0.7)',
            width: 1
          }),
          fill: new Fill({
            color: 'rgba(241, 192, 12, 0.5)' // semi-transparent gold
          })
        });

        const source = new VectorSource({
          url,
          format: new GeoJSON()
        });

        const layer = new VectorLayer({
          properties: {
            title: `${region} site suitability`,
            downloadUrl: url
          } satisfies LayerProperties,
          source,
          style
        });

        layerGroup.getLayers().push(layer);
      });
  }

  private removeActiveSiteSuitabilityRegion(region: string) {
    this.activeSiteSuitabilityRegions.delete(region);

    if (this.activeSiteSuitabilityRegions.size === 0) {
      this.siteSuitabilityLoading.set(false);
    }
  }

  /**
   * Cancel assess criteria related map layer requests.
   */
  cancelAssess() {
    this.cancelAssess$.next();

    // cancel all jobs for now, this code will be reworked soon.
    this.jobsManager.cancelAll();
  }

  /**
   * Cancel any CriteriaRequest and destroy map layers.
   */
  clearAssessedLayers() {
    // cancel current request if any
    this.cancelAssess();

    const rootLayers = this.map.getLayers();
    const regionsLayerGroup = this.cogAssessRegionsLayerGroup();
    if (regionsLayerGroup) {
      disposeLayerGroup(regionsLayerGroup, rootLayers);
    }
    this.cogAssessRegionsLayerGroup.set(undefined);

    const sitesLayerGroup = this.siteSuitabilityLayerGroup();
    if (sitesLayerGroup) {
      disposeLayerGroup(sitesLayerGroup, rootLayers);
    }
    this.siteSuitabilityLayerGroup.set(undefined);
  }

  /**
   * Show this criteria layer and hide others.
   * @param criteria layer id
   * @param show show/hide layer
   */
  showCriteriaLayer(criteria: string, show = true) {
    const criteriaLayerGroup = this.criteriaLayerGroup();
    if (criteriaLayerGroup) {
      criteriaLayerGroup.setVisible(true);
      for (let id in this.criteriaLayers) {
        const criteriaLayer = this.criteriaLayers[id];
        criteriaLayer?.visible.set(id === criteria && show);
      }
    }
  }

  toggleNotes() {
    console.warn('TODO polygon notes openlayers');
  }

  private async addRegionLayer(region: ReadyRegion, layerGroup: LayerGroup) {
    console.log('addRegionLayer', region.region, region.originalUrl);

    const layer = new TileLayer({
      properties: {
        title: `${region.region} criteria assessment`,
        // cogUrl could be Blob URL, we want to send users to the original
        downloadUrl: region.originalUrl
      } satisfies LayerProperties,
      source: new GeoTIFF({
        interpolate: false,
        sources: [
          {
            url: region.cogUrl
          }
        ]
      })
    });

    // free ObjectURL memory after layer disposed
    if (region.cogUrl.startsWith('blob:')) {
      onLayerDispose(layer, () => {
        setTimeout(() => {
          console.log(`layer disposed for ${region.region}, revokeObjectURL `, region.cogUrl);
          URL.revokeObjectURL(region.cogUrl);
        });
      });
    }

    layerGroup.getLayers().push(layer);
  }

  private async addCriteriaLayers() {
    const layers = this.api.getCriteriaLayers();

    const layerGroup = new LayerGroup({
      properties: {
        title: 'Criteria'
      }
    });
    this.criteriaLayerGroup.set(layerGroup);
    this.map.getLayers().push(layerGroup);

    for (let layerDef of layers) {
      const { id } = layerDef;
      const layer = createLayerFromDef(layerDef, {
        id: `criteria_${id}`,
        visible: false,
        opacity: 0.8
      });

      layerGroup.getLayers().push(layer);

      this.criteriaLayers[id] = this.createLayerController(layer, {
        layerDef
      });
    }
  }

  private addInfoLayers() {
    const infoLayerDefs = this.api.getInfoLayers();
    for (const layerDef of infoLayerDefs) {
      const layer = createLayerFromDef(layerDef);
      this.map.getLayers().push(layer);
    }
  }

  private handleRegionError(region: string) {
    console.warn('handleRegionError', region);
    // TODO multi-error display. this replaces previous error.
    this.snackbar.open(`Error loading ${region}`, 'OK');
  }

  /**
   * Get the LayerController for this Layer.
   * Creates a new LayerController if one does not exist.
   * @param layer any OpenLayers layer that LayerController supports.
   */
  public getLayerController(layer: Layer): LayerController {
    let controller = this.layerControllers.get(layer);
    if (controller) {
      return controller;
    } else {
      return this.createLayerController(layer);
    }
  }

  private createLayerController(layer: Layer, options?: LayerControllerOptions): LayerController {
    runInInjectionContext(this.injector, () => {
      const controller = new LayerController(layer, options);
      // TODO remove on layer remove/dispose
      this.layerControllers.set(layer, controller);
    });

    const controller = this.layerControllers.get(layer);
    if (controller === undefined) {
      throw new Error('LayerController not created!');
    }
    return controller;
  }
}
