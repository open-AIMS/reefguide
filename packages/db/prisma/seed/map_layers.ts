import { MapLayerUpsert } from './seed-types';
import type { ColorLike } from 'ol/colorlike.js';

// duplicate of type in @reefguide/types, but that dep creates circular dependency.
import { Options as OLVectorLayerOptions } from 'ol/layer/Vector';
import { Options as OLWebGLTileLayerOptions } from 'ol/layer/WebGLTile';

// map: Map is not valid for Prisma type, so omit it.
type VectorLayerOptions = Omit<OLVectorLayerOptions, 'source' | 'properties' | 'map'>;
type TileLayerOptions = Omit<OLWebGLTileLayerOptions, 'source' | 'sources' | 'properties' | 'map'>;

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

  const transparentColor = geomorphicZonationClasses[0]?.color;
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

let zIndex = 1;

export const infoLayerDefs: Array<MapLayerUpsert['create']> = [
  {
    layerId: 'esri_world_imagery_firefly',
    title: 'ESRI World Imagery Firefly',
    category: 'BASEMAP',
    zIndex: zIndex++,
    infoUrl: 'https://www.esri.com/',
    url: [
      'https://fly.maptiles.arcgis.com/arcgis/rest/services/World_Imagery_Firefly/MapServer/tile/{z}/{y}/{x}'
    ],
    urlType: 'XYZ',
    layerOptions: {
      visible: false
    },
    attributions:
      'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  },
  {
    layerId: 'google_imagery',
    title: 'Google Imagery',
    category: 'BASEMAP',
    zIndex: zIndex++,
    url: ['https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&hl=en'],
    urlType: 'XYZ'
  },
  {
    layerId: 'ssr_sentinel_2018',
    title: 'SSR Sentinel 2018',
    category: 'BASEMAP',
    zIndex: zIndex++,
    infoUrl:
      'https://tiles-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/SSR_Sentinel_2018/MapServer',
    url: [
      'https://tiles-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/SSR_Sentinel_2018/MapServer/WMTS/1.0.0/WMTSCapabilities.xml'
    ],
    urlType: 'WMTSCapabilitiesXml',
    layerOptions: {
      visible: false
    }
  },
  {
    layerId: 'cities',
    title: 'Cities',
    category: 'CONTEXT',
    zIndex: zIndex++,
    url: [
      'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/Cities/FeatureServer/'
    ],
    urlType: 'ArcGisFeatureServer',
    serverLayerId: '0',
    labelProp: 'name',
    infoUrl:
      'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/Cities/FeatureServer/',
    layerOptions: {
      style: {
        'text-value': ['get', 'name'],
        'text-font': '14px Roboto',
        'text-fill-color': '#ffffff',
        'text-stroke-color': '#000000',
        'text-stroke-width': 2
      }
    }
  },
  {
    layerId: 'GBRMPA_Zoning',
    title: 'GBRMPA Zoning',
    category: 'CONTEXT',
    zIndex: zIndex++,
    // NAME exists, specific id like P-16-15, but TYPE more friendly text
    labelProp: 'TYPE',
    serverLayerId: '53',
    infoUrl:
      'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Zoning_20/FeatureServer/',
    url: [
      'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Zoning_20/FeatureServer/'
    ],
    urlType: 'ArcGisFeatureServer',
    layerOptions: {
      visible: false,
      opacity: 0.5
    }
  },
  {
    layerId: 'hybrid_benthic',
    title: 'Hybrid Benthic',
    category: 'CONTEXT',
    zIndex: zIndex++,
    infoUrl:
      'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/hybrid_benthic/MapServer',
    url: [
      'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/hybrid_benthic/MapServer/WMTS/1.0.0/WMTSCapabilities.xml'
    ],
    urlType: 'WMTSCapabilitiesXml',
    layerOptions: {
      opacity: 0.8,
      visible: false
    }
  },
  {
    layerId: 'hybrid_geomorphic',
    title: 'Hybrid Geomorphic',
    category: 'CONTEXT',
    zIndex: zIndex++,
    // for now, just link here so users can lookup colors
    // should work on legend and better layer info design soon
    infoUrl:
      'https://developers.google.com/earth-engine/datasets/catalog/ACA_reef_habitat_v2_0#bands',
    url: [
      'https://tiledimageservices3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/rgFarNorthern_hybrid_geomorphichyb/ImageServer',
      'https://tiledimageservices3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/rgCairns_Cooktown_hybrid_geomorphichyb/ImageServer',
      'https://tiledimageservices3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/rgTownsville_Whitsunday_hybrid_geomorphichyb/ImageServer',
      'https://tiledimageservices3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/rgMackay_Capricorn_hybrid_geomorphichyb/ImageServer'
    ],
    urlType: 'ArcGisImageServer',
    layerGroupOptions: {
      visible: false
    }
  },
  {
    layerId: 'canonical_reefs',
    title: 'RRAP Canonical Reefs',
    category: 'CONTEXT',
    zIndex: zIndex++,
    layerPrefix: 'Reef: ',
    labelProp: 'reef_name',
    infoUrl:
      'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/RRAP_Canonical_Reefs/FeatureServer',
    url: [
      'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/RRAP_Canonical_Reefs/FeatureServer'
    ],
    urlType: 'ArcGisFeatureServer',
    layerOptions: {
      visible: true,
      minZoom: 8,
      opacity: 0.8,
      // only declutter with self
      declutter: 'reefs',
      // Note: nice_reef_name and significance are added in openlayers-hardcoded.ts
      style: {
        'fill-color': 'rgba(35,96,165,0.01)',
        'stroke-color': 'rgba(70,150,255,0.9)',
        'stroke-line-dash': [4, 6],
        'stroke-width': 1,
        'text-value': [
          'match',
          ['get', 'significance'],
          // always show reef text for significant reefs
          1,
          ['get', 'nice_reef_name'],
          // default
          // show text when resolution < 75
          ['case', ['<', ['resolution'], 75], ['get', 'nice_reef_name'], '']
          // view resolution with: ['to-string', ['resolution']]
        ],
        'text-font': [
          'match',
          ['get', 'significance'],
          // larger text for more significant reefs
          1,
          '12px Verdana, sans-serif',
          // default (i.e. unnamed reefs)
          '10px Verdana, sans-serif'
        ],
        'text-fill-color': '#ffffff',
        'text-stroke-color': '#000000',
        'text-stroke-width': 2,
        // required otherwise text does not show until zoom far in
        'text-overflow': true,
        // reduce how many labels are shown when crowded by setting padding
        'text-padding': [4, 2, 4, 2] // top, right, bottom, left
      }
    }
  },
  {
    layerId: 'ecorrap_site_locations',
    title: 'EcoRRAP Site Locations',
    category: 'CONTEXT',
    zIndex: zIndex++,
    layerPrefix: 'EcoRRAP Site: ',
    labelProp: 'Name',
    infoUrl:
      'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/EcoRRAP_Site_Locations/FeatureServer',
    url: [
      'https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/EcoRRAP_Site_Locations/FeatureServer'
    ],
    urlType: 'ArcGisFeatureServer',
    cluster: true
  },
  // QPWS Moorings -
  // https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer/20
  {
    layerId: 'parks_marine_moorings',
    title: 'QPWS Moorings',
    category: 'CONTEXT',
    zIndex: zIndex++,
    layerPrefix: 'QPWS Mooring: ',
    labelProp: 'site_and_mooring_reference_numb',
    infoUrl:
      'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer',
    url: [
      'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer'
    ],
    urlType: 'ArcGisFeatureServer',
    layerOptions: {
      visible: false
    },
    // This is the layer to target - notice stripped from URL above
    serverLayerId: '20',
    // Clustering enabled
    cluster: true
  },
  // QPWS Protection Markers -
  // https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer/10
  {
    layerId: 'parks_protection_markers',
    title: 'GPWS Reef Protection Markers',
    category: 'CONTEXT',
    zIndex: zIndex++,
    layerPrefix: 'QPWS Protection Markers: ',
    labelProp: 'site_rpm_label',
    infoUrl:
      'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer',
    url: [
      'https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer'
    ],
    urlType: 'ArcGisFeatureServer',
    layerOptions: {
      visible: false
    },
    // This is the layer to target - notice stripped from URL above
    serverLayerId: '10',
    // Clustering enabled
    cluster: true
  },
  {
    layerId: 'gbrmpa_management_regions',
    title: 'GBRMPA Management Regions',
    category: 'CONTEXT',
    zIndex: zIndex++,
    layerPrefix: 'Management Region: ',
    labelProp: 'AREA_DESCR',
    serverLayerId: '59',
    infoUrl:
      'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Management_Areas_20/FeatureServer',
    url: [
      'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Management_Areas_20/FeatureServer'
    ],
    urlType: 'ArcGisFeatureServer',
    layerOptions: {
      visible: false,
      opacity: 0.8,
      style: {
        'fill-color': 'rgba(24, 113, 214, 0.04)',
        'stroke-color': 'rgba(0, 255, 4, 0.34)',
        'stroke-line-dash': [4, 6],
        'stroke-width': 5,
        'text-value': ['get', 'AREA_DESCR']
      }
    }
  },

  {
    layerId: 'cruiseship_transit_lanes',
    title: 'GBRMPA Cruise Ship Transit Lanes',
    category: 'CONTEXT',
    zIndex: zIndex++,
    layerPrefix: 'Cruiseship Lanes: ',
    labelProp: 'AREA_DESCR',
    serverLayerId: '61',
    infoUrl:
      'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Cruise_Ship_Transit_Lanes_20/FeatureServer',
    url: [
      'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Cruise_Ship_Transit_Lanes_20/FeatureServer'
    ],
    urlType: 'ArcGisFeatureServer',
    layerOptions: {
      visible: false,
      opacity: 0.8,
      style: {
        'fill-color': 'rgba(30, 30, 235, 0.15)',
        'stroke-color': 'rgba(13, 13, 239, 0.45)',
        'stroke-line-dash': [4, 6],
        'stroke-width': 3,
        'text-value': ['concat', 'Cruiseship Transit Lane: ', ['get', 'AREA_DESCR']]
      }
    }
  },
  {
    layerId: 'maritime_safety_port_limits',
    title: 'Maritime Safety Port Limits',
    category: 'CONTEXT',
    zIndex: zIndex++,
    layerPrefix: 'Port Limits: ',
    labelProp: 'NAME',
    serverLayerId: '0',
    infoUrl:
      'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Maritime_Safety_Port_Limits/FeatureServer/',
    url: [
      'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Maritime_Safety_Port_Limits/FeatureServer/'
    ],
    urlType: 'ArcGisFeatureServer',
    layerOptions: {
      visible: false,
      opacity: 0.8,
      style: {
        'fill-color': 'rgba(238, 12, 140, 0.15)',
        'stroke-color': 'rgba(229, 14, 136, 0.88)',
        'stroke-line-dash': [4, 6],
        'stroke-width': 2,
        'text-value': ['get', 'NAME']
      }
    }
  },
  {
    layerId: 'tumra_agreement',
    title: 'Traditional Use of Marine Resources Agreement',
    category: 'CONTEXT',
    zIndex: zIndex++,
    layerPrefix: 'TUMRA: ',
    labelProp: 'NAME',
    serverLayerId: '55',
    infoUrl:
      'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Traditional_Use_of_Marine_Resources_TUMRA_20/FeatureServer',
    url: [
      'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Traditional_Use_of_Marine_Resources_TUMRA_20/FeatureServer'
    ],
    urlType: 'ArcGisFeatureServer',
    layerOptions: {
      visible: false,
      opacity: 0.8,
      style: {
        'fill-color': 'rgba(235, 154, 33, 0.17)',
        'stroke-color': 'rgba(244, 149, 7, 0.57)',
        'stroke-line-dash': [4, 6],
        'stroke-width': 3,
        'text-value': ['get', 'NAME']
      }
    }
  },
  {
    layerId: 'designated_shipping_areas',
    title: 'Designated Shipping Areas',
    category: 'CONTEXT',
    zIndex: zIndex,
    layerPrefix: 'Shipping Area: ',
    labelProp: 'NAME',
    serverLayerId: '74',
    infoUrl:
      'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Designated_Shipping_Areas_201/FeatureServer',
    url: [
      'https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Designated_Shipping_Areas_201/FeatureServer'
    ],
    urlType: 'ArcGisFeatureServer',
    layerOptions: {
      visible: false,
      opacity: 0.8,
      style: {
        'fill-color': [
          'match',
          ['get', 'OBJECTID'],
          1,
          'rgba(149, 246, 22, 0.14)',
          'rgba(255, 94, 0, 0.2)'
        ],
        'stroke-color': [
          'match',
          ['get', 'OBJECTID'],
          1,
          'rgba(129, 209, 16, 0.28)',
          'rgba(255, 4, 0, 0.48)'
        ],
        'stroke-line-dash': [4, 6],
        'stroke-width': 2
      }
    }
  }
];

const criteriaOptions: TileLayerOptions = {
  visible: false,
  opacity: 0.8
};

export const criteriaLayerDefs: Array<MapLayerUpsert['create']> = [
  {
    layerId: 'Depth',
    title: 'Depth',
    category: 'CRITERIA',
    zIndex: zIndex++,
    infoUrl:
      'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_bathymetry/MapServer',
    url: [
      'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_bathymetry/MapServer/WMTS/1.0.0/WMTSCapabilities.xml'
    ],
    urlType: 'WMTSCapabilitiesXml',
    reverseRange: true,
    layerOptions: criteriaOptions
  },
  {
    layerId: 'Slope',
    title: 'Slope',
    category: 'CRITERIA',
    zIndex: zIndex++,
    infoUrl:
      'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_slope_data/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
    url: [
      'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_slope_data/MapServer/WMTS/1.0.0/WMTSCapabilities.xml'
    ],
    urlType: 'WMTSCapabilitiesXml',
    layerOptions: criteriaOptions
  },
  {
    layerId: 'WavesHs',
    title: 'WavesHs',
    category: 'CRITERIA',
    zIndex: zIndex++,
    infoUrl:
      'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_wave_Hs_data/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
    url: [
      'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_wave_Hs_data/MapServer/WMTS/1.0.0/WMTSCapabilities.xml'
    ],
    urlType: 'WMTSCapabilitiesXml',
    layerOptions: criteriaOptions
  },
  {
    layerId: 'WavesTp',
    title: 'WavesTp',
    category: 'CRITERIA',
    zIndex: zIndex,
    infoUrl:
      'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_waves_Tp/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',
    url: [
      'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_waves_Tp/MapServer/WMTS/1.0.0/WMTSCapabilities.xml'
    ],
    urlType: 'WMTSCapabilitiesXml',
    layerOptions: criteriaOptions
  }
];
