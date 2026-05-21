import { Options as OLVectorLayerOptions } from 'ol/layer/Vector';
import { Options as OLWebGLTileLayerOptions } from 'ol/layer/WebGLTile';
import { Options as LayerGroupOptions } from 'ol/layer/Group';
import { MapLayer } from './api';

export type VectorLayerOptions = Omit<OLVectorLayerOptions, 'source' | 'properties'>;
export type TileLayerOptions = Omit<OLWebGLTileLayerOptions, 'source' | 'properties'>;

/**
 * Original MapLayer base type before it was moved to Prisma and API types.
 * Keeping for now, but probably can delete
 * Properties common to all layer definitions.
 */
type BaseLayerDef = {
  /**
   * Criteria ID corresponding to CriteriaRangeOutput.id
   */
  layerId: string;

  /**
   * Layer title text
   */
  title: string;

  /**
   * Z index within the map.
   */
  zIndex: number;

  /**
   * Primary category
   * May affect how the UI presents the layer.
   */
  category: MapLayer['category'];

  /**
   * layer URL
   *
   * Layer group created if multiple urls are given
   */
  url: string | string[];

  /**
   * layer to query within the service.
   * Currently only applicable to ArcGisFeatureServer
   */
  serverLayerId?: string;

  /**
   * Web page where user can learn about the layer.
   */
  infoUrl?: string;

  /**
   * Layer attributions text.
   */
  attributions?: string;

  /**
   * Reverse criteria range values when applying pixel filter
   */
  reverseRange?: boolean;

  /**
   * Wrap the VectorSource in a Cluster.
   */
  cluster?: boolean;

  /**
   * Feature property used as the primary label
   */
  labelProp?: string;

  /**
   * Text to prepend to all feature labels in this layer.
   */
  layerPrefix?: string;

  /**
   * Text to append to all feature labels in this layer.
   */
  layerPostfix?: string;

  /**
   * Options to mixin to the LayerGroup.
   * (in the case of multiple urls causing a layer group)
   */
  layerGroupOptions?: LayerGroupOptions;
};

// More specific type narrowing of layerOptions based on urlType

type VectorLayerDef = MapLayer & {
  /**
   * the kind of url
   *
   * ArcGisFeatureServer - .../FeatureServer URL
   */
  urlType: 'ArcGisFeatureServer' | 'File_GeoJSON';

  /**
   * Layer Options to mixin during construction.
   * TODO what guarantees this? Zod in API or App?
   */
  layerOptions?: VectorLayerOptions;
};

type TileLayerDef = MapLayer & {
  /**
   * the kind of url
   *
   * WMTSCapabilitiesXml - URL of WMTSCapabilities.xml file
   */
  urlType: 'WMTSCapabilitiesXml' | 'ArcGisImageServer' | 'ArcGisMapServer' | 'XYZ';

  /**
   * Layer Options to mixin during construction.
   * TODO what guarantees this? Zod in API or App?
   */
  layerOptions?: TileLayerOptions;
};

export type LayerDef = VectorLayerDef | TileLayerDef;
