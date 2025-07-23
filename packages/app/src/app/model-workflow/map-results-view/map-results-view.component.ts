import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  ViewChild
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdriaModelRunResult, JobDetailsResponse } from '@reefguide/types';
import { Subject, takeUntil, catchError, of } from 'rxjs';
import { MapService } from '../services/map.service';
import { WebApiService } from '../../../api/web-api.service';

@Component({
  selector: 'app-map-results-view',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  templateUrl: './map-results-view.component.html',
  styleUrl: './map-results-view.component.scss'
})
export class MapResultsViewComponent implements AfterViewInit, OnDestroy {
  private readonly mapService = inject(MapService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly api = inject(WebApiService);
  private readonly destroy$ = new Subject<void>();

  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef<HTMLDivElement>;

  // Inputs (similar to results-view for future compatibility)
  job = input<JobDetailsResponse['job'] | undefined>();
  workspaceId = input<string>('');
  initialMapConfig = input<any>(null);

  // Outputs for future extensibility
  mapInteraction = output<any>();
  mapConfigChanged = output<any>();

  // State
  public isMapLoading = signal(true);
  private mapError = signal<string | null>(null);
  public mapInitialized = signal(false);
  public isLoadingGeoData = signal(false);
  private geoDataError = signal<string | null>(null);
  private geoDataLoaded = signal(false);
  private resizeObserver?: ResizeObserver;

  // Computed properties
  isLoading = computed(() => this.isMapLoading() || this.isLoadingGeoData());
  hasError = computed(() => this.mapError() !== null || this.geoDataError() !== null);
  errorMessage = computed(() => this.mapError() || this.geoDataError() || '');
  hasJobResults = computed(() => {
    console.log(`[MapResultsView] Checking for job results`);
    const currentJob = this.job();
    const hasJobs = currentJob && currentJob.status === 'SUCCEEDED';
    console.log(`[MapResultsView] Job has results:`, hasJobs);
    console.log(`[MapResultsView] Current job:`, currentJob);
    return hasJobs;
  });

  // Available map regions for testing
  mapRegions = [
    { value: 'gbr', label: 'Great Barrier Reef' },
    { value: 'moore', label: 'Moore Reef Cluster' },
    { value: 'global', label: 'Global View' }
  ];

  selectedRegion = signal('gbr');

  constructor() {
    // Effect to initialize map when component is ready and job has results
    effect(() => {
      const hasResults = this.hasJobResults();
      const isInitialized = this.mapInitialized();

      if (hasResults && !isInitialized) {
        // Delay initialization to ensure DOM is ready
        setTimeout(() => {
          this.initializeMap();
        }, 100);
      }
    });

    // Effect to handle job changes and load geodata
    effect(() => {
      const currentJob = this.job();
      console.log(`[${this.workspaceId()}] Map view job changed:`, currentJob?.id);

      if (currentJob && currentJob.status === 'SUCCEEDED') {
        this.processJobResults(currentJob);

        // Load geodata after map is initialized
        setTimeout(() => {
          if (this.mapInitialized()) {
            this.loadGeoData(currentJob);
          }
        }, 200);
      } else {
        this.clearMapData();
      }
    });
  }

  ngAfterViewInit(): void {
    this.setupResizeObserver();

    // If we already have job results, initialize the map
    if (this.hasJobResults()) {
      setTimeout(() => {
        this.initializeMap();
      }, 100);
    }
  }

  ngOnDestroy(): void {
    console.log(`[${this.workspaceId()}] Destroying map view component`);

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // Destroy the map
    this.mapService.destroyMap();

    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize the OpenLayers map
   */
  private initializeMap(): void {
    const workspaceId = this.workspaceId();
    const isInitialized = this.mapInitialized();

    console.log(`[MapResultsView][${workspaceId}] initializeMap() called`);
    console.log(`[MapResultsView][${workspaceId}] Already initialized:`, isInitialized);

    if (isInitialized) {
      console.log(`[MapResultsView][${workspaceId}] Map already initialized, skipping`);
      return;
    }

    console.log(`[MapResultsView][${workspaceId}] Checking map container...`);
    console.log(`[MapResultsView][${workspaceId}] MapContainer ViewChild:`, this.mapContainer);

    if (!this.mapContainer?.nativeElement) {
      console.warn(`[MapResultsView][${workspaceId}] Map container not available`);
      console.warn(`[MapResultsView][${workspaceId}] - mapContainer:`, this.mapContainer);
      console.warn(
        `[MapResultsView][${workspaceId}] - nativeElement:`,
        this.mapContainer?.nativeElement
      );
      return;
    }

    const containerElement = this.mapContainer.nativeElement;
    console.log(`[MapResultsView][${workspaceId}] Container element:`, containerElement);
    console.log(`[MapResultsView][${workspaceId}] Container ID:`, containerElement.id);
    console.log(`[MapResultsView][${workspaceId}] Container class:`, containerElement.className);

    // Check container dimensions
    const rect = containerElement.getBoundingClientRect();
    console.log(`[MapResultsView][${workspaceId}] Container dimensions:`, {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left
    });

    if (rect.width === 0 || rect.height === 0) {
      console.warn(`[MapResultsView][${workspaceId}] Container has zero dimensions!`);
    }

    console.log(`[MapResultsView][${workspaceId}] Setting loading state...`);
    this.isMapLoading.set(true);
    this.mapError.set(null);

    try {
      console.log(`[MapResultsView][${workspaceId}] Getting region config...`);
      // Get configuration for selected region
      const regionConfigs = this.mapService.getRegionConfigs();
      const selectedRegion = this.selectedRegion();
      console.log(`[MapResultsView][${workspaceId}] Selected region:`, selectedRegion);

      console.log(`[MapResultsView][${workspaceId}] Available region configs:`, regionConfigs);

      const config = regionConfigs[selectedRegion] || regionConfigs['gbr'];
      console.log(`[MapResultsView][${workspaceId}] Using config:`, config);

      console.log(`[MapResultsView][${workspaceId}] Initializing map via service...`);
      // Initialize the map
      const map = this.mapService.initializeMap(containerElement, config);
      console.log(`[MapResultsView][${workspaceId}] Map service returned:`, map);

      if (map) {
        console.log(
          `[MapResultsView][${workspaceId}] Map created successfully, setting up handlers...`
        );
        this.mapInitialized.set(true);
        this.isMapLoading.set(false);

        // Add click handler for demonstration
        console.log(`[MapResultsView][${workspaceId}] Adding click handler...`);
        this.mapService.addClickHandler(this.handleMapClick.bind(this));

        console.log(`[MapResultsView][${workspaceId}] Map initialization complete`);

        // Load geodata if we have a completed job
        const currentJob = this.job();
        if (currentJob && currentJob.status === 'SUCCEEDED') {
          setTimeout(() => {
            this.loadGeoData(currentJob);
          }, 100);
        }
      } else {
        console.error(`[MapResultsView][${workspaceId}] Map service returned null/undefined`);
        throw new Error('Failed to create map instance');
      }
    } catch (error: any) {
      console.error(`[MapResultsView][${workspaceId}] Failed to initialize map:`, error);
      console.error(`[MapResultsView][${workspaceId}] Error stack:`, error.stack);
      this.mapError.set('Failed to initialize map: ' + error.message);
      this.isMapLoading.set(false);
    }
  }

  /**
   * Load GeoJSON data from job results
   */
  private loadGeoData(job: JobDetailsResponse['job']): void {
    const workspaceId = this.workspaceId();
    console.log(`[MapResultsView][${workspaceId}] Loading geodata for job:`, job.id);

    if (!this.mapInitialized()) {
      console.warn(`[MapResultsView][${workspaceId}] Map not initialized, skipping geodata load`);
      return;
    }

    if (this.geoDataLoaded()) {
      console.log(`[MapResultsView][${workspaceId}] Geodata already loaded, skipping`);
      return;
    }

    try {
      if (!job.assignments || job.assignments.length === 0) {
        console.warn(`[MapResultsView][${workspaceId}] No assignments found in job ${job.id}`);
        return;
      }

      const resultPayload = job.assignments[0].result?.result_payload as AdriaModelRunResult;

      if (!resultPayload || !resultPayload.reef_boundaries_path) {
        console.warn(
          `[MapResultsView][${workspaceId}] No reef boundaries path found in job results`
        );
        return;
      }

      const reefBoundariesPath = resultPayload.reef_boundaries_path;
      console.log(
        `[MapResultsView][${workspaceId}] Found reef boundaries path:`,
        reefBoundariesPath
      );

      this.isLoadingGeoData.set(true);
      this.geoDataError.set(null);

      // Step 1: Get presigned URL for the GeoJSON file
      console.log(
        `[MapResultsView][${workspaceId}] Requesting presigned URL for:`,
        reefBoundariesPath
      );

      this.api
        .downloadJobOutput(job.id, reefBoundariesPath)
        .pipe(
          takeUntil(this.destroy$),
          catchError(error => {
            console.error(`[MapResultsView][${workspaceId}] Failed to get presigned URL:`, error);
            this.geoDataError.set('Failed to get download URL for reef boundaries');
            this.isLoadingGeoData.set(false);
            return of(null);
          })
        )
        .subscribe(response => {
          if (!response) return;

          console.log(`[MapResultsView][${workspaceId}] Got presigned URL response:`, response);

          // Step 2: Download the GeoJSON file using the presigned URL
          this.downloadGeoJSON(response.files[reefBoundariesPath], workspaceId);
        });
    } catch (error: any) {
      console.error(`[MapResultsView][${workspaceId}] Failed to load geodata:`, error);
      this.geoDataError.set('Failed to load reef boundaries: ' + error.message);
      this.isLoadingGeoData.set(false);
    }
  }

  /**
   * Download GeoJSON file and add to map
   */
  private downloadGeoJSON(presignedUrl: string, workspaceId: string): void {
    console.log(`[MapResultsView][${workspaceId}] Downloading GeoJSON from:`, presignedUrl);

    fetch(presignedUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(geoJsonData => {
        console.log(
          `[MapResultsView][${workspaceId}] Successfully downloaded GeoJSON:`,
          geoJsonData
        );

        // Step 3: Add GeoJSON layer to the map
        this.addGeoJSONToMap(geoJsonData, workspaceId);

        this.geoDataLoaded.set(true);
        this.isLoadingGeoData.set(false);

        // Show success message
        this.snackBar.open('Reef boundaries loaded successfully', 'Dismiss', {
          duration: 3000,
          horizontalPosition: 'right',
          verticalPosition: 'bottom'
        });
      })
      .catch(error => {
        console.error(`[MapResultsView][${workspaceId}] Failed to download GeoJSON:`, error);
        this.geoDataError.set('Failed to download reef boundaries: ' + error.message);
        this.isLoadingGeoData.set(false);

        // Show error message
        this.snackBar.open('Failed to load reef boundaries', 'Dismiss', {
          duration: 5000,
          horizontalPosition: 'right',
          verticalPosition: 'bottom'
        });
      });
  }

  /**
   * Add GeoJSON data as a layer to the OpenLayers map
   */
  private addGeoJSONToMap(geoJsonData: any, workspaceId: string): void {
    console.log(`[MapResultsView][${workspaceId}] Adding GeoJSON layer to map`);

    try {
      // Add the GeoJSON layer through the map service
      this.mapService.addGeoJSONLayer(geoJsonData, {
        layerName: 'reef-boundaries',
        style: {
          stroke: {
            color: '#2196F3',
            width: 2
          },
          fill: {
            color: 'rgba(33, 150, 243, 0.1)'
          }
        },
        zIndex: 10
      });

      // Optionally fit the map view to the GeoJSON extent
      this.mapService.fitToGeoJSONExtent(geoJsonData);

      console.log(`[MapResultsView][${workspaceId}] GeoJSON layer added successfully`);
    } catch (error: any) {
      console.error(`[MapResultsView][${workspaceId}] Failed to add GeoJSON to map:`, error);
      this.geoDataError.set('Failed to display reef boundaries on map');

      // Show error message
      this.snackBar.open('Failed to display reef boundaries', 'Dismiss', {
        duration: 5000,
        horizontalPosition: 'right',
        verticalPosition: 'bottom'
      });
    }
  }

  /**
   * Handle map click events
   */
  private handleMapClick(event: any): void {
    console.log(`[${this.workspaceId()}] Map clicked at:`, event.coordinate);
    // Emit map interaction for parent component
    this.mapInteraction.emit({
      type: 'click',
      coordinate: event.coordinate,
      pixel: event.pixel
    });
  }

  /**
   * Process job results to extract map data
   */
  private processJobResults(job: JobDetailsResponse['job']): void {
    console.log(`[${this.workspaceId()}] Processing job results for map view:`, job.id);

    try {
      if (!job.assignments || job.assignments.length === 0) {
        console.warn(`[${this.workspaceId()}] No assignments found in job ${job.id}`);
        return;
      }

      const resultPayload = job.assignments[0].result?.result_payload as AdriaModelRunResult;

      console.log(`[${this.workspaceId()}] Job result payload:`, Object.keys(resultPayload || {}));

      if (resultPayload) {
        console.log(`[${this.workspaceId()}] Available spatial data:`, {
          spatial_metrics_path: resultPayload.spatial_metrics_path,
          reef_boundaries_path: resultPayload.reef_boundaries_path
        });
      }

      // TODO: Extract and process spatial metrics data for additional map display
      // This could include:
      // - Processing spatial_metrics_path parquet file
      // - Adding point data or heatmaps based on metrics
      // - Creating interactive popups with metric data
    } catch (error) {
      console.error(`[${this.workspaceId()}] Failed to process job results for map:`, error);
    }
  }

  /**
   * Clear map data when job changes
   */
  private clearMapData(): void {
    console.log(`[${this.workspaceId()}] Clearing map data`);

    // Reset state
    this.mapInitialized.set(false);
    this.isMapLoading.set(true);
    this.mapError.set(null);
    this.isLoadingGeoData.set(false);
    this.geoDataError.set(null);
    this.geoDataLoaded.set(false);

    // Destroy existing map
    this.mapService.destroyMap();
  }

  /**
   * Set up resize observer to handle container size changes
   */
  private setupResizeObserver(): void {
    const workspaceId = this.workspaceId();
    console.log(`[MapResultsView][${workspaceId}] Setting up ResizeObserver`);

    if (typeof ResizeObserver === 'undefined') {
      console.warn(`[MapResultsView][${workspaceId}] ResizeObserver not supported`);
      return;
    }

    this.resizeObserver = new ResizeObserver(entries => {
      console.log(`[MapResultsView][${workspaceId}] ResizeObserver triggered`);
      console.log(`[MapResultsView][${workspaceId}] Resize entries:`, entries);

      // Check if any of the observed elements have changed size
      entries.forEach((entry, index) => {
        console.log(`[MapResultsView][${workspaceId}] Entry ${index}:`, {
          target: entry.target,
          contentRect: entry.contentRect,
          borderBoxSize: entry.borderBoxSize,
          contentBoxSize: entry.contentBoxSize
        });
      });

      // this.resizeSubject$.next();
    });

    // Observe the map container
    if (!this.mapContainer?.nativeElement) {
      console.warn(`[MapResultsView][${workspaceId}] Cannot observe - map container not available`);
      return;
    }

    const element = this.mapContainer.nativeElement;
    console.log(`[MapResultsView][${workspaceId}] Observing element:`, element);

    this.resizeObserver.observe(element);
    console.log(`[MapResultsView][${workspaceId}] ResizeObserver attached to map container`);
  }

  /**
   * Handle region selection change
   */
  onRegionChange(region: string): void {
    const workspaceId = this.workspaceId();
    console.log(`[MapResultsView][${workspaceId}] Region change requested`);
    console.log(`[MapResultsView][${workspaceId}] New region:`, region);
    console.log(`[MapResultsView][${workspaceId}] Current region:`, this.selectedRegion());
    console.log(`[MapResultsView][${workspaceId}] Map initialized:`, this.mapInitialized());

    this.selectedRegion.set(region);
    console.log(`[MapResultsView][${workspaceId}] Region signal updated`);

    if (this.mapInitialized()) {
      console.log(`[MapResultsView][${workspaceId}] Map is initialized, updating view...`);
      // Update map center based on selected region
      const regionConfigs = this.mapService.getRegionConfigs();
      const config = regionConfigs[region];
      console.log(`[MapResultsView][${workspaceId}] Region config:`, config);

      if (config) {
        console.log(`[MapResultsView][${workspaceId}] Setting map center...`);
        this.mapService.setCenter(config.center, config.zoom);

        const configEvent = { region, config };
        console.log(`[MapResultsView][${workspaceId}] Emitting map config changed:`, configEvent);
        this.mapConfigChanged.emit(configEvent);
      } else {
        console.warn(`[MapResultsView][${workspaceId}] No config found for region:`, region);
      }
    } else {
      console.log(
        `[MapResultsView][${workspaceId}] Map not initialized, region change will apply on next init`
      );
    }
  }

  /**
   * Retry map initialization
   */
  retryMapInitialization(): void {
    const workspaceId = this.workspaceId();
    console.log(`[MapResultsView][${workspaceId}] Retry map initialization requested`);

    this.clearMapData();

    setTimeout(() => {
      console.log(`[MapResultsView][${workspaceId}] Executing retry initialization...`);
      this.initializeMap();
    }, 100);
  }

  /**
   * Reset map to default view
   */
  resetMapView(): void {
    const workspaceId = this.workspaceId();
    console.log(`[MapResultsView][${workspaceId}] Reset map view requested`);
    console.log(`[MapResultsView][${workspaceId}] Map initialized:`, this.mapInitialized());
    console.log(`[MapResultsView][${workspaceId}] Selected region:`, this.selectedRegion());

    if (this.mapInitialized()) {
      const regionConfigs = this.mapService.getRegionConfigs();
      const config = regionConfigs[this.selectedRegion()];
      console.log(`[MapResultsView][${workspaceId}] Reset config:`, config);

      if (config) {
        console.log(
          `[MapResultsView][${workspaceId}] Resetting to center:`,
          config.center,
          'zoom:',
          config.zoom
        );
        this.mapService.setCenter(config.center, config.zoom);
      } else {
        console.warn(`[MapResultsView][${workspaceId}] No config available for reset`);
      }
    } else {
      console.warn(`[MapResultsView][${workspaceId}] Cannot reset - map not initialized`);
    }
  }
}
