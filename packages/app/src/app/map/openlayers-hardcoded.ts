import VectorLayer from 'ol/layer/Vector';
import { Style, Text, Fill, Stroke } from 'ol/style';

const hideStyle = new Style();

export function setupGBRMPZoning(layer: VectorLayer) {
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
}
