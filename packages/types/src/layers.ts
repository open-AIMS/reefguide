import { Options as VectorLayerOptions } from 'ol/layer/Vector';
import { Options as WebGLTileLayerOptions } from 'ol/layer/WebGLTile';
import { Options as LayerGroupOptions } from 'ol/layer/Group';

type VectorOptions = Omit<VectorLayerOptions, 'source' | 'properties'>;
type TileOptions = Omit<WebGLTileLayerOptions, 'source' | 'properties'>;

/**
 * Properties common to all layer definitions.
 */
type BaseLayerDef = {
  /**
   * Criteria ID corresponding to CriteriaRangeOutput.id
   */
  id: string;

  /**
   * Layer title text
   */
  title: string;

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
  layerId?: string;

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

type VectorLayerDef = BaseLayerDef & {
  /**
   * the kind of url
   *
   * ArcGisFeatureServer - .../FeatureServer URL
   */
  urlType: 'ArcGisFeatureServer';

  /**
   * Layer Options to mixin during construction.
   */
  layerOptions?: VectorOptions;
};

type TileLayerDef = BaseLayerDef & {
  /**
   * the kind of url
   *
   * WMTSCapabilitiesXml - URL of WMTSCapabilities.xml file
   */
  urlType: 'WMTSCapabilitiesXml' | 'ArcGisImageServer' | 'ArcGisMapServer' | 'XYZ';

  /**
   * Layer Options to mixin during construction.
   */
  layerOptions?: TileOptions;
};

export type LayerDef = VectorLayerDef | TileLayerDef;
