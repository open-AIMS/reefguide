# OpenLayers Notes

[OpenLayers website](https://openlayers.org/) has fairly good documentation. The Tutorials and Workshop are a bit limited, but worth skimming quickly. Generally the Examples and API are the most useful references.

There is also this [OpenLayers 3 book](https://openlayersbook.github.io/), which is a bit more comprehensive, but fairly old as [v4.0.0](https://github.com/openlayers/openlayers/releases/tag/v4.0.0) was released Feb 2017)

## Layer Definitions

`LayerDef` is a JSON description of a layer. Currently, these are hardcoded

### Map Initialization

ReefGuideMapService.setMap

## Layer Styling

Layer style can be defined using JSON [flat style](https://openlayers.org/en/latest/apidoc/module-ol_style_flat.html) or [style objects](https://openlayers.org/en/latest/apidoc/module-ol_style_Style-Style.html). Flat style should be favored as it's simpler and can be defined within `LayerDef` JSON, which can be stored directly in the database.

Examples: (search for "style", but these are interesting/useful ones)
* [Interactive styling example](https://openlayers.org/en/latest/examples/vector-labels.html)
* [Declutter Labels](https://openlayers.org/en/latest/examples/vector-label-decluttering.html)

## Expressions

WebGL raster layers can be styled using [Expressions](https://openlayers.org/en/latest/apidoc/module-ol_expr_expression.html#~ExpressionValue). This is a prefix math notation defined in JSON arrays that is compiled and executed on the GPU (for WebGL layers). It allows you to do various math on the color bands of your raster layer.

Layer color bands are normalized by default so band values are 0 to 1. To prevent this, set `normalize: false` on the `Layer` `source`.

AI seems to understand Openlayers expressions, so worth a try.

---

Interesting layers in this app:
* `canonical_reefs` `LayerDef` - has complex style expressions to improve the readability af reef labels.
* region assessment  `ReefGuideMapService.addRegionalAssessmentLayer` - uses `singleBandColorGradientLayerStyle` to interpolate color band.

### Expression Examples

There are a few expression examples. 
* [Band Contrast Stretch](https://openlayers.org/en/latest/examples/cog-stretch.html) - simple RGB math
* [WebGL Shaded Relief](https://openlayers.org/en/latest/examples/webgl-shaded-relief.html) - hillshade, complex expressions composed together.

---

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

# ArcGis

OpenLayers has some support for ArcGis, though some examples don't work. The ArcGis URLs we support are in `LayerDef.urlType`, see `createLayerFromDef`.
* [FeatureServer](https://openlayers.org/en/latest/examples/vector-esri.html) example works `urlType=ArcGisFeatureServer`
* MapServer WMTS - _/MapServer/WMTS/1.0.0/WMTSCapabilities.xml_ `urlType=WMTSCapabilitiesXml`
* [MapServer example](https://openlayers.org/en/latest/examples/arcgis-image.html) does not work
* ImageServer - may work with LERC custom loader. WIP

## Other ArcGis Issues

ArcGis has its own proprietary style system. There does not appear to be an open standard for layer styling. A library to convert ArcGis styles to OpenLayers styles would be useful.
