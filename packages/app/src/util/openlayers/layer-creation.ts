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
  convertArcGISExtent,
  createSourceFromCapabilitiesXml,
  createVectorSourceForFeatureServer,
  getImageServerSetup,
  lerc1BandDataTileLoader
} from '../arcgis/arcgis-openlayer-util';
import BaseLayer from 'ol/layer/Base';
import LayerGroup from 'ol/layer/Group';

/**
 * More specific LayerDef type.
 * Distinguishes between multi-layer/multi-url and singular.
 */
type SingularLayerDef = LayerDef & {
  url: string;
};

/**
 * Functions that create each layer url type.
 *
 * Assumes that layerOptions and mixin are for the corresponding layer type.
 */
const LAYER_BUILDERS: Record<
  LayerDef['urlType'],
  (def: SingularLayerDef, properties: LayerProperties, mixin?: Partial<Options>) => Layer
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
    // type narrowing
    if (layerDef.urlType !== 'ArcGisImageServer') {
      throw new Error('unexpected LayerDef urlType');
    }
    type Options = (typeof layerDef)['layerOptions'];

    // initial layer without source, source is set later on lerc load
    const layer = new TileLayer({
      properties,
      ...layerDef.layerOptions,
      ...(mixin as Options)
      // NOW extent here too?
    });

    Promise.all([
      loadLerc(),
      getImageServerSetup(layerDef.url, { minZoom: layerDef.layerOptions?.minZoom })
    ]).then(([lerc, imageServerSetup]) => {
      const urlTemplate = `${layerDef.url}/tile/{z}/{y}/{x}`;
      const [tileWidth, tileHeight] = imageServerSetup.tileSize;

      const source = new DataTileSource({
        bandCount: 1,
        loader: lerc1BandDataTileLoader(lerc, urlTemplate, tileWidth, tileHeight),
        // transition: 0  // disable tile transition animation
        projection: imageServerSetup.projection,
        tileGrid: imageServerSetup.tileGrid,
        tileSize: imageServerSetup.tileSize
      });

      // uses exportImage method, HTTP 400, maybe could fix, but LERC seems better anyway
      // const source = new TileArcGISRest({
      //   url: layerDef.url
      // });

      layer.setSource(source);

      // extent must be in the map's projection
      layer.setExtent(convertArcGISExtent(imageServerSetup.json.extent, 'EPSG:3857'));
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
export function createLayerFromDef(layerDef: LayerDef, mixin?: Partial<Options>): BaseLayer {
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
    if (Array.isArray(layerDef.url)) {
      return new LayerGroup({
        // only include informational properties in the group
        properties: {
          // TODO should sub layers have incremented ids?
          id: layerDef.id,
          title: layerDef.title,
          // TODO update LayerDef and UI to link to multiple
          infoUrl: layerDef.infoUrl
        } as LayerProperties,
        layers: layerDef.url.map(url => {
          const childLayerDef: SingularLayerDef = {
            ...layerDef,
            url
          };
          return builder(childLayerDef, properties, mixin);
        })
      });
    } else {
      return builder(layerDef as SingularLayerDef, properties, mixin);
    }
  } else {
    throw new Error(`Unsupported urlType: ${layerDef.urlType}`);
  }
}
