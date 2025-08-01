import { Style } from 'ol/layer/WebGLTile';
import { Color } from 'ol/color';

/**
 * Set style on TileLayer that colors a specific band value.
 *
 * Note: for binary GeoTIFF with normalize=false the default targetValue=1 is correct.
 * @param color Color to use
 * @param targetValue the band value that the color applies to
 * @returns Style object with color property
 */
export function singleColorLayerStyle(color: Color, targetValue = 1): Style {
  const value = ['band', 1];
  return {
    color: ['case', ['==', value, targetValue], color, [0, 0, 0, 0]]
    // Note: var within color value doesn't work, so can't use style variables
    // color: ['case', ['==', value, targetValue], [ 0, ['var', 'g'], 0, 1], [0, 0, 0, 0]]
  };
}
