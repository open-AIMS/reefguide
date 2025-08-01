import VectorLayer from 'ol/layer/Vector';
import { Style, Text, Fill, Stroke } from 'ol/style';
import { Feature } from 'ol';

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

  const source = layer.getSource();
  if (source) {
    // gather stats
    const allTypes = new Set<string>();
    const allAltZones = new Set<string>();
    let count = 0;
    source.on('featuresloadend', () => {
      for (const feature of source.getFeatures()) {
        if (feature instanceof Feature) {
          count++;
          // console.log('feature', feature.getProperties());
          allAltZones.add(feature.get('ALT_ZONE'));
          allTypes.add(feature.get('TYPE'));
        }
      }

      console.log(`GBRMPZoning ${count} features. ALT_ZONEs, TYPEs`, allAltZones, allTypes);
    });
  }
}
