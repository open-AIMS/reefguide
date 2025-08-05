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

  getLabel(f: FeatureRef) {
    const { feature, layer } = f;
    const labelProp: string | undefined = layer.get('labelProp');
    if (labelProp) {
      return feature.get(labelProp);
    } else {
      return `id=${feature.getId()}`;
    }
  }

  getPropertyRows(f: FeatureRef) {
    return Object.entries(f.feature.getProperties()).filter(
      row => !this.excludedProperties.has(row[0])
    );
  }
}
