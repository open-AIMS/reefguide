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
// Import both libraries for Parquet → Arrow conversion
import * as arrow from 'apache-arrow';
import initWasm, { readParquet } from 'parquet-wasm';
import embed, { Result as VegaResult, VisualizationSpec } from 'vega-embed';

// ===================================TYPES AND INTERFACES======================================

interface CoralCoverData {
  location_id: string;
  mean_relative_cover: number;
}

interface CoralCoverStats {
  min: number;
  max: number;
  mean: number;
  locations: CoralCoverData[];
}

interface SiteData {
  locationId: string;
  meanCover: number;
}

interface TimeSeriesData {
  timestep: number;
  scenario_type: string;
  relative_cover_mean: number;
  relative_cover_min: number;
  relative_cover_max: number;
  relative_cover_ci_lower: number;
  relative_cover_ci_upper: number;
}

// =====================================================
// MAIN COMPONENT
// =====================================================

/**
 * Map Results View Component
 *
 * This component provides a comprehensive view of model simulation results on an interactive map.
 * It displays coral cover data, reef boundaries, and allows users to click on sites to view
 * detailed time series charts.
 *
 * Key Features:
 * - Interactive OpenLayers map with zoom/pan controls
 * - Efficient parquet data loading with in-memory caching
 * - Click-to-view site details with time series charts
 * - Real-time loading states and error handling
 * - Responsive design with proper cleanup
 *
 * Data Flow:
 * 1. Job completion triggers map initialization
 * 2. Spatial (GeoJSON) and coral data (Parquet) load in parallel
 * 3. Parquet data is cached for efficient site chart generation
 * 4. Map styling updates based on coral cover statistics
 * 5. Site clicks immediately show popup with loading spinner
 * 6. Chart renders from cached data without re-downloading
 */
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
  public isLoadingCoralData = signal(false);
  private geoDataError = signal<string | null>(null);
  private coralDataError = signal<string | null>(null);
  private geoDataLoaded = signal(false);
  private coralDataLoaded = signal(false);
  private coralCoverStats = signal<CoralCoverStats | null>(null);
  private cachedArrowTable = signal<arrow.Table | null>(null);
  private resizeObserver?: ResizeObserver;

  // Site selection state
  public selectedSite = signal<SiteData | null>(null);
  private siteTimeSeriesData = signal<TimeSeriesData[]>([]);
  public isLoadingSiteData = signal(false);
  private vegaView: VegaResult | null = null;

  @ViewChild('siteChartContainer', { static: false })
  siteChartContainer?: ElementRef<HTMLDivElement>;

  // Computed properties
  isLoading = computed(
    () => this.isMapLoading() || this.isLoadingGeoData() || this.isLoadingCoralData()
  );
  hasError = computed(
    () => this.mapError() !== null || this.geoDataError() !== null || this.coralDataError() !== null
  );
  errorMessage = computed(
    () => this.mapError() || this.geoDataError() || this.coralDataError() || ''
  );
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

        // Load both spatial and coral cover data after map is initialized
        setTimeout(() => {
          if (this.mapInitialized()) {
            this.loadSpatialData(currentJob);
            this.loadCoralCoverData(currentJob);
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

    // Clean up Vega chart if exists
    if (this.vegaView) {
      this.vegaView.finalize();
    }

    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // Clear cached data
    this.cachedArrowTable.set(null);
    this.coralCoverStats.set(null);

    // Destroy the map
    this.mapService.destroyMap();

    this.destroy$.next();
    this.destroy$.complete();
  }

  // =====================================================
  // MAP INITIALIZATION METHODS
  // =====================================================

  /**
   * Initialize the OpenLayers map with validation and error handling
   */
  private initializeMap(): void {
    const workspaceId = this.workspaceId();

    if (this.mapInitialized()) {
      console.log(`[MapResultsView][${workspaceId}] Map already initialized, skipping`);
      return;
    }

    if (!this.validateMapContainer(workspaceId)) {
      return;
    }

    this.setMapLoadingState(true);

    try {
      const config = this.getMapConfiguration(workspaceId);
      this.createMapInstance(config, workspaceId);
    } catch (error: any) {
      this.handleMapInitializationError(error, workspaceId);
    }
  }

  /**
   * Validate map container element and dimensions
   */
  private validateMapContainer(workspaceId: string): boolean {
    if (!this.mapContainer?.nativeElement) {
      console.warn(`[MapResultsView][${workspaceId}] Map container not available`);
      return false;
    }

    const rect = this.mapContainer.nativeElement.getBoundingClientRect();
    console.log(`[MapResultsView][${workspaceId}] Container dimensions:`, {
      width: rect.width,
      height: rect.height
    });

    if (rect.width === 0 || rect.height === 0) {
      console.warn(`[MapResultsView][${workspaceId}] Container has zero dimensions!`);
    }

    return true;
  }

  /**
   * Get map configuration for selected region
   */
  private getMapConfiguration(workspaceId: string): any {
    const regionConfigs = this.mapService.getRegionConfigs();
    const selectedRegion = this.selectedRegion();
    const config = regionConfigs[selectedRegion] || regionConfigs['gbr'];

    console.log(`[MapResultsView][${workspaceId}] Using config for region:`, selectedRegion);
    return config;
  }

  /**
   * Create map instance and set up handlers
   */
  private createMapInstance(config: any, workspaceId: string): void {
    const containerElement = this.mapContainer!.nativeElement;
    const map = this.mapService.initializeMap(containerElement, config);

    if (!map) {
      throw new Error('Failed to create map instance');
    }

    this.finalizeMapInitialization(workspaceId);
  }

  /**
   * Finalize map initialization and load data
   */
  private finalizeMapInitialization(workspaceId: string): void {
    console.log(`[MapResultsView][${workspaceId}] Map created successfully`);

    this.mapInitialized.set(true);
    this.setMapLoadingState(false);

    // Add click handler
    this.mapService.addClickHandler(this.handleMapClick.bind(this));

    // Load data if available
    this.loadDataIfJobCompleted();
  }

  /**
   * Load spatial and coral data if job is completed
   */
  private loadDataIfJobCompleted(): void {
    const currentJob = this.job();
    if (currentJob && currentJob.status === 'SUCCEEDED') {
      setTimeout(() => {
        this.loadSpatialData(currentJob);
        this.loadCoralCoverData(currentJob);
      }, 100);
    }
  }

  /**
   * Handle map initialization errors
   */
  private handleMapInitializationError(error: any, workspaceId: string): void {
    console.error(`[MapResultsView][${workspaceId}] Failed to initialize map:`, error);
    this.mapError.set('Failed to initialize map: ' + error.message);
    this.setMapLoadingState(false);
  }

  /**
   * Set map loading state and clear errors
   */
  private setMapLoadingState(loading: boolean): void {
    this.isMapLoading.set(loading);
    if (loading) {
      this.mapError.set(null);
    }
  }

  // =====================================================
  // DATA LOADING METHODS
  // =====================================================

  /**
   * Load spatial GeoJSON data from job results
   */
  private loadSpatialData(job: JobDetailsResponse['job']): void {
    const workspaceId = this.workspaceId();

    if (!this.validateDataLoadingPrerequisites(workspaceId, 'spatial')) {
      return;
    }

    const reefBoundariesPath = this.extractPathFromJob(job, 'reef_boundaries_path', workspaceId);
    if (!reefBoundariesPath) {
      return;
    }

    this.setGeoDataLoadingState(true);
    this.requestPresignedUrl(job.id, reefBoundariesPath, workspaceId, 'spatial');
  }

  /**
   * Load and process coral cover data from Parquet file
   */
  private loadCoralCoverData(job: JobDetailsResponse['job']): void {
    const workspaceId = this.workspaceId();

    if (this.coralDataLoaded()) {
      console.log(`[MapResultsView][${workspaceId}] Coral data already loaded, skipping`);
      return;
    }

    const spatialMetricsPath = this.extractPathFromJob(job, 'spatial_metrics_path', workspaceId);
    if (!spatialMetricsPath) {
      return;
    }

    this.setCoralDataLoadingState(true);
    this.requestPresignedUrl(job.id, spatialMetricsPath, workspaceId, 'coral');
  }

  /**
   * Validate prerequisites for data loading
   */
  private validateDataLoadingPrerequisites(
    workspaceId: string,
    dataType: 'spatial' | 'coral'
  ): boolean {
    if (dataType === 'spatial') {
      if (!this.mapInitialized()) {
        console.warn(
          `[MapResultsView][${workspaceId}] Map not initialized, skipping spatial data load`
        );
        return false;
      }
      if (this.geoDataLoaded()) {
        console.log(`[MapResultsView][${workspaceId}] Spatial data already loaded, skipping`);
        return false;
      }
    }
    return true;
  }

  /**
   * Extract file path from job result payload
   */
  private extractPathFromJob(
    job: JobDetailsResponse['job'],
    pathKey: string,
    workspaceId: string
  ): string | null {
    if (!job.assignments || job.assignments.length === 0) {
      console.warn(`[MapResultsView][${workspaceId}] No assignments found in job ${job.id}`);
      return null;
    }

    const resultPayload = job.assignments[0].result?.result_payload as AdriaModelRunResult;
    const path = resultPayload?.[pathKey as keyof AdriaModelRunResult];

    if (!path) {
      console.warn(`[MapResultsView][${workspaceId}] No ${pathKey} found in job results`);
      return null;
    }

    console.log(`[MapResultsView][${workspaceId}] Found ${pathKey}:`, path);
    return path as string;
  }

  /**
   * Request presigned URL for file download
   */
  private requestPresignedUrl(
    jobId: number,
    filePath: string,
    workspaceId: string,
    dataType: 'spatial' | 'coral'
  ): void {
    this.api
      .downloadJobOutput(jobId, filePath)
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => this.handlePresignedUrlError(error, workspaceId, dataType))
      )
      .subscribe(response => {
        if (!response) return;

        const presignedUrl = response.files[filePath];
        if (dataType === 'spatial') {
          this.downloadGeoJSON(presignedUrl, workspaceId);
        } else {
          this.downloadAndProcessParquet(presignedUrl, workspaceId);
        }
      });
  }

  /**
   * Handle presigned URL request errors
   */
  private handlePresignedUrlError(error: any, workspaceId: string, dataType: 'spatial' | 'coral') {
    console.error(`[MapResultsView][${workspaceId}] Failed to get presigned URL:`, error);

    if (dataType === 'spatial') {
      this.geoDataError.set('Failed to get download URL for reef boundaries');
      this.setGeoDataLoadingState(false);
    } else {
      this.coralDataError.set('Failed to get download URL for coral cover data');
      this.setCoralDataLoadingState(false);
    }

    return of(null);
  }

  /**
   * Set geo data loading state
   */
  private setGeoDataLoadingState(loading: boolean): void {
    this.isLoadingGeoData.set(loading);
    if (loading) {
      this.geoDataError.set(null);
    }
  }

  /**
   * Set coral data loading state
   */
  private setCoralDataLoadingState(loading: boolean): void {
    this.isLoadingCoralData.set(loading);
    if (loading) {
      this.coralDataError.set(null);
    }
  }

  /**
   * Download and process Parquet file containing coral cover data
   */
  private async downloadAndProcessParquet(
    presignedUrl: string,
    workspaceId: string
  ): Promise<void> {
    console.log(`[MapResultsView][${workspaceId}] Downloading Parquet from:`, presignedUrl);

    try {
      // Download the Parquet file as ArrayBuffer
      const response = await fetch(presignedUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log(
        `[MapResultsView][${workspaceId}] Downloaded file, size:`,
        arrayBuffer.byteLength
      );

      // Debug: Check what we actually downloaded
      const uint8Array = new Uint8Array(arrayBuffer);
      const firstBytes = Array.from(uint8Array.slice(0, 16))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ');
      const firstChars = new TextDecoder().decode(uint8Array.slice(0, 100));

      console.log(`[MapResultsView][${workspaceId}] First 16 bytes (hex):`, firstBytes);
      console.log(`[MapResultsView][${workspaceId}] First 100 chars:`, firstChars);

      // Check if this looks like HTML (error page)
      if (
        firstChars.toLowerCase().includes('<!doctype') ||
        firstChars.toLowerCase().includes('<html')
      ) {
        throw new Error(
          `Downloaded file appears to be HTML instead of Parquet. Content: ${firstChars.slice(0, 200)}...`
        );
      }

      // Check for Parquet magic bytes (should start with 'PAR1')
      const parquetMagic = new TextDecoder().decode(uint8Array.slice(0, 4));
      console.log(`[MapResultsView][${workspaceId}] File magic bytes:`, parquetMagic);

      if (parquetMagic !== 'PAR1') {
        // Check if it might be at the end (Parquet files have magic bytes at both ends)
        const endMagic = new TextDecoder().decode(uint8Array.slice(-4));
        console.log(`[MapResultsView][${workspaceId}] End magic bytes:`, endMagic);

        if (endMagic !== 'PAR1') {
          throw new Error(
            `File does not appear to be a valid Parquet file. Magic bytes: start='${parquetMagic}', end='${endMagic}'`
          );
        }
      }

      // Initialize parquet-wasm with local WASM file
      try {
        console.log(`[MapResultsView][${workspaceId}] Attempting to initialize parquet-wasm...`);

        // Try to load from assets directory first
        try {
          const wasmResponse = await fetch('wasm/parquet_wasm_bg.wasm');
          if (wasmResponse.ok) {
            await initWasm(wasmResponse);
            console.log(`[MapResultsView][${workspaceId}] parquet-wasm initialized from public`);
          } else {
            throw new Error('WASM file not found in public');
          }
        } catch (assetsError) {
          console.log(
            `[MapResultsView][${workspaceId}] Assets WASM failed, trying default init...`
          );
          await initWasm();
          console.log(
            `[MapResultsView][${workspaceId}] parquet-wasm initialized with default method`
          );
        }
      } catch (wasmError: any) {
        console.error(`[MapResultsView][${workspaceId}] WASM initialization failed:`, wasmError);

        // Provide helpful error message
        if (wasmError.message?.includes('404') || wasmError.message?.includes('Failed to fetch')) {
          throw new Error(
            'WebAssembly module failed to load. Please copy the WASM file to assets: ' +
              'cp node_modules/parquet-wasm/esm/parquet_wasm_bg.wasm public/wasm/'
          );
        }

        throw new Error(`Failed to initialize parquet-wasm: ${wasmError.message}`);
      }

      // Read Parquet file to WASM Arrow table
      console.log(`[MapResultsView][${workspaceId}] Reading Parquet file...`);
      const wasmTable = readParquet(uint8Array);
      console.log(`[MapResultsView][${workspaceId}] Read Parquet file successfully`);

      // Convert WASM Arrow table to JS Arrow table
      const table = arrow.tableFromIPC(wasmTable.intoIPCStream());

      console.log(`[MapResultsView][${workspaceId}] Parsed Arrow table:`, {
        numRows: table.numRows,
        numCols: table.numCols,
        schema: table.schema.toString()
      });

      // Cache the full Arrow table for later use
      this.cachedArrowTable.set(table);

      // Process the data to calculate mean relative cover by location
      const coralCoverStats = this.processCoralCoverData(table, workspaceId);

      // Store the processed data
      this.coralCoverStats.set(coralCoverStats);
      this.coralDataLoaded.set(true);
      this.isLoadingCoralData.set(false);

      // Update map styling if spatial data is already loaded
      if (this.geoDataLoaded()) {
        this.updateMapStyling();
      }

      // Show success message
      this.showSuccessMessage(
        `Coral cover data loaded (${coralCoverStats.locations.length} locations)`
      );
    } catch (error: any) {
      console.error(`[MapResultsView][${workspaceId}] Failed to process Parquet file:`, error);
      this.coralDataError.set('Failed to process coral cover data: ' + error.message);
      this.isLoadingCoralData.set(false);

      // Show error message
      this.showErrorMessage(`Failed to load coral cover data: ${error.message}`, 5000);
    }
  }

  /**
   * Process coral cover data from Arrow table to calculate location-based statistics
   */
  private processCoralCoverData(table: arrow.Table, workspaceId: string): CoralCoverStats {
    console.log(`[MapResultsView][${workspaceId}] Processing coral cover data...`);

    // Extract columns using Apache Arrow API
    const locationIds = table.getChild('locations')?.toArray() as string[];
    const timesteps = table.getChild('timesteps')?.toArray() as number[];
    const scenarioTypes = table.getChild('scenario_types')?.toArray() as string[];
    const relativeCoverMean = table.getChild('relative_cover_mean')?.toArray() as number[];

    if (!locationIds || !relativeCoverMean) {
      throw new Error('Required columns not found in Parquet data');
    }

    console.log(`[MapResultsView][${workspaceId}] Data dimensions:`, {
      rows: table.numRows,
      uniqueLocations: new Set(locationIds).size,
      uniqueTimesteps: new Set(timesteps).size,
      uniqueScenarios: new Set(scenarioTypes).size
    });

    // Group by location_id and calculate mean relative cover
    const locationData = new Map<
      string,
      {
        coverValues: number[];
        timestepCount: number;
      }
    >();

    // Aggregate data by location
    for (let i = 0; i < locationIds.length; i++) {
      const locationId = locationIds[i];
      const cover = relativeCoverMean[i];

      if (!locationData.has(locationId)) {
        locationData.set(locationId, {
          coverValues: [],
          timestepCount: 0
        });
      }

      const data = locationData.get(locationId)!;
      data.coverValues.push(cover);
    }

    // Calculate statistics for each location
    const locations: CoralCoverData[] = [];
    let globalMin = Infinity;
    let globalMax = -Infinity;
    let globalSum = 0;
    let globalCount = 0;

    for (const [locationId, data] of locationData.entries()) {
      const meanCover =
        data.coverValues.reduce((sum, val) => sum + val, 0) / data.coverValues.length;

      locations.push({
        location_id: locationId,
        mean_relative_cover: meanCover
      });

      globalMin = Math.min(globalMin, meanCover);
      globalMax = Math.max(globalMax, meanCover);
      globalSum += meanCover;
      globalCount++;
    }

    const stats: CoralCoverStats = {
      min: globalMin,
      max: globalMax,
      mean: globalSum / globalCount,
      locations: locations
    };

    console.log(`[MapResultsView][${workspaceId}] Coral cover statistics:`, {
      locations: stats.locations.length,
      coverRange: [stats.min, stats.max],
      meanCover: stats.mean
    });

    return stats;
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

        // Update styling if coral data is already loaded
        if (this.coralDataLoaded()) {
          this.updateMapStyling();
        }
      })
      .catch(error => {
        console.error(`[MapResultsView][${workspaceId}] Failed to download GeoJSON:`, error);
        this.geoDataError.set('Failed to download reef boundaries: ' + error.message);
        this.isLoadingGeoData.set(false);
        this.showErrorMessage(`Failed to load reef boundaries: ${error.message}`, 5000);
      });
  }

  /**
   * Create color scale for coral cover visualization
   */
  private getCoralCoverColor(relativeCover: number, stats: CoralCoverStats): string {
    // Normalize value between 0 and 1
    const normalized = (relativeCover - stats.min) / (stats.max - stats.min);

    // Create color gradient from red (low) to green (high)
    // Red: #FF4444, Yellow: #FFAA00, Green: #44AA44
    if (normalized < 0.5) {
      // Red to Yellow
      const factor = normalized * 2;
      const red = Math.round(255);
      const green = Math.round(68 + (170 - 68) * factor);
      const blue = Math.round(68 * (1 - factor));
      return `rgb(${red}, ${green}, ${blue})`;
    } else {
      // Yellow to Green
      const factor = (normalized - 0.5) * 2;
      const red = Math.round(255 * (1 - factor) + 68 * factor);
      const green = Math.round(170);
      const blue = Math.round(68);
      return `rgb(${red}, ${green}, ${blue})`;
    }
  }

  /**
   * Add GeoJSON data as a layer to the OpenLayers map with coral cover styling
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
            width: 1
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
      this.showErrorMessage(`Failed to display reef boundaries: ${error.message}`, 5000);
    }
  }

  /**
   * Update map styling based on coral cover data
   */
  private updateMapStyling(): void {
    const workspaceId = this.workspaceId();
    const stats = this.coralCoverStats();

    if (!stats) {
      console.warn(`[MapResultsView][${workspaceId}] No coral cover stats available for styling`);
      return;
    }

    console.log(`[MapResultsView][${workspaceId}] Updating map styling with coral cover data`);

    try {
      // Create a map of location_id to coral cover for quick lookup
      const coverMap = new Map<string, number>();
      stats.locations.forEach(loc => {
        coverMap.set(loc.location_id, loc.mean_relative_cover);
      });

      // Update the styling function in the map service
      this.mapService.updateGeoJSONStyling('reef-boundaries', feature => {
        // Handle both Feature and RenderFeature types
        let locationId: string | undefined;

        if ('get' in feature && typeof feature.get === 'function') {
          // This is a Feature
          locationId = feature.get('location_id');
        } else if ('getProperties' in feature && typeof feature.getProperties === 'function') {
          // This is a RenderFeature
          const properties = feature.getProperties();
          locationId = properties['location_id'];
        }

        const relativeCover = locationId ? coverMap.get(locationId) : undefined;

        if (relativeCover !== undefined) {
          const fillColor = this.getCoralCoverColor(relativeCover, stats);
          const strokeColor = this.getCoralCoverColor(relativeCover, stats);

          return {
            stroke: {
              color: strokeColor,
              width: 1.5
            },
            fill: {
              color: fillColor.replace('rgb', 'rgba').replace(')', ', 0.7)')
            }
          };
        } else {
          // Default styling for locations without data
          return {
            stroke: {
              color: '#999999',
              width: 1
            },
            fill: {
              color: 'rgba(153, 153, 153, 0.3)'
            }
          };
        }
      });

      console.log(`[MapResultsView][${workspaceId}] Map styling updated successfully`);
    } catch (error: any) {
      console.error(`[MapResultsView][${workspaceId}] Failed to update map styling:`, error);
      this.showErrorMessage(`Failed to apply coral cover styling: ${error.message}`, 5000);
    }
  }

  // =====================================================
  // SITE SELECTION AND CHART MANAGEMENT
  // =====================================================

  /**
   * Load time series data for a specific location
   */
  private async loadSiteTimeSeriesData(locationId: string): Promise<void> {
    const workspaceId = this.workspaceId();
    const stats = this.coralCoverStats();

    if (!this.validateSiteDataPrerequisites(stats, workspaceId)) {
      return;
    }

    try {
      const locationData = this.findLocationData(stats!, locationId);
      if (locationData) {
        this.prepareSiteDisplay(locationId, locationData);
        this.loadAndRenderTimeSeriesChart(locationId);
      }
    } catch (error) {
      this.handleSiteDataError(error, workspaceId);
    }
  }

  /**
   * Validate prerequisites for site data loading
   */
  private validateSiteDataPrerequisites(
    stats: CoralCoverStats | null,
    workspaceId: string
  ): boolean {
    if (!stats) {
      console.warn(`[${workspaceId}] No coral cover stats available`);
      return false;
    }
    return true;
  }

  /**
   * Find location data in coral cover stats
   */
  private findLocationData(stats: CoralCoverStats, locationId: string): CoralCoverData | undefined {
    return stats.locations.find(loc => loc.location_id === locationId);
  }

  /**
   * Prepare site display by clearing previous data and setting new site info
   */
  private prepareSiteDisplay(locationId: string, locationData: CoralCoverData): void {
    // Clear previous chart data immediately
    this.clearChartData();

    // Immediately show the popup with site info
    this.selectedSite.set({
      locationId: locationId,
      meanCover: locationData.mean_relative_cover
    });
  }

  /**
   * Clear existing chart data and DOM elements
   */
  private clearChartData(): void {
    this.siteTimeSeriesData.set([]);

    if (this.vegaView) {
      this.vegaView.finalize();
      this.vegaView = null;
    }

    if (this.siteChartContainer?.nativeElement) {
      this.siteChartContainer.nativeElement.innerHTML = '';
    }
  }

  /**
   * Handle site data loading errors
   */
  private handleSiteDataError(error: any, workspaceId: string): void {
    console.error(`[${workspaceId}] Failed to load site data:`, error);
    this.showErrorMessage('Failed to load site data');
  }

  // =====================================================
  // UTILITY AND HELPER METHODS
  // =====================================================

  /**
   * Show error message using snackbar
   */
  private showErrorMessage(message: string, duration: number = 3000): void {
    this.snackBar.open(message, 'Dismiss', {
      duration,
      horizontalPosition: 'right',
      verticalPosition: 'bottom'
    });
  }

  /**
   * Show success message using snackbar
   */
  private showSuccessMessage(message: string, duration: number = 3000): void {
    this.snackBar.open(message, 'Dismiss', {
      duration,
      horizontalPosition: 'right',
      verticalPosition: 'bottom'
    });
  }

  /**
   * Reset all component state to initial values
   */
  private resetComponentState(): void {
    this.mapInitialized.set(false);
    this.isMapLoading.set(true);
    this.mapError.set(null);
    this.isLoadingGeoData.set(false);
    this.isLoadingCoralData.set(false);
    this.geoDataError.set(null);
    this.coralDataError.set(null);
    this.geoDataLoaded.set(false);
    this.coralDataLoaded.set(false);
    this.coralCoverStats.set(null);
    this.cachedArrowTable.set(null);
  }

  /**
   * Load, filter, and render time series chart for a specific location using cached Arrow table.
   */
  private async loadAndRenderTimeSeriesChart(locationId: string): Promise<void> {
    const workspaceId = this.workspaceId();
    const cachedTable = this.cachedArrowTable();

    // Check if we have the cached table
    if (!cachedTable) {
      this.showErrorMessage(
        'Coral cover data not yet loaded. Please wait for coral cover data to finish loading'
      );
      this.isLoadingSiteData.set(false);
      return;
    }

    console.log(`[${workspaceId}] Loading time series for location ${locationId} from cached data`);
    this.isLoadingSiteData.set(true);

    // Use setTimeout to make this non-blocking and allow UI to update
    setTimeout(async () => {
      try {
        const timestep = cachedTable.getChild('timesteps')?.toArray() as number[];
        const locationIds = cachedTable.getChild('locations')?.toArray() as string[];
        const relativeCoverMean = cachedTable
          .getChild('relative_cover_mean')
          ?.toArray() as number[];
        const relativeCoverMin = cachedTable.getChild('relative_cover_min')?.toArray() as number[];
        const relativeCoverMax = cachedTable.getChild('relative_cover_max')?.toArray() as number[];
        const relativeCoverCiLower = cachedTable
          .getChild('relative_cover_ci_lower')
          ?.toArray() as number[];
        const relativeCoverCiUpper = cachedTable
          .getChild('relative_cover_ci_upper')
          ?.toArray() as number[];
        const scenarioType = cachedTable.getChild('scenario_types')?.toArray() as string[];
        const timeSeries: TimeSeriesData[] = [];

        for (let i = 0; i < locationIds.length; i++) {
          if (locationIds[i] === locationId) {
            timeSeries.push({
              timestep: Number(timestep[i]),
              scenario_type: scenarioType[i],
              relative_cover_mean: Number(relativeCoverMean[i]),
              relative_cover_min: Number(relativeCoverMin[i]),
              relative_cover_max: Number(relativeCoverMax[i]),
              relative_cover_ci_lower: Number(relativeCoverCiLower[i]),
              relative_cover_ci_upper: Number(relativeCoverCiUpper[i])
            });
          }
        }

        this.siteTimeSeriesData.set(timeSeries);

        // Render the chart after a small delay to ensure DOM is ready
        setTimeout(() => {
          this.renderVegaChart();
          this.isLoadingSiteData.set(false);
        }, 100);
      } catch (error: any) {
        console.error(
          `[${workspaceId}] Failed to process time series data for location ${locationId}:`,
          error
        );
        this.showErrorMessage(`Error loading data for location ${locationId}: ${error.message}`);
        this.isLoadingSiteData.set(false);
        this.clearSelectedSite();
      }
    }, 10);
  }

  /**
   * Render Vega-Lite chart for site time series
   */
  private renderVegaChart(): void {
    if (!this.siteChartContainer?.nativeElement) {
      console.warn('Chart container not available');
      return;
    }

    const container = this.siteChartContainer.nativeElement;
    const data = this.siteTimeSeriesData();
    console.log(data);

    if (data.length === 0) {
      console.warn('No time series data to render');
      return;
    }

    // Clear previous chart
    if (this.vegaView) {
      this.vegaView.finalize();
      container.innerHTML = '';
    }

    // NOTE: This spec assumes you are passing the `aggregatedData` from the function above.
    const spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      width: 'container',
      height: 350,
      // Use the pre-aggregated data
      data: { values: data },
      encoding: {
        // Shared X-axis for all layers
        x: {
          field: 'timestep',
          type: 'ordinal',
          title: 'Year',
          axis: { format: 'd' },
          scale: { zero: false }
        },
        // Shared color scheme for all layers
        color: {
          field: 'scenario_type',
          type: 'nominal',
          title: 'Scenario Type',
          scale: {
            domain: ['guided', 'unguided', 'counterfactual'],
            range: ['#2196F3', '#FF9800', '#F44336']
          },
          legend: {
            orient: 'top',
            direction: 'horizontal',
            title: null
          }
        }
      },
      layer: [
        {
          // Layer 1: Confidence Band (using the pre-calculated ci fields)
          mark: { type: 'area', opacity: 0.3 },
          encoding: {
            y: {
              field: 'relative_cover_ci_lower',
              type: 'quantitative',
              title: 'Relative Coral Cover'
            },
            y2: {
              field: 'relative_cover_ci_upper'
            }
          }
        },
        {
          // Layer 2: Mean Trend Line (using the pre-calculated mean field)
          mark: { type: 'line', strokeWidth: 2.5, interpolate: 'monotone' },
          encoding: {
            y: {
              field: 'relative_cover_mean',
              type: 'quantitative'
            }
          }
        },
        {
          // Layer 3: Invisible tooltip rule
          mark: { type: 'rule', stroke: 'transparent' },
          encoding: {
            tooltip: [
              { field: 'timestep', type: 'quantitative', title: 'Year', format: 'd' },
              { field: 'scenario_type', type: 'nominal', title: 'Scenario' },
              {
                field: 'relative_cover_mean',
                type: 'quantitative',
                title: 'Mean Cover',
                format: '.1%'
              },
              {
                field: 'relative_cover_ci_lower',
                type: 'quantitative',
                title: 'CI Lower',
                format: '.1%'
              },
              {
                field: 'relative_cover_ci_upper',
                type: 'quantitative',
                title: 'CI Upper',
                format: '.1%'
              }
            ]
          }
        }
      ],
      config: {
        view: { stroke: 'transparent' },
        axis: { domainColor: '#ccc', tickColor: '#ccc', gridColor: '#eee' }
      }
    } satisfies VisualizationSpec;
    // Render the chart
    embed(container, spec, {
      theme: 'quartz',
      renderer: 'canvas',
      actions: {
        export: true,
        source: false,
        compiled: false,
        editor: true
      }
    })
      .then(result => {
        this.vegaView = result;
        console.log('Vega chart rendered successfully');
      })
      .catch(error => {
        console.error('Failed to render Vega chart:', error);
      });
  }

  /**
   * Clear selected site and chart
   */
  clearSelectedSite(): void {
    this.selectedSite.set(null);
    this.siteTimeSeriesData.set([]);
    this.isLoadingSiteData.set(false);

    // NEW: Clear map highlight
    this.mapService.clearHighlight();

    if (this.vegaView) {
      this.vegaView.finalize();
      this.vegaView = null;
    }

    if (this.siteChartContainer?.nativeElement) {
      this.siteChartContainer.nativeElement.innerHTML = '';
    }
  }

  /**
   * Create a brighter version of a color for highlighting
   */
  private brightenColor(color: string, factor: number = 0.3): string {
    // Parse RGB color string like "rgb(255, 170, 68)"
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!rgbMatch) {
      return color; // Return original if parsing fails
    }

    let [, r, g, b] = rgbMatch.map(Number);

    // Brighten by moving towards white
    r = Math.min(255, Math.round(r + (255 - r) * factor));
    g = Math.min(255, Math.round(g + (255 - g) * factor));
    b = Math.min(255, Math.round(b + (255 - b) * factor));

    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Get coral cover color for a location (EXTRACTED as separate method)
   */
  private getCoralCoverColorForLocation(locationId: string): string {
    const stats = this.coralCoverStats();
    if (!stats) {
      return '#999999'; // Default gray
    }

    const locationData = stats.locations.find(loc => loc.location_id === locationId);
    if (!locationData) {
      return '#999999'; // Default gray
    }

    return this.getCoralCoverColor(locationData.mean_relative_cover, stats);
  }

  /**
   * Handle map click events (MODIFIED)
   */
  private handleMapClick(event: any): void {
    console.log(`[${this.workspaceId()}] Map clicked at:`, event.coordinate);

    // Try to get feature information at click location
    const features = this.mapService.getFeaturesAtPixel(event.pixel);
    if (features && features.length > 0) {
      const feature = features[0];
      let locationId: string | undefined;

      // Handle different feature types
      if ('get' in feature && typeof feature.get === 'function') {
        locationId = feature.get('location_id');
      } else if ('getProperties' in feature && typeof feature.getProperties === 'function') {
        const properties = feature.getProperties();
        locationId = properties['location_id'];
      }

      const stats = this.coralCoverStats();

      if (locationId && stats) {
        const locationData = stats.locations.find(loc => loc.location_id === locationId);
        if (locationData) {
          console.log(`[${this.workspaceId()}] Clicked location ${locationId}:`, locationData);

          // NEW: Center the map on the clicked feature
          this.mapService.centerOnFeature(feature);

          // NEW: Highlight the clicked feature with matching color
          const baseColor = this.getCoralCoverColorForLocation(locationId);
          const brightStrokeColor = this.brightenColor(baseColor, 0.4); // 40% brighter

          this.mapService.highlightFeature(feature, {
            strokeColor: brightStrokeColor,
            strokeWidth: 4, // Thinner stroke
            fillColor: undefined // No fill, just the boundary
          });

          // Track the highlighted location
          this.mapService.setCurrentHighlightLocationId(locationId);

          // Load time series data for this location
          this.loadSiteTimeSeriesData(locationId);
        }
      }
    } else {
      // NEW: Clear selection if clicking on empty space
      this.mapService.clearHighlight();
      this.clearSelectedSite();
    }

    // Emit map interaction for parent component
    this.mapInteraction.emit({
      type: 'click',
      coordinate: event.coordinate,
      pixel: event.pixel,
      features: features
    });
  }

  // =====================================================
  // JOB PROCESSING METHODS
  // =====================================================

  /**
   * Process job results to extract and log available data
   */
  private processJobResults(job: JobDetailsResponse['job']): void {
    const workspaceId = this.workspaceId();
    console.log(`[${workspaceId}] Processing job results for map view:`, job.id);

    try {
      const resultPayload = this.extractResultPayload(job, workspaceId);
      if (resultPayload) {
        this.logAvailableData(resultPayload, workspaceId);
      }
    } catch (error) {
      console.error(`[${workspaceId}] Failed to process job results for map:`, error);
    }
  }

  /**
   * Extract result payload from job
   */
  private extractResultPayload(
    job: JobDetailsResponse['job'],
    workspaceId: string
  ): AdriaModelRunResult | null {
    if (!job.assignments || job.assignments.length === 0) {
      console.warn(`[${workspaceId}] No assignments found in job ${job.id}`);
      return null;
    }

    return job.assignments[0].result?.result_payload as AdriaModelRunResult;
  }

  /**
   * Log available data paths from result payload
   */
  private logAvailableData(resultPayload: AdriaModelRunResult, workspaceId: string): void {
    console.log(`[${workspaceId}] Job result payload:`, Object.keys(resultPayload || {}));
    console.log(`[${workspaceId}] Available spatial data:`, {
      spatial_metrics_path: resultPayload.spatial_metrics_path,
      reef_boundaries_path: resultPayload.reef_boundaries_path
    });
  }

  /**
   * Clear map data when job changes
   */
  private clearMapData(): void {
    console.log(`[${this.workspaceId()}] Clearing map data`);

    this.resetComponentState();
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
