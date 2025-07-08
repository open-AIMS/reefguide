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
 *
 * Note: year and timestamp stuff is related to old prototype that would update reef polygons
 * with relative cover values from ADRIA. Leaving it here for now.
 * TODO review timestep/year and relative_cover code
 */
@Component({
  selector: 'app-reef-map',
  templateUrl: './reef-map.component.html',
  styleUrl: './reef-map.component.scss'
})
export class ReefMapComponent implements AfterViewInit {
  private hostEl: ElementRef = inject(ElementRef);

  readonly mapService = inject(ReefGuideMapService, { optional: true });

  // will be defined after view init
  map!: Map;

  constructor() {}

  ngAfterViewInit() {
    this.map = new Map({
      target: this.hostEl.nativeElement,
      view: new View({
        center: [0, 0],
        zoom: 1
      }),
      layers: [
        new TileLayer({
          source: new OSM()
        })
      ]
    });

    this.mapService?.setMap(this.map);

    console.log('here', this.hostEl);
  }

  /**
   * Zoom to the extent of layer's map features.
   */
  public async zoomToExtent(layer: unknown) {
    throw new Error('Not implemented!');
  }
}
