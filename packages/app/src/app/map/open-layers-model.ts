import { effect, signal, WritableSignal } from '@angular/core';
import type Layer from 'ol/layer/Layer';
import { LayerProperties } from '../../types/layer.type';
import TileLayer from 'ol/layer/WebGLTile';
import { CriteriaLayerDef } from '@reefguide/types';

type LayerStyleModes = 'default' | 'pixel-filtering';

export type LayerControllerOptions = {
  criteriaLayerDef?: CriteriaLayerDef;
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

  public resetStyle() {
    this.styleMode.set('default');
    const layer = this.layer;
    if (layer instanceof TileLayer) {
      layer.setStyle({});
    }
  }

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

      const flatColor = [
        'case',
        ['between', metric, ['var', 'min'], ['var', 'max']],
        [223, 19, 208, 1],
        [223, 19, 208, 0]
      ];

      layer.setStyle({
        variables: {
          // if set to 0 or 1 entire layer extent renders color (depending on reverseRange)
          min: 0.0000001,
          max: 0.999999
        },

        color: flatColor
      });
    }
  }
}
