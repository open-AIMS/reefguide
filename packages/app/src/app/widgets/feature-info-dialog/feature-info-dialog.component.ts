import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { FeatureRef } from '../../map/openlayers-types';

@Component({
  selector: 'app-feature-info-dialog',
  imports: [MatDialogModule, MatTabsModule],
  templateUrl: './feature-info-dialog.component.html',
  styleUrl: './feature-info-dialog.component.scss'
})
export class FeatureInfoDialogComponent {
  data = inject(MAT_DIALOG_DATA);

  features: FeatureRef[];

  excludedProperties = new Set<string>(['geometry', '__layer']);

  constructor() {
    this.features = this.data.features;
  }

  /**
   * Gets the display label for a feature, optionally applying layer prefix and postfix.
   *
   * @param f - Object containing feature and layer references
   * @returns The formatted label string
   */
  getLabel(f: FeatureRef): string {
    const { feature, layer } = f;
    const labelProp: string | undefined = layer.get('labelProp');
    const layerPrefix: string | undefined = layer.get('layerPrefix');
    const layerPostfix: string | undefined = layer.get('layerPostfix');

    let label: string;

    // Get base label from feature property or fallback to ID
    if (labelProp) {
      label = feature.get(labelProp);
    } else {
      label = `id=${feature.getId()}`;
    }

    // Apply prefix and postfix if available
    if (layerPrefix) {
      label = layerPrefix + label;
    }

    if (layerPostfix) {
      label = label + layerPostfix;
    }

    return label;
  }

  getPropertyRows(f: FeatureRef) {
    return Object.entries(f.feature.getProperties()).filter(
      row => !this.excludedProperties.has(row[0])
    );
  }
}
