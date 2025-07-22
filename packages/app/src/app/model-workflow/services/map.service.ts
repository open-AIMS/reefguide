// src/app/model-workflow/services/map.service.ts
import { Injectable, signal } from '@angular/core';
import { Map, View } from 'ol';
import { Tile as TileLayer } from 'ol/layer';
import { OSM } from 'ol/source';
import { fromLonLat } from 'ol/proj';
import { BehaviorSubject } from 'rxjs';

export interface MapConfiguration {
  center: [number, number]; // [longitude, latitude]
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
}

@Injectable({
  providedIn: 'root'
})
export class MapService {
  private map: Map | null = null;
  private isInitialized = signal(false);

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
  initializeMap(target: string | HTMLElement, config?: Partial<MapConfiguration>): Map {
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
      this.map = new Map({
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

  /**
   * Get the current map instance
   */
  getMap(): Map | null {
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
}
