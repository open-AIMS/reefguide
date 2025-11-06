import Layer, { Options } from 'ol/layer/Layer';
import { LayerDef } from '@reefguide/types';
import { LayerProperties } from '../../types/layer.type';
import VectorLayer from 'ol/layer/Vector';
import { clusterLayerSource } from './openlayers-util';
import TileLayer from 'ol/layer/WebGLTile';
import XYZ from 'ol/source/XYZ';
import { loadLerc } from '../lerc-loader';
import DataTileSource from 'ol/source/DataTile';
import {
  createSourceFromCapabilitiesXml,
  createVectorSourceForFeatureServer,
  lerc1BandDataTileLoader
} from '../arcgis/arcgis-openlayer-util';

/**
 * Functions that create each layer url type.
 *
 * Assumes that layerOptions and mixin are for the corresponding layer type.
 */
const LAYER_BUILDERS: Record<
  LayerDef['urlType'],
  (def: LayerDef, properties: LayerProperties, mixin?: Partial<Options>) => Layer
> = {
  ArcGisFeatureServer(layerDef, properties, mixin) {
    // type narrowing
    if (layerDef.urlType !== 'ArcGisFeatureServer') {
      throw new Error('unexpected LayerDef urlType');
    }
    type Options = (typeof layerDef)['layerOptions'];

    const source = createVectorSourceForFeatureServer(layerDef.url, layerDef.layerId);
    const vectorLayer = new VectorLayer({
      properties,
      source,
      // want to show new features while panning by default
      updateWhileInteracting: true,
      ...layerDef.layerOptions,
      ...(mixin as Options)
    });

    if (layerDef.cluster) {
      clusterLayerSource(vectorLayer);
    }

    return vectorLayer;
  },

  ArcGisMapServer(layerDef) {
    throw new Error(`${layerDef.urlType} not implemented!`);
  },

  WMTSCapabilitiesXml(layerDef, properties, mixin) {
    // type narrowing
    if (layerDef.urlType !== 'WMTSCapabilitiesXml') {
      throw new Error('unexpected LayerDef urlType');
    }
    type Options = (typeof layerDef)['layerOptions'];

    const layer = new TileLayer({
      properties,
      ...layerDef.layerOptions,
      ...(mixin as Options)
    });

    setTimeout(() => {
      createSourceFromCapabilitiesXml(layerDef.url).then(source => {
        // OpenLayers types bug? WMTS source does work with TileLayer
        // @ts-expect-error
        layer.setSource(source);
      });
    }, 2_000);

    return layer;
  },
  XYZ(layerDef, properties, mixin) {
    const layer = new TileLayer({
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

    return layer;
  },

  // NOW 1Band LERC assumed? params design
  ArcGisImageServer(layerDef, properties, mixin) {
    // initial layer, source is set later on lerc load
    const layer = new TileLayer({
      properties,
      ...(layerDef.layerOptions as any),
      ...mixin
      // TODO extent
    });

    loadLerc().then(lerc => {
      const urlTemplate = `${layerDef.url}/tile/{z}/{y}/{x}`;
      const tileSize = [256, 256];

      // REVIEW OpenLayers DataTile vs DataTileSource?
      const source = new DataTileSource({
        bandCount: 1,
        tileSize,
        loader: lerc1BandDataTileLoader(lerc, urlTemplate, tileSize[0], tileSize[1])
        // transition: 0  // disable tile transition animation
      });

      // uses exportImage method, HTTP 400, maybe could fix, but LERC seems better anyway
      // const source = new TileArcGISRest({
      //   url: layerDef.url
      // });

      layer.setSource(source);
    });

    return layer;
  }
};

/**
 * Create Layer from definition object.
 * Source may be set async depending on the layer.
 * @param layerDef layer definition
 * @param mixin layer constructor properties to mixin
 */
export function createLayerFromDef(layerDef: LayerDef, mixin?: Partial<Options>): Layer {
  const properties: LayerProperties = {
    id: layerDef.id,
    title: layerDef.title,
    infoUrl: layerDef.infoUrl,
    labelProp: layerDef.labelProp,
    layerPostfix: layerDef.layerPostfix,
    layerPrefix: layerDef.layerPrefix
  };

  const builder = LAYER_BUILDERS[layerDef.urlType];
  if (builder) {
    return builder(layerDef, properties, mixin);
  } else {
    throw new Error(`Unsupported urlType: ${layerDef.urlType}`);
  }
}
