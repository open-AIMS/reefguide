import { DestroyRef, inject, Injectable, Injector, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PolygonReference } from '@reefguide/types';
import { Feature, Map as OLMap } from 'ol';
import { GeoJSON } from 'ol/format';
import { Geometry } from 'ol/geom';
import LayerGroup from 'ol/layer/Group';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style } from 'ol/style';
import { BehaviorSubject, finalize, Subject, tap } from 'rxjs';
import { WebApiService } from '../../api/web-api.service';
import { LayerProperties } from '../../types/layer.type';
import { disposeLayerGroup } from '../map/openlayers-util';

export const USER_POLYGON_LAYER_ID = 'user-polygon-layer';

/**
 * Service for managing user-drawn polygons on the map.
 * Handles fetching polygons from the API and rendering them as OpenLayers vector layers.
 */
@Injectable()
export class PolygonMapService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly api = inject(WebApiService);
  private readonly snackbar = inject(MatSnackBar);

  private map!: OLMap;
  private readonly geojsonFormat = new GeoJSON();

  /**
   * Layer group containing all user polygon layers
   */
  private readonly polygonLayerGroup = signal<LayerGroup | undefined>(undefined);

  /**
   * Currently loaded polygons (by ID for efficient lookup)
   */
  private readonly polygonsById = new Map<number, PolygonReference>();

  /**
   * Map of polygon ID to OpenLayers feature for efficient updates
   */
  private readonly featuresByPolygonId = new Map<number, Feature<Geometry>>();

  /**
   * Currently loaded polygons array
   */
  private readonly polygons = signal<PolygonReference[]>([]);

  /**
   * Loading state
   */
  readonly loading = signal(false);

  /**
   * Trigger to refresh polygons from API
   */
  private readonly refreshTrigger$ = new Subject<{ projectId: number }>();

  /**
   * Observable of current polygons
   */
  readonly polygons$ = new BehaviorSubject<PolygonReference[]>([]);

  /**
   * Currently active project ID (for tracking state)
   */
  private currentProjectId?: number;

  constructor() {
    this.setupRefreshListener();
  }

  /**
   * Set the map instance
   * @param map OpenLayers map
   * @param projectId Optional project ID to load polygons for
   */
  configureMapService(map: OLMap, projectId: number): void {
    this.map = map;
    this.currentProjectId = projectId;

    // Initial load of polygons
    this.refresh(projectId);
  }

  /**
   * Setup listener for refresh triggers
   */
  private setupRefreshListener(): void {
    this.refreshTrigger$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ projectId }) => {
      this.fetchAndRenderPolygons(projectId);
    });
  }

  /**
   * Trigger a refresh of polygons from the API
   * @param projectId project ID to filter polygons by
   */
  refresh(projectId: number): void {
    this.currentProjectId = projectId;
    this.refreshTrigger$.next({ projectId });
  }

  /**
   * Fetch polygons from API and render them on the map
   * @param projectId project ID to filter polygons by
   */
  private fetchAndRenderPolygons(projectId: number): void {
    if (!this.map) {
      console.warn('Map not initialized, cannot fetch polygons');
      return;
    }

    this.loading.set(true);

    this.api
      .getPolygons({ projectId })
      .pipe(
        tap(response => {
          console.debug(`Fetched polygons for project ${projectId}`, response.polygons);
          this.polygons.set(response.polygons);
          this.polygons$.next(response.polygons);
        }),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: response => {
          this.renderPolygonsOnMap(response.polygons, projectId);
        },
        error: error => {
          console.error('Error fetching polygons:', error);
          this.snackbar.open('Failed to load polygons', 'OK', {
            duration: 3000
          });
        }
      });
  }

  /**
   * Intelligently update polygon layers on the map.
   * Only adds/updates/removes polygons that have changed.
   * @param polygons Array of polygon data from API
   * @param projectId Optional project ID for layer naming
   */
  private renderPolygonsOnMap(polygons: PolygonReference[], projectId: number): void {
    if (!this.map) {
      console.warn('Map not initialized');
      return;
    }

    // Setup layer group if needed
    const layerGroup = this.setupPolygonLayerGroup(projectId);

    // Get the vector layer (create if doesn't exist)
    let vectorLayer = this.getOrCreateVectorLayer(layerGroup);
    const source = vectorLayer.getSource();

    if (!source) {
      console.error('Vector layer has no source');
      return;
    }

    // Build set of new polygon IDs
    const newPolygonIds = new Set(polygons.map(p => p.id));

    // Track current polygon IDs
    const currentPolygonIds = new Set(this.polygonsById.keys());

    // 1. Remove polygons that no longer exist
    for (const polygonId of currentPolygonIds) {
      if (!newPolygonIds.has(polygonId)) {
        console.debug(`Removing polygon ${polygonId} from map`);
        const feature = this.featuresByPolygonId.get(polygonId);
        if (feature) {
          source.removeFeature(feature);
          this.featuresByPolygonId.delete(polygonId);
        }
        this.polygonsById.delete(polygonId);
      }
    }

    // 2. Add new polygons or update changed ones
    for (const polygon of polygons) {
      const existingPolygon = this.polygonsById.get(polygon.id);

      // Check if polygon is new or has changed
      const isNew = !existingPolygon;
      const hasChanged = existingPolygon && this.hasPolygonChanged(existingPolygon, polygon);

      if (isNew) {
        console.debug(`Adding new polygon ${polygon.id} to map`);
        this.addPolygonFeature(polygon, source);
      } else if (hasChanged) {
        console.debug(`Updating changed polygon ${polygon.id} on map`);
        // Remove old feature
        const oldFeature = this.featuresByPolygonId.get(polygon.id);
        if (oldFeature) {
          source.removeFeature(oldFeature);
        }
        // Add updated feature
        this.addPolygonFeature(polygon, source);
      }
      // If unchanged, do nothing (feature already on map)

      // Update stored polygon data
      this.polygonsById.set(polygon.id, polygon);
    }

    console.debug(`Polygon map updated: ${source.getFeatures().length} features on map`);
  }

  /**
   * Check if a polygon has changed by comparing geometry
   * @param oldPolygon Previous polygon data
   * @param newPolygon New polygon data
   */
  private hasPolygonChanged(oldPolygon: PolygonReference, newPolygon: PolygonReference): boolean {
    // Compare geometry JSON (most likely to change)
    const oldGeometry = JSON.stringify(oldPolygon.polygon);
    const newGeometry = JSON.stringify(newPolygon.polygon);

    return oldGeometry !== newGeometry;
  }

  /**
   * Add a polygon feature to the map source
   * @param polygon Polygon data
   * @param source Vector source to add feature to
   */
  private addPolygonFeature(polygon: PolygonReference, source: VectorSource): void {
    try {
      // Parse the GeoJSON geometry and create a feature
      const readResult = this.geojsonFormat.readFeature(polygon.polygon, {
        dataProjection: 'EPSG:4326',
        featureProjection: this.map.getView().getProjection()
      });

      // Ensure we only have a single feature
      let feature: Feature<Geometry>;

      if (Array.isArray(readResult)) {
        if (readResult.length !== 1) {
          console.warn(`Polygon ${polygon.id} returned ${readResult.length} features, expected 1`);
          return;
        }
        feature = readResult[0];
      } else {
        feature = readResult;
      }

      // Store polygon metadata in feature properties
      feature.setProperties({
        polygonId: polygon.id,
        userId: polygon.user_id,
        projectId: polygon.project_id,
        createdAt: polygon.created_at
      });

      // Add feature to source and track it
      source.addFeature(feature);
      this.featuresByPolygonId.set(polygon.id, feature);
    } catch (error) {
      console.error(`Error parsing polygon ${polygon.id}:`, error);
    }
  }

  /**
   * Get existing vector layer or create a new one
   * @param layerGroup Layer group to search/add to
   * @param projectId Optional project ID for layer naming
   */
  private getOrCreateVectorLayer(layerGroup: LayerGroup): VectorLayer<VectorSource> {
    // Try to find existing vector layer
    const layers = layerGroup.getLayers().getArray();
    const existingLayer = layers.find(layer => layer.get('id') === USER_POLYGON_LAYER_ID) as
      | VectorLayer<VectorSource>
      | undefined;

    if (existingLayer) {
      return existingLayer;
    }

    // Create new vector layer
    const source = new VectorSource();

    const layerTitle = `Project Polygons`;

    const layer = new VectorLayer({
      properties: {
        title: layerTitle,
        id: USER_POLYGON_LAYER_ID
      } satisfies LayerProperties,
      source: source,
      style: this.getPolygonStyle()
    });

    layerGroup.getLayers().push(layer);
    return layer;
  }

  /**
   * Get the default style for polygon features
   */
  private getPolygonStyle(): Style {
    return new Style({
      stroke: new Stroke({
        color: 'rgba(0, 123, 255, 0.8)',
        width: 2
      }),
      fill: new Fill({
        color: 'rgba(0, 123, 255, 0.2)'
      })
    });
  }

  /**
   * Setup or retrieve the polygon layer group
   * @param projectId Optional project ID for layer group naming
   */
  private setupPolygonLayerGroup(projectId: number): LayerGroup {
    const existingLayerGroup = this.polygonLayerGroup();
    if (existingLayerGroup) {
      return existingLayerGroup;
    }

    const groupTitle = `Project ${projectId} Polygons`;

    const layerGroup = new LayerGroup({
      properties: {
        title: groupTitle
      }
    });

    this.polygonLayerGroup.set(layerGroup);
    this.map.addLayer(layerGroup);

    return layerGroup;
  }

  /**
   * Clear all polygon layers from the map
   */
  clearPolygonLayers(): void {
    const layerGroup = this.polygonLayerGroup();
    if (layerGroup) {
      const rootLayers = this.map.getLayers();
      disposeLayerGroup(layerGroup, rootLayers);
      this.polygonLayerGroup.set(undefined);
    }

    // Clear internal tracking
    this.polygonsById.clear();
    this.featuresByPolygonId.clear();
    this.polygons.set([]);
    this.polygons$.next([]);
    this.currentProjectId = undefined;
  }

  /**
   * Get polygon by ID from loaded polygons
   * @param id Polygon ID
   */
  getPolygonById(id: number): PolygonReference | undefined {
    return this.polygonsById.get(id);
  }

  /**
   * Remove a specific polygon from the map and list
   * @param id Polygon ID to remove
   */
  removePolygon(id: number): void {
    // Remove from map
    const feature = this.featuresByPolygonId.get(id);
    if (feature) {
      const layerGroup = this.polygonLayerGroup();
      if (layerGroup) {
        const vectorLayer = this.getOrCreateVectorLayer(layerGroup);
        const source = vectorLayer.getSource();
        if (source) {
          source.removeFeature(feature);
          console.debug(`Removed polygon ${id} from map`);
        }
      }
      this.featuresByPolygonId.delete(id);
    }

    // Update local state
    this.polygonsById.delete(id);
    const updatedPolygons = Array.from(this.polygonsById.values());
    this.polygons.set(updatedPolygons);
    this.polygons$.next(updatedPolygons);
  }

  /**
   * Show or hide polygon layers
   * @param visible Whether layers should be visible
   */
  setVisible(visible: boolean): void {
    const layerGroup = this.polygonLayerGroup();
    if (layerGroup) {
      layerGroup.setVisible(visible);
    }
  }

  /**
   * Get the current loading state
   */
  isLoading(): boolean {
    return this.loading();
  }

  /**
   * Get the current list of polygons
   */
  getPolygons(): PolygonReference[] {
    return Array.from(this.polygonsById.values());
  }

  /**
   * Get the currently active project ID
   */
  getCurrentProjectId(): number | undefined {
    return this.currentProjectId;
  }
}
