import { Component, inject } from '@angular/core';
import { ReefMapComponent } from '../../reef-map/reef-map.component';
import { AsyncPipe } from '@angular/common';
import { LayerListItemComponent } from '../layer-list-item/layer-list-item.component';
import { MatExpansionPanel, MatExpansionPanelHeader } from '@angular/material/expansion';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import Layer from 'ol/layer/Layer';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-layer-list',
  imports: [
    AsyncPipe,
    LayerListItemComponent,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    MatProgressSpinner,
    DragDropModule,
    MatIconModule
  ],
  templateUrl: './layer-list.component.html',
  styleUrl: './layer-list.component.scss'
})
export class LayerListComponent {
  mapComponent = inject(ReefMapComponent);

  constructor() {}

  onDrop(event: CdkDragDrop<Layer[]>) {
    // const layer = event.item.data as Layer;
    this.mapComponent.reorderLayer(event.previousIndex, event.currentIndex);
  }
}
