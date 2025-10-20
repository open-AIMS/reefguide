import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';
import { LayerDef } from '@reefguide/types';
import Layer, { Options } from 'ol/layer/Layer';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import { EsriJSON } from 'ol/format';
import { LayerProperties } from '../../types/layer.type';
import TileState from 'ol/TileState';
import { tile as tileStrategy } from 'ol/loadingstrategy.js';
import { createXYZ } from 'ol/tilegrid';
import TileLayer from 'ol/layer/WebGLTile';
import { Tile } from 'ol';
import { clusterLayerSource } from '../../app/map/openlayers-util';
import XYZ from 'ol/source/XYZ';
import { load as lercLoad, decode as lercDecode } from 'lerc';

/**
 * Create WMTS source based from capabilities XML file url.
 * Sets the title property based on layer metadata
 * Sets tileLoadFunction to errorTilesLoader()
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

  const wmts = new WMTS({
    ...options,
    tileLoadFunction: errorTilesLoader()
  });
  wmts.set('title', layerDef.Title || layerDef.Identifier);
  return wmts;
}

export function standardErrorTilePredicate(resp: Response, tile: Tile): boolean {
  return resp.status >= 400 && resp.status !== 404;
}

/**
 * Returns a tileLoadFunction that requests the tile url with fetch and
 * shows error tiles according to the predicate.
 * Showing the error tile suppresses the tile load error.
 * @param showErrorTile predicate that indicates should render error tile
 */
export function errorTilesLoader(
  showErrorTile: (response: Response, tile: Tile) => boolean = standardErrorTilePredicate
) {
  return async (tile: Tile, src: string) => {
    // @ts-expect-error getImage exists but is private
    const img = tile.getImage() as HTMLImageElement;
    // having trouble retrying onerror, so we fetch manually and check response
    const response = await fetch(src);

    if (showErrorTile(response, tile)) {
      img.src = await getErrorTileUrl();
    } else {
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      img.src = imageUrl;
      setTimeout(() => {
        URL.revokeObjectURL(imageUrl);
      }, 5_000);
    }
  };
}

export function lercTilesLoader() {
  // https://codesandbox.io/p/sandbox/simple-forked-8vxfk?file=%2Fmain.js%3A28%2C46

  // REVIEW ok keep canvas element like this?
  const canvas = document.createElement('canvas');

  return async (tile: Tile, src: string) => {
    try {
      const response = await fetch(src);

      if (!response.ok) {
        console.warn('LERC tile response not ok');
        tile.setState(TileState.ERROR);
        return;
      } else {
        console.log('loaded LERC tile', src);
      }

      const data = await response.arrayBuffer();
      if (data !== undefined) {
        const image = lercDecode(data);
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        const imgData = ctx.createImageData(image.width, image.width);
        const values = image.pixels[0];
        let j = 0;
        for (let i = 0; i < values.length; i++) {
          // REVIEW parseFloat needed?
          // @ts-expect-error already number?
          const pixel = Math.round(parseFloat(values[i]) * 10 + 100000);
          imgData.data[j] = (pixel >> 16) & 0xff;
          imgData.data[j + 1] = (pixel >> 8) & 0xff;
          imgData.data[j + 2] = (pixel >> 0) & 0xff;
          imgData.data[j + 3] = 0xff;
          j += 4;
        }
        ctx.putImageData(imgData, 0, 0);

        // @ts-expect-error getImage exists but is private
        const img = tile.getImage() as HTMLImageElement;
        img.src = canvas.toDataURL();
      } else {
        tile.setState(TileState.ERROR);
      }
    } catch (error) {
      console.error('LERC tile load error', error);
      tile.setState(TileState.ERROR);
    }
  };
}

let errorTileObjectUrl: string | undefined = undefined;

/**
 * Get the permanent ObjectUrl for the red error tile.
 * size is 256 square
 * TODO support other sizes, caller should verify size
 * TODO maybe could generate this instead of needing to create image files
 */
async function getErrorTileUrl(): Promise<string> {
  if (errorTileObjectUrl == undefined) {
    const errorTileUrl = '/tiles/red256.png';
    const resp = await fetch(errorTileUrl);
    const blob = await resp.blob();
    errorTileObjectUrl = URL.createObjectURL(blob);
  }
  return errorTileObjectUrl;
}

/**
 * Create Layer from definition object.
 * Source may be set async depending on the layer.
 * @param layerDef layer definition
 * @param mixin layer constructor properties to mixin
 */
export function createLayerFromDef<M = Partial<Options>>(layerDef: LayerDef, mixin?: M): Layer {
  const properties: LayerProperties = {
    id: layerDef.id,
    title: layerDef.title,
    infoUrl: layerDef.infoUrl,
    labelProp: layerDef.labelProp,
    layerPostfix: layerDef.layerPostfix,
    layerPrefix: layerDef.layerPrefix
  };

  switch (layerDef.urlType) {
    case 'ArcGisFeatureServer':
      const source = createVectorSourceForFeatureServer(layerDef.url, layerDef.layerId);
      const vectorLayer = new VectorLayer({
        properties,
        source,
        // want to show new features while panning by default
        updateWhileInteracting: true,
        ...layerDef.layerOptions,
        ...mixin
      });

      if (layerDef.cluster) {
        clusterLayerSource(vectorLayer);
      }

      return vectorLayer;

    case 'WMTSCapabilitiesXml':
      const tileLayer = new TileLayer({
        properties,
        ...layerDef.layerOptions,
        ...mixin
      });

      setTimeout(() => {
        createSourceFromCapabilitiesXml(layerDef.url).then(source => {
          // OpenLayers types bug? WMTS source does work with TileLayer
          // @ts-expect-error
          tileLayer.setSource(source);
        });
      }, 2_000);

      return tileLayer;

    case 'XYZ':
      const xyzLayer = new TileLayer({
        properties,
        ...layerDef.layerOptions,
        ...mixin,
        // @ts-expect-error this source works with WebGLTileLayer, ignore the type error
        // https://github.com/openlayers/openlayers/issues/16794
        source: new XYZ({
          url: layerDef.url,
          // TODO set attributions across layer types in generic way
          attributions: layerDef.attributions
        })
      });

      return xyzLayer;

    case 'ArcGisImageServer':
      // initial layer, source is set later on lerc load
      const tileLayer2 = new TileLayer({
        properties,
        ...layerDef.layerOptions,
        ...mixin
      });

      // TODO share lerc loading promise/state
      lercLoad({
        locateFile: (wasmFileName): string => {
          // see angular.json assets configuration
          return `assets/lerc/${wasmFileName}`;
        }
      }).then(() => {
        console.log('lerc loaded');

        const xyzSource = new XYZ({
          url: `${layerDef.url}/tile/{z}/{y}/{x}`,
          tileLoadFunction: lercTilesLoader()
        });

        // @ts-expect-error ignore DataTileSource type check issue
        tileLayer2.setSource(xyzSource);
      });

      return tileLayer2;

    default:
      throw new Error(`Unsupported urlType: ${layerDef.urlType}`);
  }
}

/**
 * Constructs a VectorSource for the ArcGIS feature server.
 * @param featureServerUrl ArcGIS .../FeatureServer URL
 * @param layer layer ID to use /FeatureServer/{id}
 */
function createVectorSourceForFeatureServer(featureServerUrl: string, layer = '0'): VectorSource {
  // see example: https://openlayers.org/en/latest/examples/vector-esri.html
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
