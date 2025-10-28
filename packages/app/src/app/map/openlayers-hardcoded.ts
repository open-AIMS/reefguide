import VectorLayer from 'ol/layer/Vector';
import { Style, Text, Fill, Stroke } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';
import { StyleFunction } from 'ol/style/Style';

// Style that is returned in order to hide the feature.
const hideStyle = new Style();

/**
 * Special behaviors and styling for known map layers.
 */
export const LAYER_ADJUSTMENT: Record<string, (layer: VectorLayer) => void> = {
  GBRMPA_Zoning: (layer: VectorLayer) => {
    layer.setStyle(gbrmpZoneStyleFunction);

    // logFeaturesInfo(layer, ['TYPE', 'ALT_ZONE']);
  },
  canonical_reefs: (layer: VectorLayer) => {
    const source = layer.getSource();
    if (!source) {
      throw new Error('expected source to be set');
    }

    if (source instanceof VectorSource) {
      source.on('addfeature', event => {
        const { feature } = event;
        if (feature instanceof Feature) {
          addReefProps(feature);
        }
      });
    }
  }
};

/**
 * Add nice_reef_name and significance properties to the reef feature that are used for styling.
 */
function addReefProps(feature: Feature) {
  const reefName: string = feature.get('reef_name');
  let niceName = reefName; // default

  // check if unnamed reef
  if (reefName.startsWith('U/N Reef ')) {
    // less significant
    feature.set('significance', 2);
    // just use the GBRMPA id instead (don't display "U/N Reef")
    const gbrmpaId = feature.get('GBRMPA_ID');
    if (gbrmpaId) {
      niceName = gbrmpaId;
    }
  } else {
    // named reefs are more significant
    feature.set('significance', 1);
  }

  feature.set('nice_reef_name', niceName);
}

/**
 * Style function for Great Barrier Reef Marine Park zoning features
 * Based on official GBRMPA zone types and their designated colors
 *
 * @param feature - OpenLayers feature object
 * @returns Style object for the feature
 */
const gbrmpZoneStyleFunction: StyleFunction = feature => {
  const zoneType: string = feature.get('TYPE') || '';
  const zoneName: string = feature.get('NAME') || '';

  // TODO:Feature UI to choose what zones to display
  // old code to hide all zones except Pink Zones
  // const altZone = feature.get('ALT_ZONE');
  // TODO ~8k features, maybe should server-side filter
  // if (altZone !== 'Pink Zone') {
  //   // hide this feature
  //   return hideStyle;
  // }

  // Get zone-specific styling based on TYPE field
  const zoneStyle = getZoneStyle(zoneType);

  return new Style({
    fill: new Fill({
      color: zoneStyle.fillColor
    }),
    stroke: new Stroke({
      color: zoneStyle.strokeColor,
      width: zoneStyle.strokeWidth
    }),
    text: new Text({
      text: `${zoneStyle.abbreviation}: ${zoneName}`,
      font: '11px Arial, sans-serif',
      fill: new Fill({
        color: '#000000'
      }),
      stroke: new Stroke({
        color: '#ffffff',
        width: 2
      }),
      offsetY: 0,
      textAlign: 'center',
      textBaseline: 'middle'
    })
  });
};

/**
 * Interface for zone styling properties
 */
interface ZoneStyleConfig {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  abbreviation: string;
  description: string;
}

/**
 * Get styling configuration for a specific zone type
 * Colors match the official GBRMPA zone symbology
 *
 * @param zoneType - The TYPE field value from the feature
 * @returns ZoneStyleConfig object with styling properties
 */
function getZoneStyle(zoneType: string): ZoneStyleConfig {
  const zoneStyles: Record<string, ZoneStyleConfig> = {
    // Light blue - recreational activities allowed
    'General Use Zone': {
      fillColor: 'rgba(204, 255, 255, 0.7)',
      strokeColor: 'rgba(110, 110, 110, 1)',
      strokeWidth: 1,
      abbreviation: 'GUZ',
      description: 'General recreational and commercial use'
    },

    // Medium blue - limited fishing and recreation
    'Habitat Protection Zone': {
      fillColor: 'rgba(130, 255, 255, 0.7)',
      strokeColor: 'rgba(110, 110, 110, 1)',
      strokeWidth: 1,
      abbreviation: 'HPZ',
      description: 'Habitat protection with limited use'
    },

    // Yellow - conservation focus
    'Conservation Park Zone': {
      fillColor: 'rgba(255, 255, 28, 0.7)',
      strokeColor: 'rgba(110, 110, 110, 1)',
      strokeWidth: 1,
      abbreviation: 'CPZ',
      description: 'Conservation park with restricted activities'
    },

    // Light green - buffer around sensitive areas
    'Buffer Zone': {
      fillColor: 'rgba(204, 230, 51, 0.7)',
      strokeColor: 'rgba(110, 110, 110, 1)',
      strokeWidth: 1,
      abbreviation: 'BZ',
      description: 'Buffer zone around protected areas'
    },

    // Green with orange border - research access only
    'Scientific Research Zone': {
      fillColor: 'rgba(122, 224, 0, 0.7)',
      strokeColor: 'rgba(255, 179, 0, 1)',
      strokeWidth: 2,
      abbreviation: 'SRZ',
      description: 'Scientific research with permits'
    },

    // Orange - closed to public
    'Scientific Research Zone (closed to public access)': {
      fillColor: 'rgba(255, 179, 0, 0.7)',
      strokeColor: 'rgba(110, 110, 110, 1)',
      strokeWidth: 1,
      abbreviation: 'SRZ-C',
      description: 'Scientific research - no public access'
    },

    // Bright green - high protection
    'Marine National Park Zone': {
      fillColor: 'rgba(125, 224, 0, 0.7)',
      strokeColor: 'rgba(110, 110, 110, 1)',
      strokeWidth: 1,
      abbreviation: 'MNPZ',
      description: 'Marine national park - no fishing'
    },

    // Pink/magenta - highest protection
    'Preservation Zone': {
      fillColor: 'rgba(255, 168, 255, 0.7)',
      strokeColor: 'rgba(110, 110, 110, 1)',
      strokeWidth: 1,
      abbreviation: 'PZ',
      description: 'Preservation zone - minimal human impact'
    },

    // Cream - Commonwealth islands (GBRMPA managed)
    'Commonwealth Islands Zone (GBRMPA)': {
      fillColor: 'rgba(250, 247, 205, 0.7)',
      strokeColor: 'rgba(110, 110, 110, 1)',
      strokeWidth: 1,
      abbreviation: 'CIZ-G',
      description: 'Commonwealth islands - GBRMPA managed'
    },

    // Cream - Commonwealth islands (other authority)
    'Commonwealth Islands Zone (Other)': {
      fillColor: 'rgba(250, 247, 204, 0.7)',
      strokeColor: 'rgba(110, 110, 110, 1)',
      strokeWidth: 1,
      abbreviation: 'CIZ-O',
      description: 'Commonwealth islands - other authority'
    }
  };

  // Return specific zone style or default fallback
  return (
    zoneStyles[zoneType] || {
      fillColor: 'rgba(128, 128, 128, 0.5)',
      strokeColor: 'rgba(64, 64, 64, 1)',
      strokeWidth: 1,
      abbreviation: 'UNK',
      description: 'Unknown zone type'
    }
  );
}
