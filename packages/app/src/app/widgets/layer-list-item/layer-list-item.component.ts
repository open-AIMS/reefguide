import { Component, inject, input, OnInit } from '@angular/core';
import Layer from 'ol/layer/Layer';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { MAP_UI, ReefGuideMapService } from '../../location-selection/reef-guide-map.service';
import { LayerController } from '../../map/openlayers-model';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { downloadFile } from '../../../util/js-util';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-layer-list-item',
  imports: [MatIconButton, MatIcon, MatTooltip, MatProgressSpinner],
  templateUrl: './layer-list-item.component.html',
  styleUrl: './layer-list-item.component.scss'
})
export class LayerListItemComponent implements OnInit {
  private readonly mapService = inject(ReefGuideMapService);
  private readonly mapUI = inject(MAP_UI);
  private readonly snackbar = inject(MatSnackBar);

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

  async download() {
    const layerDownload = this.layerController.download;
    const id = this.layer().get('id');
    if (layerDownload) {
      try {
        const { filename, data } = await layerDownload();
        await downloadFile(data, filename);
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
          return;
        }
        console.error(`Error downloading layer data id=${id}`, e);
        const title = this.layer().get('title');
        this.snackbar.open(`Error downloading ${title}`, 'OK');
      }
    } else {
      console.error(`Attempt to download layer that does not support it. id=${id}`);
    }
  }
}
