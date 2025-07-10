import { AfterViewInit, Component, ElementRef, inject } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { ReefGuideMapService } from '../location-selection/reef-guide-map.service';

/**
 * OpenLayers map and UI for layer management and map navigation.
 *
 * This component is primarily concerned with UI. Layer management is done with ReefGuideMapService;
 * this component reflects the state of that service. This design enables external components
 * to manipulate map layers.
 */
@Component({
  selector: 'app-reef-map',
  templateUrl: './reef-map.component.html',
  styleUrl: './reef-map.component.scss'
})
export class ReefMapComponent implements AfterViewInit {
  private hostEl: ElementRef = inject(ElementRef);

  readonly mapService = inject(ReefGuideMapService, { optional: true });

  /**
   * View that is associated with OpenLayers Map.
   */
  view: View = new View({
    center: [0, 0],
    zoom: 2
    // projection needs to be set at View construction time
    // this does adjust basemap tiles, which makes text a bit ugly
    // ideally would have basemap native to projection
    // projection: 'EPSG:7844'
  });

  // will be defined after view init
  private map!: Map;

  constructor() {}

  /**
   * Create OpenLayers Map and hookup everything.
   */
  ngAfterViewInit() {
    console.log('ngAfterViewInit');
    this.map = new Map({
      target: this.hostEl.nativeElement,
      view: this.view,
      layers: [
        new TileLayer({
          source: new OSM()
        })
      ]
    });

    // REVIEW better design for this component to only listen to service
    //  maybe move View to service
    this.mapService?.setMap(this.map);
    this.hookEvents(this.map);
  }

  /**
   * Zoom to the extent of layer's map features.
   */
  public async zoomToExtent(layer: unknown) {
    throw new Error('Not implemented!');
  }

  private hookEvents(map: Map) {
    // REVIEW maybe use signals or RxJS to handle events
    map.on('click', event => {
      console.log('Map click', event);
    });
  }
}
