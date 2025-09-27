import { Injectable, signal } from '@angular/core';
import fuzzysort from 'fuzzysort';

// Base URL for canonical reefs feature service
const CANONICAL_REEFS_BASE =
  'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/RRAP_Canonical_Reefs/FeatureServer/0';

// Base query for getting reef names and IDs with pagination support
const CANONICAL_REEFS_NAME_QUERY_BASE = `${CANONICAL_REEFS_BASE}/query?where=1%3D1&outFields=reef_name,UNIQUE_ID&returnGeometry=false&f=json`;

// Get geometry by ID
const CANONICAL_REEFS_GEOMETRY_QUERY = (id: string) =>
  `${CANONICAL_REEFS_BASE}/query?where=UNIQUE_ID%3D'${encodeURIComponent(id)}'&outFields=reef_name,UNIQUE_ID&returnGeometry=true&f=json`;

export interface ReefNameQueryResponseFormat {
  features: {
    attributes: {
      reef_name: string;
      UNIQUE_ID: string;
    };
  }[];
  exceededTransferLimit?: boolean;
}

export interface ReefGeometryQueryResponseFormat {
  features: {
    geometry: any;
  }[];
}

export interface ReefData {
  reefs: {
    name: string;
    id: string;
  }[];
}

export interface ReefSearchResult {
  results: {
    id: string;
    name: string;
  }[];
}

export interface ReefSearchQuery {
  query: string;
}

export interface ReefGeometryQuery {
  id: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReefSearchService {
  // Private state
  private reefData: ReefData | undefined = undefined;

  // Busy searching?
  searching = signal<boolean>(false);
  // Results - if any
  results = signal<ReefSearchResult | undefined>(undefined);
  // Error information - if something went wrong
  error = signal<string | undefined>(undefined);
  // Are we ready to accept searches?
  readyForSearch = signal<boolean>(false);

  constructor() {
    this.fetchReefNames();
  }

  /**
   * Initialisation logic upon construction of this service - fetches the reef
   * data with pagination to get all records.
   */
  private async fetchReefNames() {
    try {
      const allReefs: { name: string; id: string }[] = [];
      let offset = 0;
      const batchSize = 2000; // Maximum records per request
      let hasMore = true;

      while (hasMore) {
        const query = `${CANONICAL_REEFS_NAME_QUERY_BASE}&resultOffset=${offset}&resultRecordCount=${batchSize}`;
        const response = await fetch(query, { method: 'GET' });

        if (!response.ok) {
          console.log('Error occurred while trying to fetch from canonical reefs feature service.');
          let errorText: string | undefined;
          try {
            errorText = await response.text();
          } catch {
            errorText = 'Unknown error';
          }

          console.error(
            `Failed to retrieve reef details. Error ${errorText}. Status: ${response.statusText}`
          );
          this.error.set(
            'Reef information could not be retrieved! Contact a system administrator.'
          );
          return;
        }

        // get JSON from payload
        const jsonData: ReefNameQueryResponseFormat = await response.json();

        // Add the features from this batch
        const batchReefs = jsonData.features.map(f => ({
          id: f.attributes.UNIQUE_ID,
          name: f.attributes.reef_name
        }));

        allReefs.push(...batchReefs);

        // Check if we need to continue paginating
        // If we got fewer records than requested, or no transfer limit exceeded, we're done
        hasMore = jsonData.features.length === batchSize && jsonData.exceededTransferLimit === true;
        offset += batchSize;

        // Safety check to prevent infinite loops
        if (offset > 100000) {
          console.warn('Stopped pagination after 100,000 records to prevent infinite loop');
          break;
        }
      }

      // Create the final reef data
      const parsedData: ReefData = {
        reefs: allReefs
      };

      this.reefData = parsedData;
      this.readyForSearch.set(true);

      console.log(`Successfully loaded ${allReefs.length} reef records`);
    } catch (e) {
      console.error(`Failed to retrieve reef details. Error ${e}.`);
      this.error.set('Reef information could not be retrieved! Contact a system administrator.');
    }
  }

  /**
   * Searches for reefs using the Canonical reefs as the dataset
   *
   * @returns Top 10 results ordered by match - fuzzy searching
   */
  search({ query }: ReefSearchQuery) {
    this.searching.set(true);

    // Fuzzy searching
    const rawSearchResults = fuzzysort.go(query, this.reefData?.reefs ?? [], {
      key: 'name',
      limit: 10
    });

    // Parse it out
    const parsedResults = { results: rawSearchResults.map(r => r.obj) };

    // Update data
    this.results.set(parsedResults);

    // Loading finished
    this.searching.set(false);
  }

  /**
   * Gets a specific reef by ID including geometry
   *
   * @returns Promise that resolves to the geometry of the reef or throws an Error
   */
  async getGeometry({ id }: ReefGeometryQuery): Promise<any> {
    try {
      const response = await fetch(CANONICAL_REEFS_GEOMETRY_QUERY(id), { method: 'GET' });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `Failed to retrieve reef geometry (ID=${id}). ${errorText}. Status: ${response.statusText}`
        );
      }

      const jsonData: ReefGeometryQueryResponseFormat = await response.json();

      if (!jsonData.features || jsonData.features.length === 0) {
        throw new Error(`No reef found with ID: ${id}`);
      }

      const feature = jsonData.features[0];
      if (!feature.geometry) {
        throw new Error(`Reef found (ID=${id}) but no geometry data available`);
      }

      return feature.geometry;
    } catch (error) {
      // Re-throw Error objects as-is, wrap other types
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to retrieve reef geometry (ID=${id}). Unexpected error: ${error}`);
    }
  }
}
