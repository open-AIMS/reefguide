import { Options } from 'ol/layer/Layer';

/**
 * Definition of a map layer that visualizes a criteria.
 * Should be greyscale, color and styling is done by the app.
 */
export type LayerDef = {
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
   */
  url: string;

  /**
   * the kind of url
   *
   * WMTSCapabilitiesXml - URL of WMTSCapabilities.xml file
   * ArcGisFeatureServer - .../FeatureServer URL
   */
  urlType: 'WMTSCapabilitiesXml' | 'ArcGisImageServer' | 'ArcGisMapServer' | 'ArcGisFeatureServer';

  /**
   * Web page where user can learn about the layer.
   */
  infoUrl?: string;

  /**
   * Reverse criteria range values when applying pixel filter
   */
  reverseRange?: boolean;
  /**
   * Layer Options to mixin during construction.
   */
  layerOptions?: Partial<Omit<Options, 'source' | 'properties'>>;

  /**
   * Wrap the VectorSource in a Cluster.
   */
  cluster?: boolean;
};
