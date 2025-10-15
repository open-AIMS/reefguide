import { Component, inject, Input, OnInit, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { GeoJSON } from 'ol/format';
import { getArea } from 'ol/sphere';
import { Geometry } from 'ol/geom';
import { NoteWithUser, PolygonWithRelations } from '@reefguide/types';
import { WebApiService } from '../../../../api/web-api.service';
import { FeatureRef } from '../../../map/openlayers-types';

/**
 * Component for displaying and editing polygon details and notes.
 * Shows polygon metadata, geometry information, and a comment section for polygon notes.
 */
@Component({
  selector: 'app-polygon-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule
  ],
  templateUrl: './polygon-editor.component.html',
  styleUrl: './polygon-editor.component.scss'
})
export class PolygonEditorComponent implements OnInit {
  private readonly api = inject(WebApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly geojsonFormat = new GeoJSON();

  /**
   * The feature reference containing the polygon feature and layer
   */
  @Input({ required: true }) featureRef!: FeatureRef;

  /**
   * Event emitted when the polygon is deleted
   * Parent component should listen to this and refresh the polygon list
   */
  @Output() polygonDeleted = new EventEmitter<number>();

  /**
   * Full polygon details including user and notes
   */
  polygonDetails = signal<PolygonWithRelations | undefined>(undefined);

  /**
   * Loading state for polygon details
   */
  loading = signal(false);

  /**
   * Loading state for submitting a new note
   */
  submittingNote = signal(false);

  /**
   * Loading state for deleting polygon
   */
  deletingPolygon = signal(false);

  /**
   * Track which notes are being deleted
   */
  deletingNotes = signal<Set<number>>(new Set());

  /**
   * New note content being typed
   */
  newNoteContent = '';

  /**
   * Polygon ID extracted from feature properties
   */
  polygonId?: number;

  /**
   * Calculated area in square meters
   */
  areaM2 = signal<number | undefined>(undefined);

  /**
   * Bounding box coordinates [minX, minY, maxX, maxY]
   */
  boundingBox = signal<number[] | undefined>(undefined);

  ngOnInit(): void {
    // Extract polygon ID from feature properties
    this.polygonId = this.featureRef.feature.get('polygonId');

    if (!this.polygonId) {
      console.error('Polygon feature does not have polygonId property');
      this.snackbar.open('Error: Polygon ID not found', 'OK', { duration: 3000 });
      return;
    }

    // Calculate geometry properties
    this.calculateGeometryProperties();

    // Load full polygon details
    this.loadPolygonDetails();
  }

  /**
   * Calculate area and bounding box from the feature geometry
   */
  private calculateGeometryProperties(): void {
    try {
      const geometry = this.featureRef.feature.getGeometry() as Geometry;

      if (!geometry) {
        console.warn('Feature has no geometry');
        return;
      }

      // Calculate area in square meters using OpenLayers sphere utility
      const area = getArea(geometry, { projection: 'EPSG:3857' });
      this.areaM2.set(Math.abs(area));

      // Get bounding box (extent)
      const extent = geometry.getExtent();
      this.boundingBox.set(extent);
    } catch (error) {
      console.error('Error calculating geometry properties:', error);
    }
  }

  /**
   * Load full polygon details from the API including notes
   */
  private loadPolygonDetails(): void {
    if (!this.polygonId) {
      return;
    }

    this.loading.set(true);

    this.api.getPolygon(this.polygonId).subscribe({
      next: response => {
        this.polygonDetails.set(response.polygon);
        this.loading.set(false);
      },
      error: error => {
        console.error('Error loading polygon details:', error);
        this.snackbar.open('Failed to load polygon details', 'OK', { duration: 3000 });
        this.loading.set(false);
      }
    });
  }

  /**
   * Refresh notes for this polygon after a new note is added
   */
  private refreshPolygonDetails(): void {
    this.loadPolygonDetails();
  }

  /**
   * Submit a new note for this polygon
   */
  submitNote(): void {
    if (!this.polygonId) {
      this.snackbar.open('Error: Polygon ID not found', 'OK', { duration: 3000 });
      return;
    }

    const content = this.newNoteContent.trim();
    if (!content) {
      this.snackbar.open('Note content cannot be empty', 'OK', { duration: 3000 });
      return;
    }

    this.submittingNote.set(true);

    this.api
      .createNote({
        content,
        polygonId: this.polygonId
      })
      .subscribe({
        next: () => {
          // Clear the input
          this.newNoteContent = '';
          // Refresh polygon details to show the new note
          this.refreshPolygonDetails();
          this.submittingNote.set(false);
          this.snackbar.open('Note added successfully', 'OK', { duration: 2000 });
        },
        error: error => {
          console.error('Error creating note:', error);
          this.snackbar.open('Failed to add note', 'OK', { duration: 3000 });
          this.submittingNote.set(false);
        }
      });
  }

  /**
   * Delete the polygon
   * Shows confirmation dialog and emits event on success
   */
  deletePolygon(): void {
    if (!this.polygonId) {
      this.snackbar.open('Error: Polygon ID not found', 'OK', { duration: 3000 });
      return;
    }

    // Simple browser confirmation
    const confirmed = confirm(
      'Are you sure you want to delete this polygon? This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    this.deletingPolygon.set(true);

    this.api.deletePolygon(this.polygonId).subscribe({
      next: () => {
        this.snackbar.open('Polygon deleted successfully', 'OK', { duration: 2000 });
        // Emit the polygon ID to parent component
        this.polygonDeleted.emit(this.polygonId);
        this.deletingPolygon.set(false);
      },
      error: error => {
        console.error('Error deleting polygon:', error);
        this.snackbar.open('Failed to delete polygon', 'OK', { duration: 3000 });
        this.deletingPolygon.set(false);
      }
    });
  }

  /**
   * Delete a note
   * @param noteId - ID of the note to delete
   */
  deleteNote(noteId: number): void {
    // Simple browser confirmation
    const confirmed = confirm('Are you sure you want to delete this comment?');

    if (!confirmed) {
      return;
    }

    // Add to deleting set
    const currentDeleting = new Set(this.deletingNotes());
    currentDeleting.add(noteId);
    this.deletingNotes.set(currentDeleting);

    this.api.deleteNote(noteId).subscribe({
      next: () => {
        this.snackbar.open('Comment deleted successfully', 'OK', { duration: 2000 });
        // Remove from deleting set
        const updatedDeleting = new Set(this.deletingNotes());
        updatedDeleting.delete(noteId);
        this.deletingNotes.set(updatedDeleting);
        // Refresh to show updated list
        this.refreshPolygonDetails();
      },
      error: error => {
        console.error('Error deleting note:', error);
        this.snackbar.open('Failed to delete comment', 'OK', { duration: 3000 });
        // Remove from deleting set
        const updatedDeleting = new Set(this.deletingNotes());
        updatedDeleting.delete(noteId);
        this.deletingNotes.set(updatedDeleting);
      }
    });
  }

  /**
   * Check if a note is currently being deleted
   */
  isNoteDeleting(noteId: number): boolean {
    return this.deletingNotes().has(noteId);
  }

  /**
   * Format area for display (with thousands separators)
   */
  formatArea(area: number): string {
    return area.toLocaleString('en-US', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    });
  }

  /**
   * Format bounding box coordinates for display
   */
  formatBoundingBox(bbox: number[]): string {
    return bbox.map(coord => coord.toFixed(6)).join(', ');
  }

  /**
   * Format date for display
   */
  formatDate(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Get relative time string (e.g., "2 hours ago")
   */
  getRelativeTime(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    } else {
      return this.formatDate(dateObj);
    }
  }

  /**
   * Track by function for notes list
   */
  trackByNoteId(_index: number, note: NoteWithUser): number {
    return note.id;
  }

  isCtrlPressed(event: KeyboardEvent): boolean {
    return event.ctrlKey;
  }
}
