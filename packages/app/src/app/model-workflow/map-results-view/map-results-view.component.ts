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

interface CoralCoverData {
  location_id: string;
  mean_relative_cover: number;
  timestep_count: number;
  scenario_count: number;
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
  timesteps: number;
  scenarios: number;
  dataPoints: number;
}

interface TimeSeriesData {
  timestep: number;
  scenario_type: string;
  relative_cover: number;
}

/**
 * Aggregates time series data by timestep and scenario type.
 *
 * For each group, it calculates the mean, min, and max of relative_cover.
 * This is perfect for summarizing ensemble model runs before visualization.
 *
 * @param {TimeSeriesData[]} data - The raw, flat time series data.
 * @returns {AggregatedTimeSeriesData[]} - The aggregated data.
 */
interface AggregatedTimeSeriesData {
  timestep: number;
  scenario_type: string;
  mean_cover: number;
  min_cover: number;
  max_cover: number;
}

function aggregateTimeSeriesData(data: TimeSeriesData[]): AggregatedTimeSeriesData[] {
  if (!data || data.length === 0) {
    return [];
  }

  // Use a Map to group data points by a composite key.
  // Key format: "timestep-scenario_type" (e.g., "2025-guided")
  const groupedData = new Map<string, number[]>();

  for (const point of data) {
    const key = `${point.timestep}-${point.scenario_type}`;
    if (!groupedData.has(key)) {
      groupedData.set(key, []);
    }
    groupedData.get(key)!.push(point.relative_cover);
  }

  // Now, process the grouped data to calculate statistics.
  const aggregatedResult: AggregatedTimeSeriesData[] = [];
  for (const [key, values] of groupedData.entries()) {
    const [timestep, scenario_type] = key.split('-');

    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    aggregatedResult.push({
      timestep: Number(timestep),
      scenario_type,
      mean_cover: mean,
      min_cover: min,
      max_cover: max
    });
  }

  // Sort the final result for clean line drawing (important for Vega-Lite)
  return aggregatedResult.sort((a, b) => a.timestep - b.timestep);
}

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
  private siteTimeSeriesData = signal<AggregatedTimeSeriesData[]>([]);
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

    if (!this.mapContainer?.nativeElement) {
      console.warn(`[MapResultsView][${workspaceId}] Map container not available`);
      return;
    }

    const containerElement = this.mapContainer.nativeElement;
    console.log(`[MapResultsView][${workspaceId}] Container element:`, containerElement);

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

        // Load data if we have a completed job
        const currentJob = this.job();
        if (currentJob && currentJob.status === 'SUCCEEDED') {
          setTimeout(() => {
            this.loadSpatialData(currentJob);
            this.loadCoralCoverData(currentJob);
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
   * Load spatial GeoJSON data from job results
   */
  private loadSpatialData(job: JobDetailsResponse['job']): void {
    const workspaceId = this.workspaceId();
    console.log(`[MapResultsView][${workspaceId}] Loading spatial data for job:`, job.id);

    if (!this.mapInitialized()) {
      console.warn(
        `[MapResultsView][${workspaceId}] Map not initialized, skipping spatial data load`
      );
      return;
    }

    if (this.geoDataLoaded()) {
      console.log(`[MapResultsView][${workspaceId}] Spatial data already loaded, skipping`);
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
      console.error(`[MapResultsView][${workspaceId}] Failed to load spatial data:`, error);
      this.geoDataError.set('Failed to load reef boundaries: ' + error.message);
      this.isLoadingGeoData.set(false);
    }
  }

  /**
   * Load and process coral cover data from Parquet file
   */
  private loadCoralCoverData(job: JobDetailsResponse['job']): void {
    const workspaceId = this.workspaceId();
    console.log(`[MapResultsView][${workspaceId}] Loading coral cover data for job:`, job.id);

    if (this.coralDataLoaded()) {
      console.log(`[MapResultsView][${workspaceId}] Coral data already loaded, skipping`);
      return;
    }

    try {
      if (!job.assignments || job.assignments.length === 0) {
        console.warn(`[MapResultsView][${workspaceId}] No assignments found in job ${job.id}`);
        return;
      }

      const resultPayload = job.assignments[0].result?.result_payload as AdriaModelRunResult;

      if (!resultPayload || !resultPayload.spatial_metrics_path) {
        console.warn(
          `[MapResultsView][${workspaceId}] No spatial metrics path found in job results`
        );
        return;
      }

      const spatialMetricsPath = resultPayload.spatial_metrics_path;
      console.log(
        `[MapResultsView][${workspaceId}] Found spatial metrics path:`,
        spatialMetricsPath
      );

      this.isLoadingCoralData.set(true);
      this.coralDataError.set(null);

      // Step 1: Get presigned URL for the Parquet file
      console.log(
        `[MapResultsView][${workspaceId}] Requesting presigned URL for:`,
        spatialMetricsPath
      );

      this.api
        .downloadJobOutput(job.id, spatialMetricsPath)
        .pipe(
          takeUntil(this.destroy$),
          catchError(error => {
            console.error(
              `[MapResultsView][${workspaceId}] Failed to get presigned URL for coral data:`,
              error
            );
            this.coralDataError.set('Failed to get download URL for coral cover data');
            this.isLoadingCoralData.set(false);
            return of(null);
          })
        )
        .subscribe(response => {
          if (!response) return;

          console.log(
            `[MapResultsView][${workspaceId}] Got coral data presigned URL response:`,
            response
          );

          // Step 2: Download and process the Parquet file
          this.downloadAndProcessParquet(response.files[spatialMetricsPath], workspaceId);
        });
    } catch (error: any) {
      console.error(`[MapResultsView][${workspaceId}] Failed to load coral cover data:`, error);
      this.coralDataError.set('Failed to load coral cover data: ' + error.message);
      this.isLoadingCoralData.set(false);
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
      this.snackBar.open(
        `Coral cover data loaded (${coralCoverStats.locations.length} locations)`,
        'Dismiss',
        {
          duration: 3000,
          horizontalPosition: 'right',
          verticalPosition: 'bottom'
        }
      );
    } catch (error: any) {
      console.error(`[MapResultsView][${workspaceId}] Failed to process Parquet file:`, error);
      this.coralDataError.set('Failed to process coral cover data: ' + error.message);
      this.isLoadingCoralData.set(false);

      // Show error message
      this.snackBar.open('Failed to load coral cover data', 'Dismiss', {
        duration: 5000,
        horizontalPosition: 'right',
        verticalPosition: 'bottom'
      });
    }
  }

  /**
   * Process coral cover data from Arrow table to calculate location-based statistics
   */
  private processCoralCoverData(table: arrow.Table, workspaceId: string): CoralCoverStats {
    console.log(`[MapResultsView][${workspaceId}] Processing coral cover data...`);

    // Extract columns using Apache Arrow API
    const locationIds = table.getChild('location_id')?.toArray() as string[];
    const relativeCover = table.getChild('relative_cover')?.toArray() as number[];
    const timesteps = table.getChild('timestep')?.toArray() as number[];
    const scenarioIds = table.getChild('scenario_id')?.toArray() as number[];

    if (!locationIds || !relativeCover || !timesteps || !scenarioIds) {
      throw new Error('Required columns not found in Parquet data');
    }

    console.log(`[MapResultsView][${workspaceId}] Data dimensions:`, {
      rows: table.numRows,
      uniqueLocations: new Set(locationIds).size,
      uniqueTimesteps: new Set(timesteps).size,
      uniqueScenarios: new Set(scenarioIds).size
    });

    // Group by location_id and calculate mean relative cover
    const locationData = new Map<
      string,
      {
        coverValues: number[];
        timestepCount: number;
        scenarioCount: number;
      }
    >();

    // Aggregate data by location
    for (let i = 0; i < locationIds.length; i++) {
      const locationId = locationIds[i];
      const cover = relativeCover[i];

      if (!locationData.has(locationId)) {
        locationData.set(locationId, {
          coverValues: [],
          timestepCount: 0,
          scenarioCount: 0
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
        mean_relative_cover: meanCover,
        timestep_count: new Set(timesteps.filter((_, i) => locationIds[i] === locationId)).size,
        scenario_count: new Set(scenarioIds.filter((_, i) => locationIds[i] === locationId)).size
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

      // Show error message
      this.snackBar.open('Failed to display reef boundaries', 'Dismiss', {
        duration: 5000,
        horizontalPosition: 'right',
        verticalPosition: 'bottom'
      });
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

      // Show success message
      this.snackBar.open('Map styled with coral cover data', 'Dismiss', {
        duration: 2000,
        horizontalPosition: 'right',
        verticalPosition: 'bottom'
      });
    } catch (error: any) {
      console.error(`[MapResultsView][${workspaceId}] Failed to update map styling:`, error);
      this.snackBar.open('Failed to apply coral cover styling', 'Dismiss', {
        duration: 3000,
        horizontalPosition: 'right',
        verticalPosition: 'bottom'
      });
    }
  }

  /**
   * Load time series data for a specific location
   */
  private async loadSiteTimeSeriesData(locationId: string): Promise<void> {
    const workspaceId = this.workspaceId();
    const stats = this.coralCoverStats();

    if (!stats) {
      console.warn(`[${workspaceId}] No coral cover stats available`);
      return;
    }

    try {
      console.log(`[${workspaceId}] Setting up site info for location ${locationId}`);

      // Find location data and immediately show the popup
      const locationData = stats.locations.find(loc => loc.location_id === locationId);
      if (locationData) {
        // Immediately show the popup with site info
        this.selectedSite.set({
          locationId: locationId,
          meanCover: locationData.mean_relative_cover,
          timesteps: locationData.timestep_count,
          scenarios: locationData.scenario_count,
          dataPoints: locationData.timestep_count * locationData.scenario_count
        });

        // Start loading chart data asynchronously
        this.loadAndRenderTimeSeriesChart(locationId);
      }
    } catch (error) {
      console.error(`[${workspaceId}] Failed to load site data:`, error);
      this.snackBar.open('Failed to load site data', 'Dismiss', {
        duration: 3000,
        horizontalPosition: 'right',
        verticalPosition: 'bottom'
      });
    }
  }

  /**
   * Load, filter, and render time series chart for a specific location using cached Arrow table.
   */
  private async loadAndRenderTimeSeriesChart(locationId: string): Promise<void> {
    const workspaceId = this.workspaceId();
    const cachedTable = this.cachedArrowTable();

    // Check if we have the cached table
    if (!cachedTable) {
      this.snackBar.open(
        'Data not yet loaded. Please wait for coral cover data to finish loading.',
        'Dismiss',
        {
          duration: 3000
        }
      );
      this.isLoadingSiteData.set(false);
      return;
    }

    console.log(`[${workspaceId}] Loading time series for location ${locationId} from cached data`);
    this.isLoadingSiteData.set(true);

    // Use setTimeout to make this non-blocking and allow UI to update
    setTimeout(async () => {
      try {
      // Use the cached Arrow table to filter data for the selected location
      if (!cachedTable.schema.fields.some(f => f.name === 'location_id')) {
        throw new Error("Column 'location_id' not found in the cached data.");
      }

      const timestep = cachedTable.getChild('timestep')?.toArray() as number[];
      const locationIds = cachedTable.getChild('location_id')?.toArray() as string[];
      const relativeCover = cachedTable.getChild('relative_cover')?.toArray() as number[];
      const scenarioType = cachedTable.getChild('scenario_type')?.toArray() as string[];
      const timeSeries: TimeSeriesData[] = [];

      for (let i = 0; i < locationIds.length; i++) {
        if (locationIds[i] === locationId) {
          const entry = {
            timestep: Number(timestep[i]),
            scenario_type: scenarioType[i],
            relative_cover: Number(relativeCover[i])
          };
          timeSeries.push(entry);
        }
      }

      this.siteTimeSeriesData.set(aggregateTimeSeriesData(timeSeries));

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
        this.snackBar.open(
          `Error loading data for location ${locationId}: ${error.message}`,
          'Dismiss',
          {
            duration: 5000,
            panelClass: ['error-snackbar']
          }
        );
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
          type: 'quantitative', // Quantitative is better for years than nominal/ordinal
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
          // Layer 1: Confidence Band (using the pre-calculated min/max fields)
          mark: { type: 'area', opacity: 0.3 },
          encoding: {
            y: {
              field: 'min_cover', // Map to your pre-calculated min field
              type: 'quantitative',
              title: 'Relative Coral Cover'
            },
            y2: {
              field: 'max_cover' // Map to your pre-calculated max field
            }
          }
        },
        {
          // Layer 2: Mean Trend Line (using the pre-calculated mean field)
          mark: { type: 'line', strokeWidth: 2.5, interpolate: 'monotone' },
          encoding: {
            y: {
              field: 'mean_cover', // Map to your pre-calculated mean field
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
              { field: 'mean_cover', type: 'quantitative', title: 'Mean Cover', format: '.1%' },
              { field: 'min_cover', type: 'quantitative', title: 'Min Cover', format: '.1%' },
              { field: 'max_cover', type: 'quantitative', title: 'Max Cover', format: '.1%' }
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

    if (this.vegaView) {
      this.vegaView.finalize();
      this.vegaView = null;
    }

    if (this.siteChartContainer?.nativeElement) {
      this.siteChartContainer.nativeElement.innerHTML = '';
    }
  }

  /**
   * Handle map click events
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

          // Load time series data for this location
          this.loadSiteTimeSeriesData(locationId);

          // Show location info in snackbar (keep existing behavior)
          this.snackBar.open(
            `Location ${locationId}: ${(locationData.mean_relative_cover * 100).toFixed(1)}% coral cover`,
            'Dismiss',
            { duration: 3000 }
          );
        }
      }
    } else {
      // Clear selection if clicking on empty space
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

      // TODO: Could add more processing here for additional map features
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
    this.isLoadingCoralData.set(false);
    this.geoDataError.set(null);
    this.coralDataError.set(null);
    this.geoDataLoaded.set(false);
    this.coralDataLoaded.set(false);
    this.coralCoverStats.set(null);
    this.cachedArrowTable.set(null);

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
