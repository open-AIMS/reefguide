// src/app/model-workflow/services/workspace-persistence.service.ts
import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { ModelParameters } from '../parameter-config/parameter-config.component';
import { WebApiService } from '../../../api/web-api.service';

export interface PersistedWorkspace {
  id: string;
  name: string;
  parameters: ModelParameters | null;
  createdAt: string; // ISO string
  lastModified: string; // ISO string
}

export interface WorkspaceState {
  workspaces: PersistedWorkspace[];
  activeWorkspaceId: string | null;
  workspaceCounter: number;
}

@Injectable({
  providedIn: 'root'
})
export class WorkspacePersistenceService {
  private readonly api = inject(WebApiService);

  private readonly STORAGE_KEY = 'reef-guide-workspaces';
  private readonly VERSION = '1.0';
  private readonly VERSION_KEY = 'reef-guide-workspaces-version';

  private projectId: number | null = null;

  constructor() {
    this.migrateIfNeeded();
  }

  // Set the project ID for persistence operations
  setProjectId(projectId: number): void {
    this.projectId = projectId;
  }

  // Get current project ID
  getProjectId(): number | null {
    return this.projectId;
  }

  // Save complete workspace state
  saveWorkspaceState(state: WorkspaceState): Observable<void> {
    // If we have a project ID, save to backend; otherwise use localStorage
    if (this.projectId) {
      return this.saveToBackend(state);
    } else {
      return this.saveToLocalStorage(state);
    }
  }

  // Load complete workspace state
  loadWorkspaceState(): Observable<WorkspaceState | null> {
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

  // Save a single workspace
  saveWorkspace(workspace: PersistedWorkspace): Observable<void> {
    return this.loadWorkspaceState().pipe(
      map(currentState => {
        if (!currentState) return;

        const existingIndex = currentState.workspaces.findIndex(w => w.id === workspace.id);
        if (existingIndex >= 0) {
          currentState.workspaces[existingIndex] = workspace;
        } else {
          currentState.workspaces.push(workspace);
        }

        return currentState;
      }),
      switchMap(updatedState => {
        if (updatedState) {
          return this.saveWorkspaceState(updatedState);
        }
        return of(void 0);
      })
    );
  }

  // Remove a workspace
  removeWorkspace(workspaceId: string): Observable<void> {
    return this.loadWorkspaceState().pipe(
      map(currentState => {
        if (!currentState) return null;

        currentState.workspaces = currentState.workspaces.filter(w => w.id !== workspaceId);

        // Update active workspace if it was removed
        if (currentState.activeWorkspaceId === workspaceId) {
          currentState.activeWorkspaceId = currentState.workspaces.length > 0
            ? currentState.workspaces[0].id
            : null;
        }

        return currentState;
      }),
      switchMap(updatedState => {
        if (updatedState) {
          return this.saveWorkspaceState(updatedState);
        }
        return of(void 0);
      })
    );
  }

  // Update active workspace
  setActiveWorkspace(workspaceId: string): Observable<void> {
    return this.loadWorkspaceState().pipe(
      map(currentState => {
        if (!currentState) return null;

        currentState.activeWorkspaceId = workspaceId;
        return currentState;
      }),
      switchMap(updatedState => {
        if (updatedState) {
          return this.saveWorkspaceState(updatedState);
        }
        return of(void 0);
      })
    );
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

  // ==================
  // BACKEND PERSISTENCE METHODS
  // ==================

  private saveToBackend(state: WorkspaceState): Observable<void> {
    if (!this.projectId) {
      return throwError(() => new Error('Project ID not set'));
    }

    const projectState = {
      workspaces: state
    };

    return this.api.updateProject(this.projectId, {
      project_state: projectState
    }).pipe(
      map(() => void 0),
      catchError(error => {
        console.warn('Failed to save workspace state to backend:', error);
        // Fallback to localStorage
        return this.saveToLocalStorage(state);
      })
    );
  }

  private loadFromBackend(): Observable<WorkspaceState | null> {
    if (!this.projectId) {
      return throwError(() => new Error('Project ID not set'));
    }

    return this.api.getProject(this.projectId).pipe(
      map(response => {
        const projectState = response.project.project_state as any;

        if (projectState && projectState.workspaces) {
          const state = projectState.workspaces as WorkspaceState;

          // Validate the loaded state
          if (!this.isValidWorkspaceState(state)) {
            console.warn('Invalid workspace state found in project, returning null');
            return null;
          }

          return state;
        }

        return null;
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

    return this.api.updateProject(this.projectId, {
      project_state: {}
    }).pipe(
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

  private saveToLocalStorage(state: WorkspaceState): Observable<void> {
    try {
      const serializedState = JSON.stringify(state);
      localStorage.setItem(this.STORAGE_KEY, serializedState);
      localStorage.setItem(this.VERSION_KEY, this.VERSION);
      return of(void 0);
    } catch (error) {
      console.warn('Failed to save workspace state to localStorage:', error);
      return throwError(() => error);
    }
  }

  private loadFromLocalStorage(): Observable<WorkspaceState | null> {
    try {
      const serializedState = localStorage.getItem(this.STORAGE_KEY);
      if (!serializedState) {
        return of(null);
      }

      const state: WorkspaceState = JSON.parse(serializedState);

      // Validate the loaded state
      if (!this.isValidWorkspaceState(state)) {
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
      localStorage.removeItem(this.VERSION_KEY);
    } catch (error) {
      console.warn('Failed to clear workspace state from localStorage:', error);
    }
  }

  // ==================
  // VALIDATION METHODS
  // ==================

  // Validate workspace state structure
  private isValidWorkspaceState(state: any): state is WorkspaceState {
    return (
      state &&
      typeof state === 'object' &&
      Array.isArray(state.workspaces) &&
      typeof state.workspaceCounter === 'number' &&
      (state.activeWorkspaceId === null || typeof state.activeWorkspaceId === 'string') &&
      state.workspaces.every((w: any) => this.isValidPersistedWorkspace(w))
    );
  }

  // Validate individual workspace structure
  private isValidPersistedWorkspace(workspace: any): workspace is PersistedWorkspace {
    return (
      workspace &&
      typeof workspace === 'object' &&
      typeof workspace.id === 'string' &&
      typeof workspace.name === 'string' &&
      (workspace.parameters === null || typeof workspace.parameters === 'object') &&
      typeof workspace.createdAt === 'string' &&
      typeof workspace.lastModified === 'string'
    );
  }

  // Handle version migrations for localStorage
  private migrateIfNeeded(): void {
    const currentVersion = localStorage.getItem(this.VERSION_KEY);

    if (!currentVersion) {
      // First time or old version without versioning
      const existingData = localStorage.getItem(this.STORAGE_KEY);
      if (existingData) {
        console.log('Migrating workspace data to new version');
        // Could add migration logic here if needed
      }
      localStorage.setItem(this.VERSION_KEY, this.VERSION);
    }

    // Future migrations can be added here
    // if (currentVersion === '1.0' && this.VERSION === '1.1') { ... }
  }
}
