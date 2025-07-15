import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  INJECTOR,
  runInInjectionContext,
  signal,
  Signal,
  WritableSignal
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import Map from 'ol/Map';
import { JobType } from '@reefguide/db';
import {
  BehaviorSubject,
  filter,
  finalize,
  forkJoin,
  from,
  map,
  mergeMap,
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
import { ColorRGBA } from '../../util/arcgis/arcgis-layer-util';
import { urlToBlobObjectURL } from '../../util/http-util';
import { isDefined } from '../../util/js-util';
import { StylableLayer } from '../widgets/layer-style-editor/layer-style-editor.component';
import { ReefGuideApiService } from './reef-guide-api.service';
import {
  criteriaToSiteSuitabilityJobPayload,
  SelectionCriteria,
  SiteSuitabilityCriteria
} from './reef-guide-api.types';
import { ReefGuideConfigService } from './reef-guide-config.service';
import { CriteriaRequest, ReadyRegion } from './selection-criteria/criteria-request.class';
import {
  RegionDownloadResponse,
  RegionJobsManager
} from './selection-criteria/region-jobs-manager';
import { SuitabilityAssessmentInput } from '@reefguide/types';
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

interface CriteriaLayer {
  layer: TileLayer;
  visible: WritableSignal<boolean>;
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
  private readonly reefGuideApi = inject(ReefGuideApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly jobsManager = inject(JobsManagerService);

  // map is set shortly after construction
  private map!: Map;

  assessColor: ColorRGBA = [241, 192, 12, 1];

  criteriaLayers: Record<string, CriteriaLayer> = {};

  /**
   * HTTP errors encounter by map layers.
   * TODO hookup OpenLayers error reporting
   */
  httpErrors: Subject<__esri.Error> = new Subject<__esri.Error>();

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

  // current region assessment in progress
  criteriaRequest = signal<CriteriaRequest | undefined>(undefined);

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
        const status = err.details.httpStatus;
        // err.details.url
        this.snackbar.open(`Map layer error (HTTP ${status})`, 'OK');
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
  setMap(map: Map) {
    this.map = map;

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
  addJobLayers(jobType: JobType, payload: any): RegionJobsManager {
    console.log('addJobLayers', payload);

    // TODO:region use region selector in panel instead of config system
    const selectedRegions = this.config
      .enabledRegions()
      // TODO:region current UI/config-sys can create blank values
      .filter(v => v !== '');
    if (selectedRegions.length === 0) {
      console.warn('No regions selected!');
    }
    const regions$ = of(...selectedRegions);

    const jobManager = runInInjectionContext(
      this.injector,
      () => new RegionJobsManager(jobType, payload, regions$)
    );
    // FIXME refactor, thinking the job/data manager should be outside map service
    // this.criteriaRequest.set(criteriaRequest);

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

  addCOGLayers(criteria: SelectionCriteria) {
    console.log('addCOGLayers', criteria);

    const regions$ = toObservable(this.config.enabledRegions, {
      injector: this.injector
    }).pipe(mergeMap(regions => of(...regions)));

    const criteriaRequest = runInInjectionContext(
      this.injector,
      () => new CriteriaRequest(criteria, regions$)
    );
    this.criteriaRequest.set(criteriaRequest);

    const layerGroup = this.setupCOGAssessRegionsLayerGroup();

    criteriaRequest.regionError$.subscribe(region => this.handleRegionError(region));

    criteriaRequest.regionReady$
      // unsubscribe when this component is destroyed
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(region => this.addRegionLayer(region, layerGroup));
  }

  /**
   * Start SUITABILITY_ASSESSMENT jobs for all active regions.
   * @param criteria
   * @param siteCriteria
   */
  addAllSiteSuitabilityLayers(criteria: SelectionCriteria, siteCriteria: SiteSuitabilityCriteria) {
    const regions = this.config.enabledRegions();

    for (const region of regions) {
      const payload = criteriaToSiteSuitabilityJobPayload(region, criteria, siteCriteria);

      this.addSiteSuitabilityLayer(payload);
    }
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
            title: `${region} site suitability`
          },
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

    const cr = this.criteriaRequest();
    if (cr) {
      cr.cancel();
      this.criteriaRequest.set(undefined);
    }

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
        criteriaLayer.visible.set(id === criteria && show);
      }
    }
  }

  toggleNotes() {
    console.warn('TODO polygon notes openlayers');
  }

  /**
   * Update criteria layers signals to reflect current layer state.
   * Note: ideally would subscribe to layer event, but doesn't seem to exist.
   * REVIEW was created for ArcGIS, OpenLayers seems to have own state management, maybe use instead
   */
  updateCriteriaLayerStates() {
    const criteriaLayerGroup = this.criteriaLayerGroup();
    if (criteriaLayerGroup) {
      criteriaLayerGroup.setVisible(true);
      for (let id in this.criteriaLayers) {
        const criteriaLayer = this.criteriaLayers[id];
        criteriaLayer.visible.set(criteriaLayer.layer.isVisible());
      }
    }
  }

  private async addRegionLayer(region: ReadyRegion, layerGroup: LayerGroup) {
    console.log('addRegionLayer', region.region, region.originalUrl);

    // NOW openlayers styling
    // const layer = new ImageryTileLayer({
    //   title: region.region,
    //   url: cleanUrl,
    //   customParameters: params,
    //   opacity: 0.9,
    //   // gold color
    //   // Note: this only works with binary color COG, it broke with the greyscale raster.
    //   // TODO heatmap in OpenLayers
    //   rasterFunction: createSingleColorRasterFunction(this.assessColor)
    // });

    const layer = new TileLayer({
      properties: {
        title: `${region.region} criteria assessment`
      },
      source: new GeoTIFF({
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
    const { injector } = this;
    const layers = this.reefGuideApi.getCriteriaLayers();

    const layerGroup = new LayerGroup({
      properties: {
        title: 'Criteria'
      }
    });

    // NOW OpenLayers
    for (let criteria in layers) {
      // const url = layers[criteria];
      //
      // const layer = new TileLayer({
      //   id: `criteria_${criteria}`,
      //   // TODO user-friendly title
      //   // title:
      //   url,
      //   visible: false
      // });
      // groupLayer.add(layer);
      //
      // const visible = signal(false);
      //
      // this.criteriaLayers[criteria] = {
      //   layer,
      //   visible
      // };
      //
      // effect(
      //   () => {
      //     layer.visible = visible();
      //   },
      //   { injector }
      // );
    }

    // this.map.addLayer(groupLayer);
    // this.criteriaLayerGroup.set(groupLayer);
  }

  private handleRegionError(region: string) {
    console.warn('handleRegionError', region);
    // TODO multi-error display. this replaces previous error.
    this.snackbar.open(`Error loading ${region}`, 'OK');
  }
}
