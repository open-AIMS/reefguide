import { Component, computed, input, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import Layer from 'ol/layer/Layer';

// REVIEW was for ArcGis, but these are canvas blend modes
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
  imports: [MatFormFieldModule, MatSelectModule, MatSliderModule],
  templateUrl: './layer-style-editor.component.html',
  styleUrl: './layer-style-editor.component.scss'
})
export class LayerStyleEditorComponent {
  layer = input.required<Layer>();

  blendModes = BLEND_MODES;

  supportsColor = signal(false);
  // supportsColor = computed(() => {
  //   // HACK until we abstract layers properly.
  //   // TODO fix
  //   // @ts-ignore
  //   return this.layer().title.startsWith('Assessed Regions');
  // });
  //
  // currentColor = computed(() => {
  //   const layer = this.layer();
  //   let color: string | undefined;
  //   if (layer) {
  //     this.iteratePolygonLayers(layer, graphicsLayer => {
  //       color = getPolygonLayerColor(graphicsLayer);
  //       return false;
  //     });
  //   }
  //
  //   return color;
  // });

  // onBlendModeChange(value: BlendModes) {
  //   const layer = this.layer();
  //   layer.getRenderer().???
  // }

  onOpacityInput($event: Event) {
    const inputEl = $event.target as HTMLInputElement;
    const opacityValue = Number(inputEl.value);
    this.layer().setOpacity(opacityValue);
  }

  // onColorChange(event: Event) {
  //   const el = event.target! as HTMLInputElement;
  //   const color = el.value;
  //   this.iteratePolygonLayers(this.layer(), graphicsLayer => {
  //     changePolygonLayerColor(graphicsLayer, color);
  //     return true;
  //   });
  // }
}
