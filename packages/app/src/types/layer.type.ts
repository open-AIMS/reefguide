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
};
