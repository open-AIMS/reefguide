# OpenLayers Notes


# Style

## Expressions

WebGL raster layers can be styled using [Expressions](https://openlayers.org/en/latest/apidoc/module-ol_expr_expression.html#~ExpressionValue). This is a prefix math notation defined in JSON arrays that is compiled and executed on the GPU. It allows you to do various math on the color bands of your raster layer.



Layer color bands are normalized by default so band values are 0 to 1. To prevent this, set `normalize: false` on the `Layer` `source`.

AI seems to understand Openlayers expressions, so worth a try.

### Examples

There are a few expression examples. 
*  [Band Contrast Stretch](https://openlayers.org/en/latest/examples/cog-stretch.html) - simple RGB math
* [WebGL Shaded Relief](https://openlayers.org/en/latest/examples/webgl-shaded-relief.html) - hillshade, complex expressions composed together.

### Interpolation

An interpolation with 3 stops from red to green. The stop at zero is necessary to prevent the no-data values from showing as red. This 

```javascript
color: [
  'interpolate',
  ['linear'],
  ['band', 1], // Band index
  0, // no data value
  [0, 0, 0, 0], // transparent
  0.0001,
  [255, 0, 0, 1], // color at band value +0
  100,
  [0, 255, 0, 1] // color at band value 1
]
```
