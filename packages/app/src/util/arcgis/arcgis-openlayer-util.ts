import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';
import VectorSource from 'ol/source/Vector';
import { EsriJSON } from 'ol/format';
import TileState from 'ol/TileState';
import { tile as tileStrategy } from 'ol/loadingstrategy.js';
import { createXYZ } from 'ol/tilegrid';
import { Tile } from 'ol';
import { Loader as DataTileLoader } from 'ol/source/DataTile';
import { createFromTemplate } from 'ol/tileurlfunction';
import { Lerc } from '../lerc-loader';

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

/**
 * LERC tile loader that uses a canvas element to render image and writes the image data
 * to tile's HTMLImageElement.src
 * Some code from: https://codesandbox.io/p/sandbox/simple-forked-8vxfk?file=%2Fmain.js%3A28%2C46
 *
 * @deprecated prefer DataTile approach
 * Keep this function in case useful in the future.
 */
export function lercImgTilesLoader(lerc: Lerc) {
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
        const image = lerc.decode(data);
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        const imgData = ctx.createImageData(image.width, image.width);
        const values = image.pixels[0];
        let j = 0;
        for (let i = 0; i < values.length; i++) {
          // Original code
          // parseFloat needed? maybe needed to force float32?
          // const pixel = Math.round(parseFloat(values[i]) * 10 + 100000);
          // const pixel = Math.round(values[i] * 10 + 100000);
          // imgData.data[j] = (pixel >> 16) & 0xff;
          // imgData.data[j + 1] = (pixel >> 8) & 0xff;
          // imgData.data[j + 2] = (pixel >> 0) & 0xff;
          // imgData.data[j + 3] = 0xff;
          // j += 4;

          // gives values like 2, 22, 24. the original data
          const pixelValue = values[i];

          // why round at all if not doing math on the value?
          // const pixelValue = Math.round(values[i]); // or use parseFloat if needed
          // const pixelValue = Math.round(parseFloat(values[i]) * 10 + 100000);

          // set all RGB channels to same pixelValue
          imgData.data[j] = pixelValue; // R
          imgData.data[j + 1] = pixelValue; // G
          imgData.data[j + 2] = pixelValue; // B
          imgData.data[j + 3] = 0xff; // A
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

/**
 * Create tile data with a single value for all pixels.
 * @param width
 * @param height
 * @param value
 */
export function createUniformTile(width: number, height: number, value: number): Float32Array {
  const length = width * height;
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = value;
  }
  return data;
}

/**
 * Returns a data tile loader function that decodes LERC images as Float32Array.
 *
 * Current Limitations:
 * - Only supports single band
 * - Ignores LERC masks
 * - Ignores LoaderOptions (e.g. abort signal not used), crossOrigin, maxY
 *
 * @param lerc loaded lerc module
 * @param urlTemplate
 * @param tileWidth
 * @param tileHeight
 * @returns DataTileLoader
 */
export function lerc1BandDataTileLoader(
  lerc: Lerc,
  urlTemplate: string,
  tileWidth: number,
  tileHeight: number
): DataTileLoader {
  const errData = createUniformTile(tileWidth, tileHeight, 0);
  if (!lerc.isLoaded()) {
    throw new Error('lerc not loaded');
  }
  const decodeLerc = lerc.decode;

  // OpenLayers does not have url property on DataTile like ImageTile,
  // so need to manage url template.
  // FIXME tileGrid arg
  const urlFn = createFromTemplate(urlTemplate, null);

  return async (z, x, y, _options): Promise<Float32Array> => {
    // urlFn arguments: TileCoord, pixel ration, Projection
    // However, createFromTemplate impl does not actually use these, so dummy null values
    const pixelRatio: any = null;
    const projection: any = null;
    const url = urlFn([z, x, y], pixelRatio, projection);
    if (url === undefined) {
      throw new Error('Tile url generation failed');
    }

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`LERC tile response (${response.statusText}) not ok`);
      return errData;
    }

    const data = await response.arrayBuffer();
    if (data !== undefined) {
      const image = decodeLerc(data);
      console.log(`loaded LERC tile data ${image.width}x${image.height}`, url);
      console.log(
        `LERC image has ${image.pixels.length} bands, depthCount=${image.depthCount}`,
        image.statistics
      );

      // lerc docs demonstrate working with the mask, not sure if necessary
      // https://www.npmjs.com/package/lerc

      // get first band's values
      const values = image.pixels[0] as Int8Array;

      // https://openlayers.org/en/latest/apidoc/module-ol_DataTile.html#~Data
      // Supported types: ArrayLike{Uint8Array} {Uint8ClampedArray} {Float32Array} {DataView}
      // Int8Array does not work. Float32Array renders correctly.
      return new Float32Array(values);
    } else {
      console.warn('undefined array buffer from response');
      return errData;
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
 * Constructs a VectorSource for the ArcGIS feature server.
 * @param featureServerUrl ArcGIS .../FeatureServer URL
 * @param layer layer ID to use /FeatureServer/{id}
 */
export function createVectorSourceForFeatureServer(
  featureServerUrl: string,
  layer = '0'
): VectorSource {
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
