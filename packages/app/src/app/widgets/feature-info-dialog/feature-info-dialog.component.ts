import { Component, inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { USER_POLYGON_LAYER_ID } from '../../location-selection/polygon-map.service';
import { FeatureRef } from '../../map/openlayers-types';
import { PolygonEditorComponent } from './polygon-editor/polygon-editor.component';

export interface FeatureInfoDialogResult {
  polygonDeleted: boolean;
  polygonId: number;
}

@Component({
  selector: 'app-feature-info-dialog',
  imports: [MatDialogModule, MatTabsModule, PolygonEditorComponent],
  templateUrl: './feature-info-dialog.component.html',
  styleUrl: './feature-info-dialog.component.scss'
})
export class FeatureInfoDialogComponent implements OnInit {
  data = inject(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<FeatureInfoDialogComponent>);

  features: FeatureRef[];

  excludedProperties = new Set<string>(['geometry', '__layer', 'polygonId', 'userId', 'createdAt']);

  /**
   * Index of the initially selected tab (prioritizes polygon tabs)
   */
  selectedTabIndex = signal(0);

  constructor() {
    this.features = this.data.features;
  }

  ngOnInit(): void {
    // Find the first polygon feature and select its tab
    const polygonFeatureIndex = this.features.findIndex(f => this.isPolygonFeature(f));
    if (polygonFeatureIndex !== -1) {
      this.selectedTabIndex.set(polygonFeatureIndex);
    }
  }

  /**
   * Handle polygon deletion event from polygon editor
   * Close the dialog and return the deleted polygon ID
   * @param polygonId - ID of the deleted polygon
   */
  polygonDeletedEvent(polygonId: number): void {
    // Close the dialog and pass the deleted polygon ID back to the parent
    this.dialogRef.close({ polygonDeleted: true, polygonId } satisfies FeatureInfoDialogResult);
  }

  /**
   * Check if a feature is from the user polygon layer
   * @param f - Feature reference
   * @returns True if this is a polygon feature
   */
  isPolygonFeature(f: FeatureRef): boolean {
    return f.layer?.get('id') === USER_POLYGON_LAYER_ID;
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

    // Special handling for polygon features
    if (this.isPolygonFeature(f)) {
      const polygonId = feature.get('polygonId');
      label = polygonId ? `Polygon #${polygonId}` : 'User Polygon';
    } else {
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
    }

    return label;
  }

  /**
   * Get property rows for a feature (excludes internal properties)
   * @param f - Feature reference
   * @returns Array of [key, value] tuples
   */
  getPropertyRows(f: FeatureRef) {
    return Object.entries(f.feature.getProperties()).filter(
      row => !this.excludedProperties.has(row[0])
    );
  }
}
