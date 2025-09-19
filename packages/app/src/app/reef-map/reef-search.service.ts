import { Injectable, signal } from '@angular/core';
import fuzzysort from 'fuzzysort';

// This gets the name, unique ID of all reefs in the canonical reefs
// dataset
const CANONICAL_REEFS_NAME_QUERY =
  'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/RRAP_Canonical_Reefs/FeatureServer/0/query?where=1%3D1&outFields=reef_name,UNIQUE_ID&returnGeometry=false&f=json';

export interface ReefNameQueryResponseFormat {
  features: {
    attributes: {
      reef_name: string;
      UNIQUE_ID: string;
    };
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
    const response = await fetch(CANONICAL_REEFS_NAME_QUERY, { method: 'GET' });
    if (!response.ok) {
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

    try {
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
      console.error(
        `Failed to retrieve reef details. Error ${response.text}. Status: ${response.statusText}`
      );
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
}
