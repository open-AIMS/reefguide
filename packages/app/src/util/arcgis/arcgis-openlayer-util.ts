import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';
import { LayerDef } from '@reefguide/types';
import Layer from 'ol/layer/Layer';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { EsriJSON } from 'ol/format';
import { LayerProperties } from '../../types/layer.type';
import { tile as tileStrategy } from 'ol/loadingstrategy.js';
import { createXYZ } from 'ol/tilegrid';

/**
 * Create WMTS source based from capabilities XML file url.
 * Sets the title property based on layer metadata
 * @param capabilitiesUrl URL to WMTS Capabilities XML file
 */
export async function createSourceFromCapabilitiesXml(capabilitiesUrl: string): Promise<WMTS> {
  // https://openlayers.org/en/latest/examples/wmts-layer-from-capabilities.html
  const response = await fetch(capabilitiesUrl);
  const text = await response.text();

  const parser = new WMTSCapabilities();
  const result = parser.read(text);

  const layerDef = result.Contents.Layer[0];
  const options = optionsFromCapabilities(result, {
    layer: layerDef.Identifier
  });

  if (options == null) {
    throw new Error('options null');
  }

  // change to nearest neighbor, prevents darkened edge with default linear interpolation
  options.interpolate = false;

  const wmts = new WMTS(options);
  wmts.set('title', layerDef.Title || layerDef.Identifier);
  return wmts;
}

export function createLayerFromDef(layerDef: LayerDef): Layer {
  switch (layerDef.urlType) {
    case 'ArcGisFeatureServer':
      return new VectorLayer({
        properties: {
          id: layerDef.id,
          title: layerDef.title
        } satisfies LayerProperties,
        source: createVectorSourceForFeatureServer(layerDef.url)
      });

    default:
      throw new Error(`Unsupported urlType: ${layerDef.urlType}`);
  }
}

/**
 * Constructs a VectorSource for the ArcGIS feature server.
 * @param featureServerUrl ArcGIS .../FeatureServer URL
 */
function createVectorSourceForFeatureServer(featureServerUrl: string): VectorSource {
  // see example: https://openlayers.org/en/latest/examples/vector-esri.html
  const layer = '0';

  const vectorSource = new VectorSource({
    format: new EsriJSON(),
    url: function (extent, resolution, projection) {
      // ArcGIS Server only wants the numeric portion of the projection ID.
      const srid = projection
        .getCode()
        .split(/:(?=\d+$)/)
        .pop();

      if (srid === undefined) {
        throw new Error('could not get srid');
      }

      const u = new URL(`${featureServerUrl}/${layer}/query/`);

      u.searchParams.set('f', 'json');
      u.searchParams.set('returnGeometry', 'true');
      u.searchParams.set('spatialRel', 'esriSpatialRelIntersects');

      const geo = {
        xmin: extent[0],
        ymin: extent[1],
        xmax: extent[2],
        ymax: extent[3],
        spatialReference: {
          wkid: srid
        }
      };
      u.searchParams.set('geometry', JSON.stringify(geo));

      u.searchParams.set('geometryType', 'esriGeometryEnvelope');
      u.searchParams.set('outFields', '*');
      u.searchParams.set('inSR', srid);
      u.searchParams.set('outSR', srid);

      return u.toString();
    },
    strategy: tileStrategy(
      createXYZ({
        tileSize: 512
      })
    )
  });

  return vectorSource;
}
