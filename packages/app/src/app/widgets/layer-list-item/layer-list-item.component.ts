import { Component, inject, input, OnInit } from '@angular/core';
import Layer from 'ol/layer/Layer';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MAP_UI, ReefGuideMapService } from '../../location-selection/reef-guide-map.service';
import { LayerController } from '../../map/openlayers-model';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-layer-list-item',
  imports: [MatIconButton, MatIcon, MatTooltip, MatProgressSpinner],
  templateUrl: './layer-list-item.component.html',
  styleUrl: './layer-list-item.component.scss'
})
export class LayerListItemComponent implements OnInit {
  private readonly mapService = inject(ReefGuideMapService);
  private readonly mapUI = inject(MAP_UI);

  layer = input.required<Layer>();

  layerController!: LayerController;

  ngOnInit(): void {
    const layer = this.layer();
    this.layerController = this.mapService.getLayerController(layer);

    layer.on('error', event => {
      // TODO display error
      console.warn('layer error', event);
    });
  }

  toggleVisible() {
    const layer = this.layer();
    this.layerController.visible.set(!layer.getVisible());
  }

  openStyleEditor() {
    this.mapUI.openLayerStyleEditor(this.layer());
  }
}
