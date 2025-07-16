import proj4 from 'proj4';
import { get as getProjection } from 'ol/proj.js';
import { register } from 'ol/proj/proj4';

/**
 * Register ESPG:7844 projection with OpenLayers.
 *
 * safe to call multiple times; register docs state:
 * "Existing transforms will not be modified by this function"
 *
 * https://openlayers.org/doc/tutorials/raster-reprojection.html
 * https://epsg.io/7844
 * https://spatialreference.org/ref/epsg/7844/
 */
export function openlayersRegisterEPSG7844() {
  const projId = 'EPSG:7844';
  proj4.defs(projId, '+proj=longlat +ellps=GRS80 +no_defs +type=crs');
  register(proj4);
  // Important: the WKT 2 BBOX value is incorrect for setExtent [-60.55, 93.41, -8.47, 173.34];
  // Instead, we want WGS84 Bounds: 93.41, -60.55, 173.34, -8.47 listed at spatialreference.org
  // lat/lon pairs are flipped between these formats
  const bounds = [93.41, -60.55, 173.34, -8.47];
  const proj7844 = getProjection(projId);
  proj7844!.setExtent(bounds);

  // For reference, if the extent were in other coords you would transform like this:
  // convert from EPSG:4326 coords to EPSG:7844
  // const extent = transformExtent(bounds, 'EPSG:4326', projId);
}
