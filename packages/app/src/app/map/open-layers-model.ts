import { effect, signal, WritableSignal } from '@angular/core';
import type Layer from 'ol/layer/Layer';

// TODO cleanup/dispose
export class LayerController {
  readonly visible: WritableSignal<boolean>;
  readonly opacity: WritableSignal<number>;

  constructor(public readonly layer: Layer) {
    this.visible = signal(this.layer.getVisible());
    this.opacity = signal(this.layer.getOpacity());

    // Sync signal to layer state
    effect(() => {
      this.layer.setVisible(this.visible());
    });
    effect(() => {
      this.layer.setOpacity(this.opacity());
    });

    // Sync layer to signal (if changed externally)
    this.layer.on('change:visible', () => this.visible.set(this.layer.getVisible()));
    this.layer.on('change:opacity', () => this.opacity.set(this.layer.getOpacity()));
  }
}
