import { Injectable, signal } from '@angular/core';
import fuzzysort from 'fuzzysort';

const CANONICAL_REEFS_BASE =
  'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/RRAP_Canonical_Reefs/FeatureServer/0';
// This gets the name, unique ID of all reefs in the canonical reefs dataset
const CANONICAL_REEFS_NAME_QUERY = `${CANONICAL_REEFS_BASE}/query?where=1%3D1&outFields=reef_name,UNIQUE_ID&returnGeometry=false&f=json`;
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
   * data.
   */
  private async fetchReefNames() {
    try {
      const response = await fetch(CANONICAL_REEFS_NAME_QUERY, { method: 'GET' });
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
        this.error.set('Reef information could not be retrieved! Contact a system administrator.');
      }

      // get JSON from payload
      const jsonData: ReefNameQueryResponseFormat = await response.json();

      // parse
      const parsedData: ReefData = {
        reefs: jsonData.features.map(f => ({
          id: f.attributes.UNIQUE_ID,
          name: f.attributes.reef_name
        }))
      };

      this.reefData = parsedData;
      this.readyForSearch.set(true);
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
   * @returns Promise that resolves to the geometry of the reef or throws a string error
   */
  async getGeometry({ id }: ReefGeometryQuery): Promise<any> {
    try {
      const response = await fetch(CANONICAL_REEFS_GEOMETRY_QUERY(id), { method: 'GET' });

      if (!response.ok) {
        let errorText: string | undefined;
        try {
          errorText = await response.text();
        } catch {
          errorText = 'Unknown error';
        }
        throw `Failed to retrieve reef geometry (ID=${id}). Error ${errorText}. Status: ${response.statusText}`;
      }

      // get JSON from payload
      const jsonData: ReefGeometryQueryResponseFormat = await response.json();

      // Check if we got any features back
      if (!jsonData.features || jsonData.features.length === 0) {
        throw `No reef found with ID: ${id}`;
      }

      // Return the geometry of the first (and should be only) feature
      const feature = jsonData.features[0];
      if (!feature.geometry) {
        throw `Reef found (ID=${id}) but no geometry data available`;
      }

      return feature.geometry;
    } catch (e) {
      // If it's already a string error we threw, re-throw it
      if (typeof e === 'string') {
        throw e;
      }
      // Otherwise, wrap the error
      throw `Failed to retrieve reef geometry (ID=${id}). Error: ${e}`;
    }
  }
}
