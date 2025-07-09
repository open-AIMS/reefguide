import Layer from 'ol/layer/Layer';

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
