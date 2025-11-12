import {
  computed,
  DestroyRef,
  effect,
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
  take,
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
import { openlayersRegisterEPSG7844 } from '../../util/openlayers/openlayers-config';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { GeoJSON } from 'ol/format';
import { Fill, Stroke, Style } from 'ol/style';
import Draw from 'ol/interaction/Draw';
import { Feature } from 'ol';
import { Geometry } from 'ol/geom';
import { DrawEvent } from 'ol/interaction/Draw';
import {
  createExtentLayer,
  disposeLayerGroup,
  onLayerDispose
} from '../../util/openlayers/openlayers-util';
import Layer from 'ol/layer/Layer';
import { LayerController, LayerControllerOptions } from '../map/layer-controller';
import { LayerProperties } from '../../types/layer.type';
import { singleBandColorGradientLayerStyle } from '../../util/openlayers/openlayers-styles';
import { fromString as colorFromString } from 'ol/color';

/**
 * Map UI actions implemented by the overall app design.
 *
 * @see LocationSelectionComponent
 */
export interface MapUI {
  openLayerStyleEditor(layer: BaseLayer): void;
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
 * Polygon drawing callbacks
 */
export interface PolygonDrawHandlers {
  onSuccess: (geojson: string) => void;
  onCancelled?: () => void;
}

import { PolygonMapService } from './polygon-map.service';
import { LAYER_ADJUSTMENT } from '../map/openlayers-hardcoded';
import { createLayerFromDef } from '../../util/openlayers/layer-creation';
import BaseLayer from 'ol/layer/Base';
import { Group } from 'ol/layer';
import { fromOpenLayersProperty } from '../../util/openlayers/openlayers-rxjs';

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
  readonly polygonMapService = inject(PolygonMapService);

  // map is set shortly after construction
  private map!: OLMap;

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

  private layerControllers = new Map<BaseLayer, LayerController>();

  // Polygon drawing state
  public isDrawingPolygon: boolean = false;
  private drawInteraction: Draw | null = null;
  private drawSource: VectorSource | null = null;
  private drawLayer: VectorLayer<VectorSource> | null = null;
  private drawHandlers: PolygonDrawHandlers | null = null;
  private readonly geojsonFormat = new GeoJSON();

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
  setMap(map: OLMap, projectId: number) {
    this.map = map;

    this.addInfoLayers();
    void this.addCriteriaLayers();

    // Initialize polygon map service with the map
    this.polygonMapService.configureMapService(map, projectId);
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
   * Start drawing a polygon on the map.
   * The polygon will be temporarily visible while being drawn.
   * Once complete, the GeoJSON is returned via onSuccess callback.
   *
   * @param handlers Callbacks for success and cancellation
   */
  startDrawPolygon(handlers: PolygonDrawHandlers): void {
    // Cancel any existing drawing
    this.cancelDrawPolygon();

    this.drawHandlers = handlers;

    // Create a temporary vector source and layer for drawing
    this.drawSource = new VectorSource({ wrapX: false });
    this.drawLayer = new VectorLayer({
      properties: {
        hideInList: true
      } satisfies LayerProperties,
      source: this.drawSource,
      style: new Style({
        stroke: new Stroke({
          color: 'rgba(0, 123, 255, 0.8)',
          width: 2
        }),
        fill: new Fill({
          color: 'rgba(0, 123, 255, 0.2)'
        })
      })
    });

    // Add the temporary layer to the map
    this.map.addLayer(this.drawLayer);

    // Create the draw interaction
    this.isDrawingPolygon = true;
    this.drawInteraction = new Draw({
      source: this.drawSource,
      type: 'Polygon'
    });

    // Handle draw end event
    this.drawInteraction.on('drawend', (event: DrawEvent) => {
      this.handleDrawEnd(event.feature);
    });

    // Add the interaction to the map
    this.map.addInteraction(this.drawInteraction);
  }

  /**
   * Cancel the current polygon drawing operation.
   * Removes the draw interaction and temporary layer.
   */
  cancelDrawPolygon(): void {
    if (this.drawInteraction) {
      this.map.removeInteraction(this.drawInteraction);
      this.drawInteraction = null;
      this.isDrawingPolygon = false;
    }

    if (this.drawLayer) {
      this.map.removeLayer(this.drawLayer);
      this.drawLayer = null;
    }

    this.drawSource = null;

    if (this.drawHandlers?.onCancelled) {
      this.drawHandlers.onCancelled();
    }

    this.drawHandlers = null;
  }

  /**
   * Remove the last point from the polygon being drawn.
   * Useful for an "undo" button during drawing.
   */
  undoLastDrawPoint(): void {
    if (this.drawInteraction) {
      this.drawInteraction.removeLastPoint();
    }
  }

  /**
   * Handle the completion of polygon drawing.
   * Converts the feature to GeoJSON and calls the success handler.
   *
   * @param feature The drawn polygon feature
   */
  private handleDrawEnd(feature: Feature<Geometry>): void {
    try {
      // Convert the feature to GeoJSON
      const geojsonFeature = this.geojsonFormat.writeFeature(feature, {
        dataProjection: 'EPSG:4326',
        featureProjection: this.map.getView().getProjection()
      });

      // Parse the feature to extract just the geometry
      const parsedFeature = JSON.parse(geojsonFeature);

      // Extract just the geometry (Polygon) from the Feature
      const geometry = parsedFeature.geometry;

      // Convert geometry back to string
      const geojsonGeometry = JSON.stringify(geometry);

      // Call the success handler with the geometry only
      if (this.drawHandlers?.onSuccess) {
        this.drawHandlers.onSuccess(geojsonGeometry);
      }

      // Clean up the drawing state after a short delay
      // This allows the user to see the completed polygon briefly
      setTimeout(() => {
        this.cleanupDrawing();
      }, 500);
    } catch (error) {
      console.error('Error converting polygon to GeoJSON:', error);
      this.snackbar.open('Error processing drawn polygon', 'OK');
      this.cleanupDrawing();
    }
  }

  /**
   * Clean up drawing interaction and temporary layer.
   */
  private cleanupDrawing(): void {
    if (this.drawInteraction) {
      this.map.removeInteraction(this.drawInteraction);
      this.drawInteraction = null;
      this.isDrawingPolygon = false;
    }

    if (this.drawLayer) {
      this.map.removeLayer(this.drawLayer);
      this.drawLayer = null;
    }

    this.drawSource = null;
    this.drawHandlers = null;
  }

  /**
   * Request REGIONAL_ASSESSMENT job and add map layer when result downloaded.
   * @param payload
   */
  addRegionalAssessmentJob(payload: RegionalAssessmentInput): RegionJobsManager {
    console.log('addRegionalAssessmentJob', payload);

    // TODO cleanup old multi-region code
    const regions$ = of(payload.region);

    const jobManager = runInInjectionContext(
      this.injector,
      () => new RegionJobsManager('REGIONAL_ASSESSMENT', payload, regions$)
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
          this.addRegionalAssessmentLayer(readyRegion, layerGroup);
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
        this.addRegionalAssessmentLayer(readyRegion, layerGroup);
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
   * Request SUITABILITY_ASSESSMENT job and add map layer when result downloaded.
   * @param payload
   */
  addSuitabilityAssessmentJob(payload: SuitabilityAssessmentInput) {
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
            color: 'rgba(203,8,229,0.7)',
            width: 1
          }),
          fill: new Fill({
            color: 'rgba(203,8,229,0.4)'
          })
        });

        const source = new VectorSource({
          url,
          format: new GeoJSON()
        });

        const layer = new VectorLayer({
          properties: {
            title: `${region} site suitability`,
            downloadUrl: url,
            labelProp: 'row_ID'
          } satisfies LayerProperties,
          source,
          style
        });

        this.afterCreateLayer(layer);

        layerGroup.getLayers().push(layer);
      });
  }

  /**
   * Add a temporary layer to represent the extent of this Layer
   * If given a group, extent will be rendered for each child layer.
   *
   * @param layer
   */
  addExtentLayer(layer: BaseLayer) {
    // Note: layer extents should be in the map projection
    if (layer instanceof Group) {
      layer.getLayers().forEach(layer => {
        fromOpenLayersProperty(layer, 'extent')
          .pipe(take(1))
          .subscribe(extent => {
            if (extent) {
              const extentLayer = createExtentLayer(extent);
              extentLayer.setMap(this.map);
            }
          });
      });
    } else {
      const extent = layer.getExtent();
      if (!extent) {
        return;
      }

      fromOpenLayersProperty(layer, 'extent')
        .pipe(take(1))
        .subscribe(extent => {
          const extentLayer = createExtentLayer(extent);
          extentLayer.setMap(this.map);
        });
    }
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
   * @param criteriaId layer id
   * @param show show/hide layer
   */
  showCriteriaLayer(criteriaId: string, show = true) {
    const criteriaLayerGroup = this.criteriaLayerGroup();
    if (criteriaLayerGroup) {
      criteriaLayerGroup.setVisible(true);
      for (let id in this.criteriaLayers) {
        const criteriaLayer = this.criteriaLayers[id];
        criteriaLayer?.visible.set(id === criteriaId && show);
      }

      if (!(criteriaId in this.criteriaLayers)) {
        console.warn(`No "${criteriaId}" criteria layer`);
      }
    }
  }

  toggleNotes() {
    console.warn('TODO polygon notes openlayers');
  }

  private async addRegionalAssessmentLayer(region: ReadyRegion, layerGroup: LayerGroup) {
    console.log('addRegionalAssessmentLayer', region.region, region.originalUrl);

    const color = '#F1C00C';

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
        ],
        // prevent normalization so can work with original band 1 values 0:100
        normalize: false
      }),
      opacity: 1.0
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

    const layerController = this.afterCreateLayer(layer, { color });

    // update style when color changes (and first init)
    effect(
      () => {
        // ReefGuide assessment band values are 0 to 100
        layer.setStyle(
          singleBandColorGradientLayerStyle(colorFromString(layerController.color!()), 100)
        );
      },
      { injector: this.injector }
    );

    layerGroup.getLayers().push(layer);
  }

  private async addCriteriaLayers() {
    const layers = this.api.getCriteriaLayers();

    const layerGroup = new LayerGroup({
      properties: {
        title: 'Criteria',
        expandChildrenInList: true
      } as LayerProperties
    });
    this.criteriaLayerGroup.set(layerGroup);
    this.map.getLayers().push(layerGroup);

    for (let layerDef of layers) {
      const { id } = layerDef;
      try {
        const layer = createLayerFromDef(layerDef, {
          visible: false,
          opacity: 0.8
        });

        this.criteriaLayers[id] = this.afterCreateLayer(layer, { layerDef });

        layerGroup.getLayers().push(layer);
      } catch (err) {
        console.error(`Error loading criteria layer ${id}`, err);
      }
    }
  }

  private addInfoLayers() {
    const infoLayerDefs = this.api.getInfoLayers();
    for (const layerDef of infoLayerDefs) {
      try {
        const layer = createLayerFromDef(layerDef);
        this.afterCreateLayer(layer, { layerDef });
        this.map.getLayers().push(layer);
      } catch (err) {
        console.error(`Error loading info layer ${layerDef.id}`, err);
      }
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
  public getLayerController(layer: BaseLayer): LayerController {
    let controller = this.layerControllers.get(layer);
    if (controller) {
      return controller;
    } else {
      return this.createLayerController(layer);
    }
  }

  private createLayerController(
    layer: BaseLayer,
    options?: LayerControllerOptions
  ): LayerController {
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

  /**
   * Called after a Layer is created by this service, prior to adding to Map.
   * Hooks error handling and creates the LayerController.
   * @param layer new Layer
   * @param options should be provided if created from LayerDef
   */
  private afterCreateLayer(layer: BaseLayer, options?: LayerControllerOptions): LayerController {
    const layerId = layer.get('id');
    // call hardcoded adjustment function for this layer if it has one.
    const adjustFn = LAYER_ADJUSTMENT[layerId];
    if (adjustFn && layer instanceof VectorLayer) {
      adjustFn(layer);
    }

    // TODO show error indicator in UI
    layer.on('error', e => {
      console.error('layer error', e);
    });

    if (layer instanceof Layer) {
      layer.getSource()?.on('error', (e: any) => {
        console.error('layer source error', e);
      });
    }

    return this.createLayerController(layer, options);
  }

  /**
   * Show/hide an info layer by its ID
   * @param layerId the layer ID to show/hide
   * @param visible whether to make the layer visible
   */
  showInfoLayer(layerId: string, visible: boolean = true) {
    // Get all layers from the map
    const allLayers = this.map.getAllLayers();

    // Find the layer with the matching ID
    const targetLayer = allLayers.find(layer => {
      const properties = layer.getProperties();
      return properties['id'] === layerId;
    });

    if (targetLayer) {
      targetLayer.setVisible(visible);
    } else {
      console.warn(`Info layer with ID "${layerId}" not found`);
    }
  }
}
