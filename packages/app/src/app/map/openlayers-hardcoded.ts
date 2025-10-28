import VectorLayer from 'ol/layer/Vector';
import { Style, Text, Fill, Stroke } from 'ol/style';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';

const hideStyle = new Style();

/**
 * Special behaviors and styling for known map layers.
 */
export const LAYER_ADJUSTMENT: Record<string, (layer: VectorLayer) => void> = {
  GBRMPA_Zoning: (layer: VectorLayer) => {
    layer.setStyle(feature => {
      const type = feature.get('TYPE');
      const altZone = feature.get('ALT_ZONE');

      // TODO ~8k features, maybe should server-side filter
      if (altZone !== 'Pink Zone') {
        // hide this feature
        return hideStyle;
      }

      // Colors taken are from published ArcGis layer.
      // TODO arcgis to OpenLayers style
      return new Style({
        fill: new Fill({
          color: [255, 168, 255, 255]
        }),
        stroke: new Stroke({
          color: [110, 110, 110, 255],
          width: 0
        }),
        text: new Text({
          text: type || '',
          font: '14px Calibri,sans-serif',
          fill: new Fill({ color: '#000' })
        })
      });
    });

    // logFeaturesInfo(layer, ['TYPE', 'ALT_ZONE']);
  },
  canonical_reefs: (layer: VectorLayer) => {
    const source = layer.getSource();
    if (!source) {
      throw new Error('expected source to be set');
    }

    if (source instanceof VectorSource) {
      source.on('addfeature', event => {
        const { feature } = event;
        if (feature instanceof Feature) {
          addReefProps(feature);
        }
      });
    }
  }
};

/**
 * Add nice_reef_name and significance properties to the reef feature that are used for styling.
 */
function addReefProps(feature: Feature) {
  const reefName: string = feature.get('reef_name');
  let niceName = reefName; // default

  // check if unnamed reef
  if (reefName.startsWith('U/N Reef ')) {
    // less significant
    feature.set('significance', 2);
    // just use the GBRMPA id instead (don't display "U/N Reef")
    const gbrmpaId = feature.get('GBRMPA_ID');
    if (gbrmpaId) {
      niceName = gbrmpaId;
    }
  } else {
    // named reefs are more significant
    feature.set('significance', 1);
  }

  feature.set('nice_reef_name', niceName);
}
