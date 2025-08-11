// src/app/model-workflow/services/map.service.ts
import { Injectable, signal } from '@angular/core';
import { Feature, Map as OlMap, View } from 'ol';
import { createEmpty } from 'ol/extent';
import { GeoJSON } from 'ol/format';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { fromLonLat } from 'ol/proj';
import { OSM, Vector as VectorSource } from 'ol/source';
import { Fill, Stroke, Style } from 'ol/style';
import { BehaviorSubject } from 'rxjs';

export interface MapConfiguration {
  center: [number, number]; // [longitude, latitude]
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
}

export interface HighlightOptions {
  strokeColor: string;
  strokeWidth?: number;
  fillColor?: string;
  zIndex?: number;
}

export interface GeoJSONLayerOptions {
  layerName: string;
  style?: {
    stroke?: {
      color: string;
      width: number;
    };
    fill?: {
      color: string;
    };
  };
  zIndex?: number;
}

export interface StyleFunction {
  (feature: Feature): {
    stroke?: {
      color: string;
      width: number;
    };
    fill?: {
      color: string;
    };
  };
}

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private map: OlMap | null = null;
  private isInitialized = signal(false);
  private vectorLayers: Map<string, VectorLayer<VectorSource>> = new Map();

  private highlightLayer: VectorLayer<VectorSource> | null = null;
  private highlightSource: VectorSource = new VectorSource();
  private currentHighlightLocationId: string | null = null;

  // Observable for map state changes
  private mapInitializedSubject = new BehaviorSubject<boolean>(false);
  public mapInitialized$ = this.mapInitializedSubject.asObservable();

  // Default configuration for coral reef modeling (centered on GBR)
  private defaultConfig: MapConfiguration = {
    center: [145.7781, -16.2839], // Great Barrier Reef coordinates
    zoom: 6,
    minZoom: 3,
    maxZoom: 18
  };

  constructor() {
    console.log('[MapService] Service instantiated');
  }

  /**
   * Initialize the map with a target container
   */
  initializeMap(target: string | HTMLElement, config?: Partial<MapConfiguration>): OlMap {
    console.log('[MapService] initializeMap() called');
    console.log('[MapService] Target:', target);
    console.log('[MapService] Config:', config);
    console.log('[MapService] Current map instance:', this.map);

    // Clean up existing map if any
    if (this.map) {
      console.log('[MapService] Cleaning up existing map before creating new one');
      this.destroyMap();
    }

    const mapConfig = { ...this.defaultConfig, ...config };
    console.log('[MapService] Final map configuration:', mapConfig);

    try {
      console.log('[MapService] Creating new Map instance...');

      // Validate target
      let targetElement: HTMLElement;
      if (typeof target === 'string') {
        targetElement = document.getElementById(target) as HTMLElement;
        console.log('[MapService] Target element by ID:', targetElement);
        if (!targetElement) {
          throw new Error(`Target element with ID '${target}' not found`);
        }
      } else {
        targetElement = target;
        console.log('[MapService] Target element direct:', targetElement);
      }

      // Check if target element has dimensions
      const rect = targetElement.getBoundingClientRect();
      console.log('[MapService] Target element dimensions:', {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left
      });

      if (rect.width === 0 || rect.height === 0) {
        console.warn('[MapService] Target element has zero dimensions!');
      }

      // Create the map
      this.map = new OlMap({
        target: targetElement,
        layers: [
          new TileLayer({
            source: new OSM({
              attributions: [
                '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              ]
            })
          })
        ],
        view: new View({
          center: fromLonLat(mapConfig.center),
          zoom: mapConfig.zoom,
          minZoom: mapConfig.minZoom,
          maxZoom: mapConfig.maxZoom
        })
      });

      console.log('[MapService] Map instance created successfully:', this.map);

      // Setup highlight layer after map creation
      this.setupHighlightLayer();

      this.isInitialized.set(true);
      this.mapInitializedSubject.next(true);

      console.log('[MapService] Map initialization complete');
      console.log('[MapService] isInitialized signal:', this.isInitialized());
      console.log('[MapService] mapInitializedSubject value:', this.mapInitializedSubject.value);

      return this.map;
    } catch (error) {
      console.error('[MapService] Failed to initialize map:', error);
      this.isInitialized.set(false);
      this.mapInitializedSubject.next(false);
      throw error;
    }
  }

  private setupHighlightLayer(): void {
    console.log('[MapService] Setting up highlight layer');

    if (!this.map) {
      console.warn('[MapService] Cannot setup highlight layer - no map instance');
      return;
    }

    try {
      // Create highlight source and layer
      this.highlightSource = new VectorSource();
      this.highlightLayer = new VectorLayer({
        source: this.highlightSource,
        zIndex: 100, // Above all other layers
        style: undefined // Style will be set per feature
      });

      // Add to map
      this.map.addLayer(this.highlightLayer);
      console.log('[MapService] Highlight layer added to map');
    } catch (error) {
      console.error('[MapService] Failed to setup highlight layer:', error);
    }
  }

  highlightFeature(originalFeature: Feature, options: HighlightOptions): void {
    console.log('[MapService] highlightFeature() called');
    console.log('[MapService] Options:', options);

    if (!this.highlightSource || !this.highlightLayer) {
      console.warn('[MapService] Highlight layer not initialized');
      return;
    }

    try {
      // Clear any existing highlight
      this.clearHighlight();

      // Clone the geometry from the original feature
      const geometry = originalFeature.getGeometry();
      if (!geometry) {
        console.warn('[MapService] Feature has no geometry to highlight');
        return;
      }

      // Create highlight feature with cloned geometry
      const highlightFeature = new Feature({
        geometry: geometry.clone()
      });

      // Create style for the highlight
      const highlightStyle = new Style({
        stroke: new Stroke({
          color: options.strokeColor,
          width: options.strokeWidth || 5
        }),
        fill: options.fillColor
          ? new Fill({
              color: options.fillColor
            })
          : undefined
      });

      // Set style on the feature
      highlightFeature.setStyle(highlightStyle);

      // Add to highlight source
      this.highlightSource.addFeature(highlightFeature);

      console.log('[MapService] Feature highlighted successfully');
    } catch (error) {
      console.error('[MapService] Failed to highlight feature:', error);
    }
  }

  // Clear highlight
  clearHighlight(): void {
    console.log('[MapService] clearHighlight() called');

    if (this.highlightSource) {
      this.highlightSource.clear();
      this.currentHighlightLocationId = null;
      console.log('[MapService] Highlight cleared');
    }
  }

  // Get current highlighted location
  getCurrentHighlightLocationId(): string | null {
    return this.currentHighlightLocationId;
  }

  // Set highlighted location (for tracking)
  setCurrentHighlightLocationId(locationId: string | null): void {
    this.currentHighlightLocationId = locationId;
  }

  /**
   * Add a GeoJSON layer to the map
   */
  addGeoJSONLayer(geoJsonData: any, options: GeoJSONLayerOptions): void {
    console.log('[MapService] addGeoJSONLayer() called');
    console.log('[MapService] GeoJSON data:', geoJsonData);
    console.log('[MapService] Options:', options);
    console.log('[MapService] Current map instance:', this.map);

    if (!this.map) {
      console.warn('[MapService] Cannot add GeoJSON layer - no map instance');
      return;
    }

    try {
      // Remove existing layer with the same name if it exists
      if (this.vectorLayers.has(options.layerName)) {
        console.log(`[MapService] Removing existing layer: ${options.layerName}`);
        this.removeGeoJSONLayer(options.layerName);
      }

      // Create vector source from GeoJSON
      const vectorSource = new VectorSource({
        features: new GeoJSON().readFeatures(geoJsonData, {
          featureProjection: 'EPSG:3857', // Web Mercator
          dataProjection: 'EPSG:4326' // WGS84
        })
      });

      console.log(
        '[MapService] Vector source created with features:',
        vectorSource.getFeatures().length
      );

      // Create style
      const style = new Style({
        stroke: new Stroke({
          color: options.style?.stroke?.color || '#2196F3',
          width: options.style?.stroke?.width || 2
        }),
        fill: new Fill({
          color: options.style?.fill?.color || 'rgba(33, 150, 243, 0.1)'
        })
      });

      // Create vector layer
      const vectorLayer = new VectorLayer({
        source: vectorSource,
        style: style,
        zIndex: options.zIndex || 10
      });

      // Add layer to map
      this.map.addLayer(vectorLayer);

      // Store layer reference
      this.vectorLayers.set(options.layerName, vectorLayer);

      console.log(`[MapService] GeoJSON layer '${options.layerName}' added successfully`);
    } catch (error) {
      console.error('[MapService] Failed to add GeoJSON layer:', error);
      throw error;
    }
  }

  /**
   * Update styling for an existing GeoJSON layer using a style function
   */
  updateGeoJSONStyling(layerName: string, styleFunction: StyleFunction): void {
    console.log(`[MapService] updateGeoJSONStyling() called for layer: ${layerName}`);

    if (!this.map) {
      console.warn('[MapService] Cannot update styling - no map instance');
      return;
    }

    const layer = this.vectorLayers.get(layerName);
    if (!layer) {
      console.warn(`[MapService] Layer '${layerName}' not found for styling update`);
      return;
    }

    try {
      // Create OpenLayers style function that matches the expected signature
      // TODO improve typing - typescript doesn't like this being Feature
      const olStyleFunction = (feature: any) => {
        const styleConfig = styleFunction(feature);

        return new Style({
          stroke: new Stroke({
            color: styleConfig.stroke?.color || '#2196F3',
            width: styleConfig.stroke?.width || 2
          }),
          fill: new Fill({
            color: styleConfig.fill?.color || 'rgba(33, 150, 243, 0.1)'
          })
        });
      };

      // Update layer style
      layer.setStyle(olStyleFunction);

      console.log(`[MapService] Layer '${layerName}' styling updated successfully`);
    } catch (error) {
      console.error(`[MapService] Failed to update styling for layer '${layerName}':`, error);
      throw error;
    }
  }

  /**
   * Get features at a specific pixel location
   */
  getFeaturesAtPixel(pixel: [number, number]): Feature[] | null {
    console.log('[MapService] getFeaturesAtPixel() called with pixel:', pixel);

    if (!this.map) {
      console.warn('[MapService] Cannot get features - no map instance');
      return null;
    }

    try {
      const features: Feature[] = [];

      this.map.forEachFeatureAtPixel(pixel, feature => {
        if (feature instanceof Feature) {
          features.push(feature);
        }
      });

      console.log(`[MapService] Found ${features.length} features at pixel`);
      return features.length > 0 ? features : null;
    } catch (error) {
      console.error('[MapService] Failed to get features at pixel:', error);
      return null;
    }
  }

  /**
   * Remove a GeoJSON layer from the map
   */
  removeGeoJSONLayer(layerName: string): void {
    console.log(`[MapService] removeGeoJSONLayer() called for: ${layerName}`);

    if (!this.map) {
      console.warn('[MapService] Cannot remove layer - no map instance');
      return;
    }

    const layer = this.vectorLayers.get(layerName);
    if (layer) {
      console.log(`[MapService] Removing layer: ${layerName}`);
      this.map.removeLayer(layer);
      this.vectorLayers.delete(layerName);
      console.log(`[MapService] Layer '${layerName}' removed successfully`);
    } else {
      console.warn(`[MapService] Layer '${layerName}' not found`);
    }
  }

  /**
   * Fit map view to GeoJSON extent
   */
  fitToGeoJSONExtent(geoJsonData: any, padding?: number[]): void {
    console.log('[MapService] fitToGeoJSONExtent() called');
    console.log('[MapService] GeoJSON data:', geoJsonData);
    console.log('[MapService] Current map instance:', this.map);

    if (!this.map) {
      console.warn('[MapService] Cannot fit to extent - no map instance');
      return;
    }

    try {
      // Create temporary vector source to calculate extent
      const vectorSource = new VectorSource({
        features: new GeoJSON().readFeatures(geoJsonData, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326'
        })
      });

      const extent = vectorSource.getExtent();
      console.log('[MapService] Calculated extent:', extent);

      if (extent && extent !== createEmpty()) {
        const view = this.map.getView();
        view.fit(extent, {
          padding: padding || [50, 50, 50, 50],
          duration: 1000,
          maxZoom: 14 // Don't zoom in too close
        });
        console.log('[MapService] Map fitted to GeoJSON extent');
      } else {
        console.warn('[MapService] Could not calculate valid extent from GeoJSON');
      }
    } catch (error) {
      console.error('[MapService] Failed to fit to GeoJSON extent:', error);
    }
  }

  /**
   * Get the current map instance
   */
  getMap(): OlMap | null {
    console.log('[MapService] getMap() called, returning:', this.map);
    return this.map;
  }

  /**
   * Check if map is initialized
   */
  isMapInitialized(): boolean {
    const initialized = this.isInitialized();
    console.log('[MapService] isMapInitialized() called, returning:', initialized);
    return initialized;
  }

  /**
   * Update map size (call when container size changes)
   */
  updateMapSize(): void {
    console.log('[MapService] updateMapSize() called');
    console.log('[MapService] Current map instance:', this.map);

    if (this.map) {
      console.log('[MapService] Updating map size...');
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        if (this.map) {
          console.log('[MapService] Calling map.updateSize()');
          this.map.updateSize();
          console.log('[MapService] Map size updated');
        } else {
          console.warn('[MapService] Map instance became null during updateSize timeout');
        }
      }, 100);
    } else {
      console.warn('[MapService] Cannot update size - no map instance');
    }
  }

  /**
   * Set map center
   */
  setCenter(coordinates: [number, number], zoom?: number): void {
    console.log('[MapService] setCenter() called');
    console.log('[MapService] Coordinates:', coordinates);
    console.log('[MapService] Zoom:', zoom);
    console.log('[MapService] Current map instance:', this.map);

    if (this.map) {
      const view = this.map.getView();
      console.log('[MapService] Got map view:', view);

      const transformedCoords = fromLonLat(coordinates);
      console.log('[MapService] Transformed coordinates:', transformedCoords);

      view.setCenter(transformedCoords);
      console.log('[MapService] Center set');

      if (zoom !== undefined) {
        view.setZoom(zoom);
        console.log('[MapService] Zoom set to:', zoom);
      }
    } else {
      console.warn('[MapService] Cannot set center - no map instance');
    }
  }

  /**
   * Fit map to specific bounds
   */
  fitToBounds(extent: [number, number, number, number], padding?: number[]): void {
    console.log('[MapService] fitToBounds() called');
    console.log('[MapService] Extent:', extent);
    console.log('[MapService] Padding:', padding);
    console.log('[MapService] Current map instance:', this.map);

    if (this.map) {
      const view = this.map.getView();
      console.log('[MapService] Got map view:', view);

      view.fit(extent, {
        padding: padding || [20, 20, 20, 20],
        duration: 1000
      });
      console.log('[MapService] Fit to bounds completed');
    } else {
      console.warn('[MapService] Cannot fit to bounds - no map instance');
    }
  }

  /**
   * Destroy the map and clean up resources
   */
  destroyMap(): void {
    console.log('[MapService] destroyMap() called');
    console.log('[MapService] Current map instance:', this.map);

    if (this.map) {
      console.log('[MapService] Cleaning up map instance...');

      // Remove all vector layers
      this.vectorLayers.forEach((layer, name) => {
        console.log(`[MapService] Removing vector layer: ${name}`);
        this.map!.removeLayer(layer);
      });
      this.vectorLayers.clear();

      // Clean up highlight layer
      if (this.highlightLayer) {
        console.log('[MapService] Removing highlight layer');
        this.map.removeLayer(this.highlightLayer);
        this.highlightLayer = null;
      }
      if (this.highlightSource) {
        this.highlightSource.clear();
        this.highlightSource = new VectorSource(); // Reset
      }
      this.currentHighlightLocationId = null;

      // Remove all event listeners
      console.log('[MapService] Removing event listeners');
      this.map.un('singleclick', this.handleMapClick);

      // Dispose of the map
      console.log('[MapService] Setting target to undefined');
      this.map.setTarget(undefined);

      console.log('[MapService] Disposing map');
      this.map.dispose();

      this.map = null;
      console.log('[MapService] Map instance set to null');

      this.isInitialized.set(false);
      this.mapInitializedSubject.next(false);

      console.log('[MapService] Map destruction complete');
      console.log('[MapService] isInitialized signal:', this.isInitialized());
      console.log('[MapService] mapInitializedSubject value:', this.mapInitializedSubject.value);
    } else {
      console.log('[MapService] No map instance to destroy');
    }
  }

  /**
   * Add click handler to map
   */
  addClickHandler(handler: (event: any) => void): void {
    console.log('[MapService] addClickHandler() called');
    console.log('[MapService] Handler function:', handler);
    console.log('[MapService] Current map instance:', this.map);

    if (this.map) {
      console.log('[MapService] Adding click handler to map');
      this.map.on('singleclick', handler);
      console.log('[MapService] Click handler added');
    } else {
      console.warn('[MapService] Cannot add click handler - no map instance');
    }
  }

  /**
   * Remove click handler from map
   */
  removeClickHandler(handler: (event: any) => void): void {
    console.log('[MapService] removeClickHandler() called');
    console.log('[MapService] Handler function:', handler);
    console.log('[MapService] Current map instance:', this.map);

    if (this.map) {
      console.log('[MapService] Removing click handler from map');
      this.map.un('singleclick', handler);
      console.log('[MapService] Click handler removed');
    } else {
      console.warn('[MapService] Cannot remove click handler - no map instance');
    }
  }

  /**
   * Default map click handler
   */
  private handleMapClick = (event: any): void => {
    console.log('[MapService] Default map click handler triggered');
    console.log('[MapService] Click event:', event);
    console.log('[MapService] Click coordinate:', event.coordinate);
  };

  /**
   * Get map configurations for different regions
   */
  getRegionConfigs(): { [key: string]: MapConfiguration } {
    const configs = {
      gbr: {
        center: [145.7781, -16.2839] as [number, number],
        zoom: 6
      },
      moore: {
        center: [145.8, -16.5] as [number, number],
        zoom: 10
      },
      global: {
        center: [0, 0] as [number, number],
        zoom: 2
      }
    };
    console.log('[MapService] getRegionConfigs() called, returning:', configs);
    return configs;
  }

  centerOnFeature(feature: Feature, zoom?: number): void {
    console.log('[MapService] centerOnFeature() called');

    if (!this.map || !feature) {
      console.warn('[MapService] Cannot center on feature - no map instance or feature');
      return;
    }

    try {
      const geometry = feature.getGeometry();
      if (!geometry) {
        console.warn('[MapService] Feature has no geometry to center on');
        return;
      }

      // Get the extent of the feature
      const extent = geometry.getExtent();
      console.log('[MapService] Feature extent:', extent);

      // Calculate center point of the feature
      const centerX = (extent[0] + extent[2]) / 2;
      const centerY = (extent[1] + extent[3]) / 2;
      const centerCoordinate = [centerX, centerY];

      console.log('[MapService] Centering on coordinate:', centerCoordinate);

      const view = this.map.getView();

      // Animate to the center point
      view.animate({
        center: centerCoordinate,
        zoom: zoom || view.getZoom(), // Keep current zoom unless specified
        duration: 800, // Smooth 800ms animation
        easing: t => 1 - Math.pow(1 - t, 3) // Ease-out cubic for smooth deceleration
      });

      console.log('[MapService] Center animation initiated');
    } catch (error) {
      console.error('[MapService] Failed to center on feature:', error);
    }
  }
}
