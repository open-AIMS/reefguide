import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';

/**
 * Register ESPG:7844 projection with OpenLayers.
 *
 * safe to call multiple times; register docs state:
 * "Existing transforms will not be modified by this function"
 *
 * https://openlayers.org/doc/tutorials/raster-reprojection.html
 * https://epsg.io/7844
 */
export function openlayersRegisterEPSG7844() {
  proj4.defs('EPSG:7844', '+proj=longlat +ellps=GRS80 +no_defs +type=crs');
  register(proj4);
  // REVIEW docs then setExtent, but this is not listed at epsg.io
  // const proj27700 = getProjection('EPSG:27700');
  // proj27700.setExtent([0, 0, 700000, 1300000]);
}
