import { Style } from 'ol/layer/WebGLTile';
import { Color } from 'ol/color';

/**
 * Create Style for WebGLTile layer that colors a specific band value.
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

/**
 * Create Style for WebGLTile layer that interpolates band 1 values against the given
 * color's alpha channel.
 *
 * @param color Color for the target value
 * @param targetValue end color value (default 1)
 */
export function singleBandColorGradientLayerStyle(color: Color, targetValue = 1): Style {
  // start with transparent version of the color.
  const startColor = [color[0], color[1], color[2], 0];
  return {
    color: [
      'interpolate',
      ['linear'],
      ['band', 1], // Band index
      0, // no value
      startColor,
      targetValue,
      color
    ]
  };
}
