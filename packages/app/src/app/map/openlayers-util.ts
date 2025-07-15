import Layer from 'ol/layer/Layer';
import LayerGroup from 'ol/layer/Group';
import { Collection } from 'ol';
import BaseLayer from 'ol/layer/Base';

/**
 * Call the function when the layer is disposed.
 * Listens to change:source and executes when source is null
 * @param layer
 * @param callback
 */
export function onLayerDispose(layer: Layer, callback: () => void): void {
  // no official dispose event, but change:source set to null on dispose
  // assuming we don't change source during life of layer
  const id = layer.once('change:source', () => {
    // layer.disposed is true but protected, so check if source is null
    if (layer.getSource() == null) {
      callback();
    }
  });
}

/**
 * Recursively dispose and remove layers.
 *
 * OpenLayers does not seem to do this automatically, or there's a bug with the
 * site suitability vector layer automatic dispose.
 *
 * @param layerGroup group to dispose+remove child layers from
 * @param parentCollection collection that contains the LayerGroup, if provided remove and dispose
 *                         the given layerGroup.
 */
export function disposeLayerGroup(
  layerGroup: LayerGroup,
  parentCollection?: Collection<BaseLayer>
): void {
  const childLayers = layerGroup.getLayers();
  childLayers.forEach(layer => {
    if (layer instanceof LayerGroup) {
      disposeLayerGroup(layer, childLayers);
    } else {
      // though maybe don't need to dispose at all?
      // https://github.com/openlayers/openlayers/issues/11052#issuecomment-629844304
      layer.dispose();
    }
  });

  childLayers.clear();

  if (parentCollection) {
    layerGroup.dispose();
    parentCollection.remove(layerGroup);
  }
}
