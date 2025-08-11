import { Component, inject, input, WritableSignal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import Layer from 'ol/layer/Layer';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { ReefGuideMapService } from '../../location-selection/reef-guide-map.service';
import { LayerController } from '../../map/openlayers-model';

// TODO layer blend mode. was for ArcGis, but these are standard canvas blend modes
const BLEND_MODES = [
  'average',
  'color-burn',
  'color-dodge',
  'color',
  'darken',
  'destination-atop',
  'destination-in',
  'destination-out',
  'destination-over',
  'difference',
  'exclusion',
  'hard-light',
  'hue',
  'invert',
  'lighten',
  'lighter',
  'luminosity',
  'minus',
  'multiply',
  'normal', // default
  'overlay',
  'plus',
  'reflect',
  'saturation',
  'screen',
  'soft-light',
  'source-atop',
  'source-in',
  'source-out',
  'vivid-light',
  'xor'
];

/**
 * Layer style editor.
 *
 * TODO add more features for OpenLayers
 */
@Component({
  selector: 'app-layer-style-editor',
  imports: [MatFormFieldModule, MatSelectModule, MatSliderModule, MatSlideToggle],
  templateUrl: './layer-style-editor.component.html',
  styleUrl: './layer-style-editor.component.scss'
})
export class LayerStyleEditorComponent {
  private readonly mapService = inject(ReefGuideMapService);

  layer = input.required<Layer>();
  layerController!: LayerController;

  blendModes = BLEND_MODES;

  /**
   * Defined if color supported
   */
  currentColor?: WritableSignal<string>;

  ngOnInit() {
    const layer = this.layer();
    this.layerController = this.mapService.getLayerController(layer);

    if (this.layerController.color) {
      this.currentColor = this.layerController.color;
    }
  }

  // onBlendModeChange(value: BlendModes) {
  //   const layer = this.layer();
  //   layer.getRenderer().???
  // }

  onOpacityInput($event: Event) {
    const inputEl = $event.target as HTMLInputElement;
    const opacityValue = Number(inputEl.value);
    this.layer().setOpacity(opacityValue);
  }

  onColorChange(event: Event) {
    const el = event.target! as HTMLInputElement;
    const colorString = el.value as string;
    this.currentColor?.set(colorString);
  }
}
