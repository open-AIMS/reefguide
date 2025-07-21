import WMTSCapabilities from 'ol/format/WMTSCapabilities';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';

/**
 * Create WMTS source based from capabilities XML file url.
 * Sets the title property based on layer metadata
 * @param capabilitiesUrl URL to WMTS Capabilities XML file
 */
export async function createSourceFromCapabilitiesXml(capabilitiesUrl: string): Promise<WMTS> {
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

  // change to nearest neighbor, prevents darkened edge with default linear interpolation
  options.interpolate = false;

  const wmts = new WMTS(options);
  wmts.set('title', layerDef.Title || layerDef.Identifier);
  return wmts;
}
