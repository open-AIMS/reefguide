import { effect, signal, WritableSignal } from '@angular/core';
import type Layer from 'ol/layer/Layer';
import { LayerProperties } from '../../types/layer.type';
import TileLayer from 'ol/layer/WebGLTile';
import { LayerDef } from '@reefguide/types';

type LayerStyleModes = 'default' | 'pixel-filtering';

export type LayerControllerOptions = {
  criteriaLayerDef?: LayerDef;
};

// TODO lifecycle/dispose concerns, may need to cleanup listeners
export class LayerController {
  readonly visible: WritableSignal<boolean>;
  readonly opacity: WritableSignal<number>;
  readonly styleMode = signal<LayerStyleModes>('default');

  constructor(
    public readonly layer: Layer,
    public readonly options?: LayerControllerOptions
  ) {
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
  public filterLayerPixels(min: number, max: number) {
    const layer = this.layer;
    if (layer instanceof TileLayer) {
      if (this.styleMode() !== 'pixel-filtering') {
        this.enablePixelFiltering();
      }

      // values at the extreme or beyond can cause the full layer extent to render the color,
      // so offset number value slightly to prevent this.
      if (min <= 0) {
        min = Number.EPSILON;
      }
      if (max >= 1) {
        // offset by EPSILON did not work. Maybe float64 to float32 conversion issue with GPU?
        // max = 1 - Number.EPSILON;
        max = 0.999999;
      }
      layer.updateStyleVariables({ min, max });
    }
  }

  public resetStyle() {
    this.styleMode.set('default');
    const layer = this.layer;
    if (layer instanceof TileLayer) {
      layer.setStyle({});
    }
  }

  /**
   * Sets the layer style to filter pixels using min, max style variables.
   * Changes the styleMode to pixel-filtering
   */
  private enablePixelFiltering() {
    this.styleMode.set('pixel-filtering');

    const layer = this.layer;
    if (layer instanceof TileLayer) {
      // OpenLayers bands are normalized 0 to 1
      let metric: any[] = ['band', 1];
      if (this.options?.criteriaLayerDef?.reverseRange) {
        // invert to align with values from criteria UI
        metric = ['-', 1, metric];
      }

      // if set to 0 or 1 entire layer extent renders color (depending on reverseRange)
      const flatColor = [
        'case',
        ['between', metric, ['var', 'min'], ['var', 'max']],
        [223, 19, 208, 1],
        [223, 19, 208, 0]
      ];

      layer.setStyle({
        variables: {
          // avoid full extent color render by offsetting numbers
          min: Number.EPSILON,
          max: 0.999999
        },
        color: flatColor
      });
    }
  }
}
