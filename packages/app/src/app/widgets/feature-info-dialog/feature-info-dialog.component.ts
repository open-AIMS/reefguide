import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { FeatureLike } from 'ol/Feature';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-feature-info-dialog',
  imports: [MatDialogModule, MatTabsModule],
  templateUrl: './feature-info-dialog.component.html',
  styleUrl: './feature-info-dialog.component.scss'
})
export class FeatureInfoDialogComponent {
  data = inject(MAT_DIALOG_DATA);

  features: FeatureLike[];

  excludedProperties = new Set<string>(['geometry', '__layer']);

  constructor() {
    this.features = this.data.features;
  }

  getLabel(f: FeatureLike) {
    const layer = f.get('__layer');
    const labelProp = layer.get('labelProp');
    if (labelProp) {
      return f.get(labelProp);
    } else {
      return `id=${f.getId()}`;
    }
  }

  getPropertyRows(f: FeatureLike) {
    return Object.entries(f.getProperties()).filter(row => !this.excludedProperties.has(row[0]));
  }
}
