/**
 * Definition of a map layer that visualizes a criteria.
 * Should be greyscale, color and styling is done by the app.
 */
export type CriteriaLayerDef = {
  /**
   * Criteria ID corresponding to CriteriaRangeOutput.id
   */
  id: string;
  /**
   * Layer title text
   */
  title: string;
  /**
   * May layer URL
   */
  url: string;

  /**
   * the kind of url
   *
   * WMTSCapabilitiesXml - URL of WMTSCapabilities.xml file
   */
  urlType: 'WMTSCapabilitiesXml';

  /**
   * Web page where user can learn about the layer.
   */
  infoUrl?: string;

  /**
   * Reverse criteria range values when applying pixel filter
   */
  reverseRange?: boolean;
};
