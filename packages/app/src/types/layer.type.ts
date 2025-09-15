/**
 * Properties app code may set on the layers.
 */
export type LayerProperties = {
  id?: string;
  title?: string;
  /**
   * User may download this layer file
   */
  downloadUrl?: string;
  /**
   * Informational page about the layer.
   */
  infoUrl?: string;
  /**
   * Feature property to use for labels.
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
};
