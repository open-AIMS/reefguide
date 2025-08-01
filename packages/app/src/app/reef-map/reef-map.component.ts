import { AfterViewInit, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/WebGLTile';
import OSM from 'ol/source/OSM';
import ScaleLine from 'ol/control/ScaleLine';
import { ReefGuideMapService } from '../location-selection/reef-guide-map.service';
import { LayerListComponent } from '../widgets/layer-list/layer-list.component';
import { JobStatusListComponent } from '../widgets/job-status-list/job-status-list.component';
import { debounceTime, map, Observable, Subject } from 'rxjs';
import LayerGroup from 'ol/layer/Group';
import { LayerProperties } from '../../types/layer.type';
import Layer from 'ol/layer/Layer';
import { moveItemInArray } from '@angular/cdk/drag-drop';
import { MapBrowserEvent } from 'ol';
import { MatDialog } from '@angular/material/dialog';
import { FeatureInfoDialogComponent } from '../widgets/feature-info-dialog/feature-info-dialog.component';
import { FeatureLike } from 'ol/Feature';

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
  imports: [LayerListComponent, JobStatusListComponent],
  styleUrl: './reef-map.component.scss'
})
export class ReefMapComponent implements AfterViewInit {
  private readonly dialog = inject(MatDialog);
  private mapEl = viewChild.required<ElementRef>('olMap');

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

  private layersChange$ = new Subject<void>();
  private _lastEmittedLayers?: Layer[];

  /**
   * Flat list of all layers ordered by zIndex descending.
   */
  public sortedLayers$: Observable<Layer[]> = this.layersChange$.pipe(
    debounceTime(50),
    map(() => {
      // For now show all layers in flat list;
      // in future could display tree by recursing through getLayers()
      // getAllLayers will recursively get all leaf layers
      const allLayers = this.map.getAllLayers();
      this.setMissingZindexes(allLayers);
      allLayers.sort((a, b) => b.getZIndex()! - a.getZIndex()!);
      this._lastEmittedLayers = allLayers;
      return allLayers;
    })
  );

  public readonly loading = signal(false);

  constructor() {}

  /**
   * Create OpenLayers Map and hookup everything.
   */
  ngAfterViewInit() {
    const baseLayer = new TileLayer({
      // @ts-expect-error this source works with WebGLTileLayer, ignore the type error
      // https://github.com/openlayers/openlayers/issues/16794
      source: new OSM(),
      properties: {
        title: 'Base map (OSM)',
        infoUrl: 'https://www.openstreetmap.org/copyright'
      } satisfies LayerProperties
    });

    this.map = new Map({
      target: this.mapEl().nativeElement,
      view: this.view,
      layers: [baseLayer]
    });

    // REVIEW better design if one-way (map component listens to service)
    //  maybe move View to service
    this.mapService?.setMap(this.map);
    this.hookEvents(this.map);
    this.setupMapControls(this.map);

    // trigger change to pickup base map layer
    this.layersChange$.next();
  }

  /**
   * Re-order the layer to this position in allLayers.
   * Bumps the zIndex of other layers up
   */
  public reorderLayer(previousIndex: number, currentIndex: number) {
    const allLayers = this._lastEmittedLayers!;
    moveItemInArray(allLayers, previousIndex, currentIndex);

    for (let i = 0; i < allLayers.length; i++) {
      const layer = allLayers[i];
      layer.setZIndex(allLayers.length - i);
    }

    // trigger sortedLayersChange$
    this.layersChange$.next();
  }

  /**
   * Zoom to the extent of layer's map features.
   */
  public async zoomToExtent(layer: unknown) {
    throw new Error('Not implemented!');
  }

  private hookEvents(map: Map) {
    // TODO ideally would create RxJS observable util that wraps OpenLayers event system

    // TODO this may need to be recursive if we don't always add/remove root layers
    map.getLayers().on('change:length', event => {
      // console.log(`root layers change from ${event.oldValue} to ${map.getLayers().getLength()}`);
      this.layersChange$.next();
      this.updateLayerGroupListeners();
    });

    map.on('loadstart', event => {
      this.loading.set(true);
    });
    map.on('loadend', () => {
      this.loading.set(false);
    });

    map.on('click', event => {
      this.onClick(event);
    });
  }

  private setupMapControls(map: Map) {
    map.addControl(new ScaleLine());
  }

  private _listeningLayerGroups = new Set<LayerGroup>();

  /**
   * Start listening to immediate-child LayerGroup change:length if not already.
   * TODO make recursive if nested LayerGroups
   */
  private updateLayerGroupListeners() {
    this.map.getLayers().forEach(layer => {
      if (layer instanceof LayerGroup && !this._listeningLayerGroups.has(layer)) {
        // dispose cleans up listeners, so shouldn't need to manage subscription
        layer.getLayers().on('change:length', event => {
          this.layersChange$.next();
        });
        // TODO cleanup on LayerGroup remove
        this._listeningLayerGroups.add(layer);
      }
    });
  }

  private setMissingZindexes(allLayers: Layer[]) {
    let highest_zIndex = 0;
    allLayers.forEach(layer => {
      const zIndex = layer.getZIndex();
      if (zIndex === undefined) {
        highest_zIndex++;
        layer.setZIndex(highest_zIndex);
      } else {
        highest_zIndex = Math.max(highest_zIndex, zIndex);
      }
    });
  }

  private onClick(event: MapBrowserEvent) {
    console.log('map click', event);
    const features: FeatureLike[] = [];
    this.map.forEachFeatureAtPixel(event.pixel, feature => {
      console.log('feature at click', feature.getProperties(), feature);
      // Cluster point has child features
      const childFeatures = feature.get('features');
      if (childFeatures instanceof Array) {
        for (const child of childFeatures) {
          features.push(child);
        }
      } else {
        features.push(feature);
      }
    });

    if (features.length === 0) {
      return;
    }

    this.dialog.open(FeatureInfoDialogComponent, {
      // allows moving map under dialog, but no close on outside click
      // hasBackdrop: false,
      data: {
        features
      }
    });
  }
}
