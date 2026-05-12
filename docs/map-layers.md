# ReefGuide Map Layers

## Strategy

At the moment, ReefGuide does not have a map service, though one could easily be deployed. There are various open source options such as [GeoServer](https://geoserver.org/). The main issue is cloud expenses; for AIMS, which already has ArcGis Online, it saves on costs to host static geospatial data on ArcGis. The more important thing is not to be tied to proprietary features, so ReefGuide only works with open standards defined by the [Open Geospatial Consortium](https://www.ogc.org/).

File-based geospatial data such as GeoTIFF or GeoJSON files can be hosted by ReefGuide. TODOC.

Note: ArcGis authentication is not implemented yet, so ArcGis layers must be made public.

## Layers Table

All of the spatial layers in the app are defined in the database.

TODOC metadata.

### Permissions

Layers can be

## Original Documentation

Prior to moving layers to the database, these were the layers. \
TODO create and link to layers overview page in ReefGuide

Below is documented the current reefguide contextual layers, and their associated status and data source.

| Title                            | Source (URL)                                                                                                                                                              | Layer Type    | Status  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------- |
| WavesTp                          | [ArcGIS](https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_waves_Tp/MapServer/WMTS/1.0.0/WMTSCapabilities.xml)                                     | WMTS (Raster) | Working |
| WavesHs                          | [ArcGIS](https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_wave_Hs_data/MapServer/WMTS/1.0.0/WMTSCapabilities.xml)                                 | WMTS (Raster) | Working |
| Slope                            | [ArcGIS](https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_slope_data/MapServer/WMTS/1.0.0/WMTSCapabilities.xml)                                   | WMTS (Raster) | Working |
| Depth                            | [ArcGIS](https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/GBR_bathymetry/MapServer/WMTS/1.0.0/WMTSCapabilities.xml)                                   | WMTS (Raster) | Working |
| QPWS Moorings                    | [ArcGIS](https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer)                                                       | MapServer     | Working |
| QPWS Reef Protection Markers     | [ArcGIS](https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineMoorings/MapServer/10)                                                    | FeatureServer | Working |
| EcoRRAP Site Locations           | [ArcGIS](https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/EcoRRAP_Site_Locations/FeatureServer)                                                         | FeatureServer | Working |
| Hybrid Benthic                   | [ArcGIS](https://tiles.arcgis.com/tiles/wfyOCawpdks4prqC/arcgis/rest/services/hybrid_benthic/MapServer/WMTS/1.0.0/WMTSCapabilities.xml)                                   | WMTS (Raster) | Working |
| RRAP Canonical Reefs             | [ArcGIS](https://services3.arcgis.com/wfyOCawpdks4prqC/arcgis/rest/services/RRAP_Canonical_Reefs/FeatureServer)                                                           | FeatureServer | Working |
| GBRMP Zoning                     | [ArcGIS](https://services8.arcgis.com/ll1QQ2mI4WMXIXdm/ArcGIS/rest/services/Great_Barrier_Reef_Marine_Park_Zoning_20/FeatureServer)                                       | FeatureServer | Working |
| GBRMPA Management Regions        | [ArcGIS](https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Management_Areas_20/FeatureServer)                          | FeatureServer | Working |
| GBRMPA Cruise Ship Transit Lanes | [ArcGIS](https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Cruise_Ship_Transit_Lanes_20/FeatureServer)                 | FeatureServer | Working |
| GBRMPA TUMRA Agreements          | [ArcGIS](https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Traditional_Use_of_Marine_Resources_TUMRA_20/FeatureServer) | FeatureServer | Working |
| GBRMPA Designated Shipping Areas | [ArcGIS](https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Great_Barrier_Reef_Marine_Park_Designated_Shipping_Areas_201/FeatureServer)                | FeatureServer | Working |
| Maritime Safety Port Limits      | [ArcGIS](https://services-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/Maritime_Safety_Port_Limits/FeatureServer)                                                 | FeatureServer | Working |
| SSR Sentinel 2018                | [ArcGIS](https://tiles-ap1.arcgis.com/8gXWSCxaJlFIfiTr/arcgis/rest/services/SSR_Sentinel_2018/MapServer)                                                                  | WMTS (Raster) | Working |
| Base map (OSM)                   | [OSM](https://www.openstreetmap.org/)                                                                                                                                     | OSM (Raster)  | Working |
