import VectorLayer from 'ol/layer/Vector';
import { Style, Text, Fill, Stroke } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';
import { StyleFunction } from 'ol/style/Style';
import { ColorLike } from 'ol/colorlike';

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

  // PERF this is creating thousands of Style objects
  //  we could cache them on zoneType except for the text expression.
  //  text property does not accept an Expression here, not clear how to set an expression
  //  using Style objects. May need to change to flat styles
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

/**
 * Colors for *_hybrid_geomorphic band values.
 * https://developers.google.com/earth-engine/datasets/catalog/ACA_reef_habitat_v2_0#bands
 */
const geomorphicZonationClasses: Record<number, { color: string; desc: string } | undefined> = {
  // -1 is the default for where there are gaps, i.e. 1 to 11
  // this is to highlight unknown values that are not expected.
  '-1': {
    color: '#ff0000',
    desc: 'Unknown'
  },
  // No data
  0: {
    color: 'rgba(0,0,0,0)', // transparent for no data
    desc: 'Unmapped'
  },
  2: {
    // Deep water isn't interesting to display
    color: 'rgba(0,0,0,0)', // transparent
    desc: 'Deep'
  },
  // geomorphic
  11: {
    color: '#77d0fc',
    desc: 'Shallow Lagoon - Shallow Lagoon is any closed to semi-enclosed, sheltered, flat-bottomed shallow sediment-dominated lagoon area.'
  },
  12: {
    color: '#2ca2f9',
    desc: 'Deep Lagoon - Deep Lagoon is any sheltered broad body of water semi-enclosed to enclosed by reef, with a variable depth (but shallower than surrounding ocean) and a soft bottom dominated by reef-derived sediment.'
  },
  13: {
    color: '#c5a7cb',
    desc: 'Inner Reef Flat - Inner Reef Flat is a low energy, sediment-dominated, horizontal to gently sloping platform behind the Outer Reef Flat.'
  },
  14: {
    color: '#92739d',
    desc: 'Outer Reef Flat - Adjacent to the seaward edge of the reef, Outer Reef Flat is a level (near horizontal), broad and shallow platform that displays strong wave-driven zonation.'
  },
  15: {
    color: '#614272',
    desc: 'Reef Crest - Reef Crest is a zone marking the boundary between the reef flat and the reef slope, generally shallow and characterized by highest wave energy absorbance.'
  },
  16: {
    color: '#fbdefb',
    desc: 'Terrestrial Reef Flat - Terrestrial Reef Flat is a broad, flat, shallow to semi-exposed area of fringing reef found directly attached to land at one side, and subject to freshwater run-off, nutrients and sediment.'
  },
  21: {
    color: '#10bda6',
    desc: 'Sheltered Reef Slope - Sheltered Reef Slope is any submerged, sloping area extending into Deep Water but protected from strong directional prevailing wind or current, either by land or by opposing reef structures.'
  },
  22: {
    color: '#288471',
    desc: 'Reef Slope - Reef Slope is a submerged, sloping area extending seaward from the Reef Crest (or Flat) towards the shelf break. Windward facing, or any direction if no dominant prevailing wind or current exists.'
  },
  23: {
    color: '#cd6812',
    desc: 'Plateau - Plateau is any deeper submerged, hard-bottomed, horizontal to gently sloping seaward facing reef feature.'
  },
  24: {
    color: '#befbff',
    desc: 'Back Reef Slope - Back Reef Slope is a complex, interior, - often gently sloping - reef zone occurring behind the Reef Flat. Of variable depth (but deeper than Reef Flat and more sloped), it is sheltered, sediment-dominated and often punctuated by coral outcrops.'
  },
  25: {
    color: '#ffba15',
    desc: 'Patch Reef - Patch Reef is any small, detached to semi-detached lagoonal coral outcrop arising from sand-bottomed area.'
  },
  // benthic
  26: {
    color: '#ffffbe',
    desc: 'Sand - Sand is any soft-bottom area dominated by fine unconsolidated sediments.'
  },
  27: {
    color: '#e0d05e',
    desc: 'Rubble - Rubble is any habitat featuring loose, rough fragments of broken reef material.     '
  },
  28: {
    color: '#b19c3a',
    desc: 'Rock - Rock is any exposed area of hard bare substrate.'
  },
  29: {
    color: '#668438',
    desc: 'Seagrass - Seagrass is any habitat where seagrass is the dominant biota.'
  },
  30: {
    color: '#ff6161',
    desc: 'Coral/Algae - Coral/Algae is any hard-bottom area supporting living coral and/or algae.'
  },
  31: {
    color: '#9bcc4f',
    desc: 'Microalgal Mats - Microalgal Mats are any visible accumulations of microscopic algae in sandy sediments.'
  }
};

export function getGeomorphicZonationColorPaletteStyle() {
  const colors: ColorLike[] = [];

  const transparentColor = geomorphicZonationClasses[0]?.color!;
  const defaultColor = geomorphicZonationClasses[-1]?.color;
  if (!defaultColor) {
    throw new Error('no default');
  }

  const possibleValues = Object.keys(geomorphicZonationClasses).map(k => Number(k));
  const lastValue = Math.max(...possibleValues);

  for (let i = 0; i <= lastValue; i++) {
    colors[i] = geomorphicZonationClasses[i]?.color ?? defaultColor;
  }

  return ['palette', ['band', 1], colors];
}
