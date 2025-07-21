import { effect, signal, WritableSignal } from '@angular/core';
import type Layer from 'ol/layer/Layer';
import { LayerProperties } from '../../types/layer.type';
import TileLayer from 'ol/layer/WebGLTile';

// TODO lifecycle/dispose concerns, may need to cleanup listeners
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

  /**
   * Get the layer's custom properties.
   */
  public getProperties(): LayerProperties {
    return this.layer.getProperties();
  }

  /**
   * Pixel-filter the primary band using normalized values 0-1
   * @param min normalized 0:1 minimum value
   * @param max normalized 0:1 maximum value
   */
  filterCriteriaLayer(min: number, max: number) {
    const layer = this.layer;
    if (layer instanceof TileLayer) {
      // console.log('filter criteria layer', min, max);
      // prevent full layer extent rendering color issue when min/max at extreme
      if (min === 0) {
        min = 0.0000001;
      }
      if (max === 1) {
        max = 0.999999;
      }
      layer.updateStyleVariables({ min, max });
    }
  }
}
