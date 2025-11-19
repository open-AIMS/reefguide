import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { WebApiService } from '../../../api/web-api.service';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Base service that manages a project's persisted state.
 */
@Injectable({
  providedIn: 'root'
})
export abstract class BaseWorkspacePersistenceService<T> {
  protected readonly api = inject(WebApiService);
  protected readonly snackbar = inject(MatSnackBar);

  /**
   * local storage key for workspace state.
   */
  protected abstract readonly STORAGE_KEY: string;

  private projectId: number | null = null;

  /**
   * Set the project ID for persistence operations
   * if projectId set, workspace state will be saved to API instead of local storage.
   */
  setProjectId(projectId: number): void {
    this.projectId = projectId;
  }

  // Get current project ID
  getProjectId(): number | null {
    return this.projectId;
  }

  // Save complete workspace state
  saveWorkspaceState(state: T): Observable<void> {
    if (!this.isValidWorkspaceState(state, false)) {
      console.error('invalid state', state);
      this.showUserErrorMessage('Failed to save project state');
      throw new Error('App generated invalid workspace state');
    }

    // If we have a project ID, save to backend; otherwise use localStorage
    if (this.projectId) {
      return this.saveToBackend(state);
    } else {
      return this.saveToLocalStorage(state);
    }
  }

  // Load complete workspace state
  loadWorkspaceState(): Observable<T | null> {
    // If we have a project ID, load from backend; otherwise use localStorage
    if (this.projectId) {
      return this.loadFromBackend();
    } else {
      return this.loadFromLocalStorage();
    }
  }

  // Clear all workspace state
  clearWorkspaceState(): Observable<void> {
    if (this.projectId) {
      return this.clearFromBackend();
    } else {
      return this.clearFromLocalStorage();
    }
  }

  // Check if storage is available
  isStorageAvailable(): boolean {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  // TODO standardize app user messaging system
  protected showUserErrorMessage(message: string): void {
    this.snackbar.open(`ERROR: ${message}`);
  }

  // ==================
  // BACKEND PERSISTENCE METHODS
  // ==================

  private saveToBackend(state: T): Observable<void> {
    if (!this.projectId) {
      return throwError(() => new Error('Project ID not set'));
    }

    return this.api
      .updateProject(this.projectId, {
        project_state: state
      })
      .pipe(
        map(() => void 0),
        catchError(error => {
          console.warn('Failed to save workspace state to backend:', error);
          // Fallback to localStorage
          return this.saveToLocalStorage(state);
        })
      );
  }

  private loadFromBackend(): Observable<T | null> {
    if (!this.projectId) {
      return throwError(() => new Error('Project ID not set'));
    }

    return this.api.getProject(this.projectId).pipe(
      map(response => {
        const projectState = response.project.project_state as unknown;
        const validMigrated = this.validateAndMigrateWorkspaceState(projectState);
        if (validMigrated) {
          return validMigrated;
        } else {
          console.warn('Invalid workspace state found in project, returning null');
          this.showUserErrorMessage('Workspace state invalid and reset');
          return null;
        }
      }),
      catchError(error => {
        console.warn('Failed to load workspace state from backend:', error);
        // Fallback to localStorage
        return this.loadFromLocalStorage();
      })
    );
  }

  private clearFromBackend(): Observable<void> {
    if (!this.projectId) {
      return throwError(() => new Error('Project ID not set'));
    }

    return this.api
      .updateProject(this.projectId, {
        project_state: {}
      })
      .pipe(
        map(() => void 0),
        catchError(error => {
          console.warn('Failed to clear workspace state from backend:', error);
          // Fallback to localStorage
          return this.clearFromLocalStorage();
        })
      );
  }

  // ==================
  // LOCAL STORAGE METHODS (FALLBACK)
  // ==================

  private saveToLocalStorage(state: T): Observable<void> {
    try {
      const serializedState = JSON.stringify(state);
      localStorage.setItem(this.STORAGE_KEY, serializedState);
      return of(void 0);
    } catch (error) {
      console.warn('Failed to save workspace state to localStorage:', error);
      return throwError(() => error);
    }
  }

  private loadFromLocalStorage(): Observable<T | null> {
    try {
      const serializedState = localStorage.getItem(this.STORAGE_KEY);

      if (!serializedState) {
        return of(null);
      }

      const state = this.validateAndMigrateWorkspaceState(JSON.parse(serializedState));
      if (!state) {
        return of(null);
      }

      // Validate the loaded state, allow repairs
      if (!this.isValidWorkspaceState(state, true)) {
        console.warn('Invalid workspace state found in localStorage, clearing storage');
        this.clearFromLocalStorageSync();
        return of(null);
      }

      return of(state);
    } catch (error) {
      console.warn('Failed to load workspace state from localStorage:', error);
      this.clearFromLocalStorageSync();
      return of(null);
    }
  }

  private clearFromLocalStorage(): Observable<void> {
    try {
      this.clearFromLocalStorageSync();
      return of(void 0);
    } catch (error) {
      console.warn('Failed to clear workspace state from localStorage:', error);
      return throwError(() => error);
    }
  }

  private clearFromLocalStorageSync(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear workspace state from localStorage:', error);
    }
  }

  // ==================
  // VALIDATION METHODS
  // ==================

  /**
   * Migrate the workspace state if needed and ensure the state is valid.
   * @param state workspace state, which may be an old version
   * @returns T if migrated and valid, undefined if not.
   */
  protected abstract validateAndMigrateWorkspaceState(state: unknown): T | undefined;

  /**
   * Validate workspace state structure is valid and the latest version.
   * @param state workspace state object
   * @param repair make minor repairs (mutations) to make state valid
   */
  protected abstract isValidWorkspaceState(state: any, repair: boolean): state is T;
}
