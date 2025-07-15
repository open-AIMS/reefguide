import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';

/**
 * Create WMTS source based on the capabilities at the ArcGis map server.
 * Capabilities XML must exist: {url}/WMTS/1.0.0/WMTSCapabilities.xml
 * Sets the title property based on layer metadata
 * @param mapServerUrl
 */
export async function createSourceFromArcGIS(mapServerUrl: string): Promise<WMTS> {
  // 'https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_waves_Tp/MapServer'
  // Note: ArcGIS has an alternate WMTS URL
  // https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_waves_Tp/MapServer/WMTS/1.0.0/WMTSCapabilities.xml

  const capabilitiesUrl = `${mapServerUrl}/WMTS/1.0.0/WMTSCapabilities.xml`;

  // https://openlayers.org/en/latest/examples/wmts-layer-from-capabilities.html
  const response = await fetch(capabilitiesUrl);
  const text = await response.text();

  const parser = new WMTSCapabilities();
  const result = parser.read(text);

  const layerDef = result.Contents.Layer[0];
  const options = optionsFromCapabilities(result, {
    layer: layerDef.Identifier
  });

  if (options == null) {
    throw new Error('options null');
  }

  const wmts = new WMTS(options);
  wmts.set('title', layerDef.Title || layerDef.Identifier);
  return wmts;
}
