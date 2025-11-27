import { Injectable } from '@angular/core';
import { map, Observable, of, switchMap } from 'rxjs';
import {
  BaseWorkspacePersistenceService,
  LoadWorkspaceStateContext,
  WorkspaceStateMigrationError
} from '../../projects/services/base-workspace-persistence.service';
import { isValidPersistedWorkspace, PersistedWorkspace } from './workspace-persistence.types';

/**
 * Workspace state for ADRIA Analysis projects.
 * workspaces property correspond to tabs in the UI.
 */
export interface WorkspaceState {
  version: '1.0';
  workspaces: PersistedWorkspace[];
  activeWorkspaceId: string | null;
  workspaceCounter: number;
}

/**
 * Workspace persistence service for ADRIA Analysis projects.
 *
 * Provided by project components.
 */
@Injectable()
export class WorkspacePersistenceService extends BaseWorkspacePersistenceService<WorkspaceState> {
  protected readonly STORAGE_KEY = 'reef-guide-workspaces';
  private readonly LATEST_VERSION: WorkspaceState['version'] = '1.0';

  /**
   * Save a single workspace.
   * Updates existing entry with same id or pushes new workspace.
   */
  saveWorkspace(workspace: PersistedWorkspace): Observable<void> {
    return this.loadWorkspaceState().pipe(
      map(currentState => {
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

  public generateDefaultWorkspaceState(): WorkspaceState {
    return {
      version: '1.0',
      activeWorkspaceId: null,
      workspaces: [],
      workspaceCounter: 0
    };
  }

  protected migrateWorkspaceState(
    state: unknown,
    context: LoadWorkspaceStateContext
  ): WorkspaceState {
    throw new WorkspaceStateMigrationError('migration not implemented', context);
  }

  public isValidWorkspaceState(state: any, repair: boolean): state is WorkspaceState {
    const isRootValid =
      state &&
      typeof state === 'object' &&
      typeof state.version === 'string' &&
      Array.isArray(state.workspaces) &&
      typeof state.workspaceCounter === 'number' &&
      (state.activeWorkspaceId === null || typeof state.activeWorkspaceId === 'string');

    if (!isRootValid) {
      return false;
    }

    if (repair) {
      state.workspaces = state.workspaces.filter(isValidPersistedWorkspace);
    } else {
      if (!state.workspaces.every(isValidPersistedWorkspace)) {
        console.warn('invalid workspace invalidated entire workspace state');
        this.userMessageService.error('Invalid workspaces were discarded');
        return false;
      }
    }

    return true;
  }
}
