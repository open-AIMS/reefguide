import { Injectable } from '@angular/core';
import { map, Observable, of, switchMap } from 'rxjs';
import { BaseWorkspacePersistenceService } from '../../projects/services/base-workspace-persistence.service';
import { isValidPersistedWorkspace, PersistedWorkspace } from './workspace-persistence.types';

/**
 * All projects have this base workspaces structure.
 * hmmm
 * Workspaces correspond to tabs in ADRIA Analysis projects.
 * Currently, Site Assessment has a single workspace.
 */
export interface WorkspaceState {
  workspaces: PersistedWorkspace[];
  activeWorkspaceId: string | null;
  workspaceCounter: number;
}

/**
 * Workspace persistence service for ADRIA Analysis projects.
 */
@Injectable({
  providedIn: 'root'
})
export class WorkspacePersistenceService extends BaseWorkspacePersistenceService<WorkspaceState> {
  protected readonly STORAGE_KEY = 'reef-guide-workspaces';
  protected readonly VERSION = '1.0';
  protected readonly VERSION_KEY = 'reef-guide-workspaces-version';

  constructor() {
    super();
  }

  /**
   * Save a single workspace.
   * Updates existing entry with same id or pushes new workspace.
   */
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
          currentState.activeWorkspaceId =
            currentState.workspaces.length > 0 ? currentState.workspaces[0].id : null;
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

  // ==================
  // VALIDATION METHODS
  // ==================

  public isValidWorkspaceState(state: any): state is WorkspaceState {
    // TODO delete invalid workspaces rather than invalidate whole state
    return (
      state &&
      typeof state === 'object' &&
      Array.isArray(state.workspaces) &&
      typeof state.workspaceCounter === 'number' &&
      (state.activeWorkspaceId === null || typeof state.activeWorkspaceId === 'string') &&
      state.workspaces.every((w: any) => isValidPersistedWorkspace(w))
    );
  }

  protected validateAndMigrateWorkspaceState(state: unknown): WorkspaceState | undefined {
    // FUTURE check version and migrate

    if (this.isValidWorkspaceState(state)) {
      return state;
    }

    return undefined;
  }
}
