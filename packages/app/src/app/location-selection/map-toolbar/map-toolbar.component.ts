import { Component, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { ReefGuideMapService } from '../reef-guide-map.service';

/**
 * Map toolbar with drawing and interaction tools.
 * Currently supports polygon drawing with plan to expand to other tools.
 */
@Component({
  selector: 'app-map-toolbar',
  imports: [MatButtonModule, MatIconModule, MatTooltip],
  templateUrl: './map-toolbar.component.html',
  styleUrl: './map-toolbar.component.scss'
})
export class MapToolbarComponent {
  readonly mapService = inject(ReefGuideMapService);

  /**
   * Emits the GeoJSON string when a polygon is successfully drawn
   */
  polygonDrawn = output<string>();

  /**
   * Emits when polygon drawing is cancelled
   */
  drawingCancelled = output<void>();

  /**
   * Whether the user is currently drawing a polygon
   */
  isDrawing = signal(false);

  /**
   * Start drawing a new polygon on the map
   */
  startDrawing(): void {
    if (this.isDrawing()) {
      return;
    }

    this.isDrawing.set(true);

    this.mapService.startDrawPolygon({
      onSuccess: (geojson: string) => {
        this.isDrawing.set(false);
        this.polygonDrawn.emit(geojson);
      },
      onCancelled: () => {
        this.isDrawing.set(false);
        this.drawingCancelled.emit();
      }
    });
  }

  /**
   * Cancel the current drawing operation
   */
  cancelDrawing(): void {
    if (!this.isDrawing()) {
      return;
    }

    this.mapService.cancelDrawPolygon();
    this.isDrawing.set(false);
  }

  /**
   * Undo the last point in the polygon being drawn
   */
  undoLastPoint(): void {
    if (!this.isDrawing()) {
      return;
    }

    this.mapService.undoLastDrawPoint();
  }
}
