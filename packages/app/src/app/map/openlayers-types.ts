import { FeatureLike } from 'ol/Feature';
import Layer from 'ol/layer/Layer';
import { SimpleGeometry } from 'ol/geom';

/**
 * A Feature and its Layer.
 * Collection of information from a click event.
 */
export interface FeatureRef {
  feature: FeatureLike;
  layer: Layer;
  geometry: SimpleGeometry;
}
