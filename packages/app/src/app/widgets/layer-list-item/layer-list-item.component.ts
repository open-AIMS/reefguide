import { Component, input, OnInit, signal } from '@angular/core';
import Layer from 'ol/layer/Layer';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'app-layer-list-item',
  imports: [MatIconButton, MatIcon],
  templateUrl: './layer-list-item.component.html',
  styleUrl: './layer-list-item.component.scss'
})
export class LayerListItemComponent implements OnInit {
  layer = input.required<Layer>();

  // FUTURE ideally have some kind of layer signal wrapper shared among components
  isVisible = signal(true);

  ngOnInit(): void {
    const layer = this.layer();

    this.isVisible.set(layer.isVisible());

    layer.on('change:visible', () => {
      this.isVisible.set(layer.isVisible());
    });

    layer.on('error', event => {
      // TODO display error
      console.warn('layer error', event);
    });
  }

  toggleVisible() {
    const layer = this.layer();
    layer.setVisible(!layer.getVisible());
  }
}
