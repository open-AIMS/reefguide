import Layer from 'ol/layer/Layer';
import LayerGroup from 'ol/layer/Group';
import { Collection, Feature } from 'ol';
import BaseLayer from 'ol/layer/Base';
import { fromEventPattern, Observable } from 'rxjs';
import { EventsKey } from 'ol/events';
import OLBaseEvent from 'ol/events/Event';
import BaseObject, { ObjectEvent } from 'ol/Object';
import { TileSourceEvent } from 'ol/source/Tile';
import VectorLayer from 'ol/layer/Vector';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { Cluster, TileDebug } from 'ol/source';
import CircleStyle from 'ol/style/Circle';
import TileLayer from 'ol/layer/WebGLTile';
import DataTileSource from 'ol/source/DataTile';

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

/**
 * Create an Observable from an OpenLayer's object event.
 * @param obj
 * @param eventName
 *
 * TODO fix V type, it can be ObjectEvent
 */
export function fromOpenLayersEvent<
  O extends BaseObject,
  E = Parameters<O['on']>[0],
  V = OLBaseEvent | ObjectEvent | TileSourceEvent
>(obj: O, eventName: E): Observable<V> {
  return fromEventPattern<V>(
    // TODO figure out whey eventName type check not happy
    handler => obj.on(eventName as any, handler),
    (handler, key: EventsKey) => obj.un(eventName as any, handler)
  );
}

/**
 * Wrap the layer's current source with a new Cluster, which becomes the source.
 * @param layer
 */
export function clusterLayerSource(layer: VectorLayer) {
  const source = layer.getSource();
  // TODO if source null, could wait on sourceready
  if (source) {
    const styleCache: Record<number, Style> = {};
    const cluster = new Cluster({
      source
    });
    layer.setSource(cluster);

    layer.setStyle(feature => {
      const size: number = feature.get('features').length;
      let style = styleCache[size];
      if (!style) {
        style = new Style({
          image: new CircleStyle({
            radius: 10,
            stroke: new Stroke({
              color: '#fff'
            }),
            fill: new Fill({
              color: '#3399CC'
            })
          })
        });
        if (size >= 2) {
          style.setText(
            new Text({
              text: size.toString(),
              fill: new Fill({
                color: '#fff'
              })
            })
          );
        }
        styleCache[size] = style;
      }
      return style;
    });
  } else {
    console.warn('No source, clusterLayerSource has no effect!');
  }
}

/**
 * Create a TileLayer with TileDebug source.
 * @param source use the projection and tileGrid from this source
 */
export function createTileDebugLayer(source?: DataTileSource | null): TileLayer {
  return new TileLayer({
    source: new TileDebug({
      // template: 'z:{z} x:{x} y:{-y}',
      // null not assignable
      projection: source?.getProjection() ?? undefined,
      tileGrid: source?.getTileGrid() ?? undefined,
      // what tiles to use when between zoom levels
      zDirection: 1
    })
  });
}

/**
 * Log information about features as they are loaded, track distinct values of props.
 * @param layer
 * @param props
 */
export function logFeaturesInfo(layer: VectorLayer, props: string[]) {
  const source = layer.getSource();
  if (source) {
    // gather stats
    const distinctValues = new Map<string, Set<string>>();
    for (const prop of props) {
      distinctValues.set(prop, new Set());
    }

    let totalCount = 0;
    source.on('featuresloadend', () => {
      let eventCount = 0;
      for (const feature of source.getFeatures()) {
        if (feature instanceof Feature) {
          eventCount++;
          totalCount++;

          for (const prop of props) {
            const value = feature.get(prop);
            if (value != null) {
              distinctValues.get(prop)!.add(String(value));
            }
          }
        }
      }

      console.log(`GBRMPZoning ${totalCount} features. ALT_ZONEs, TYPEs`, distinctValues);
    });
  }
}
