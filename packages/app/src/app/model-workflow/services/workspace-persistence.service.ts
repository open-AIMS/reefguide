// src/app/model-workflow/services/workspace-persistence.service.ts
import { Injectable } from '@angular/core';
import { ModelParameters } from '../parameter-config/parameter-config.component';

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
  private readonly STORAGE_KEY = 'reef-guide-workspaces';
  private readonly VERSION = '1.0';
  private readonly VERSION_KEY = 'reef-guide-workspaces-version';

  constructor() {
    this.migrateIfNeeded();
  }

  // Save complete workspace state
  saveWorkspaceState(state: WorkspaceState): void {
    try {
      const serializedState = JSON.stringify(state);
      localStorage.setItem(this.STORAGE_KEY, serializedState);
      localStorage.setItem(this.VERSION_KEY, this.VERSION);
    } catch (error) {
      console.warn('Failed to save workspace state:', error);
    }
  }

  // Load complete workspace state
  loadWorkspaceState(): WorkspaceState | null {
    try {
      const serializedState = localStorage.getItem(this.STORAGE_KEY);
      if (!serializedState) {
        return null;
      }

      const state: WorkspaceState = JSON.parse(serializedState);

      // Validate the loaded state
      if (!this.isValidWorkspaceState(state)) {
        console.warn('Invalid workspace state found, clearing storage');
        this.clearWorkspaceState();
        return null;
      }

      return state;
    } catch (error) {
      console.warn('Failed to load workspace state:', error);
      this.clearWorkspaceState();
      return null;
    }
  }

  // Clear all workspace state
  clearWorkspaceState(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.VERSION_KEY);
    } catch (error) {
      console.warn('Failed to clear workspace state:', error);
    }
  }

  // Save a single workspace
  saveWorkspace(workspace: PersistedWorkspace): void {
    const currentState = this.loadWorkspaceState();
    if (!currentState) return;

    const existingIndex = currentState.workspaces.findIndex(w => w.id === workspace.id);
    if (existingIndex >= 0) {
      currentState.workspaces[existingIndex] = workspace;
    } else {
      currentState.workspaces.push(workspace);
    }

    this.saveWorkspaceState(currentState);
  }

  // Remove a workspace
  removeWorkspace(workspaceId: string): void {
    const currentState = this.loadWorkspaceState();
    if (!currentState) return;

    currentState.workspaces = currentState.workspaces.filter(w => w.id !== workspaceId);

    // Update active workspace if it was removed
    if (currentState.activeWorkspaceId === workspaceId) {
      currentState.activeWorkspaceId = currentState.workspaces.length > 0
        ? currentState.workspaces[0].id
        : null;
    }

    this.saveWorkspaceState(currentState);
  }

  // Update active workspace
  setActiveWorkspace(workspaceId: string): void {
    const currentState = this.loadWorkspaceState();
    if (!currentState) return;

    currentState.activeWorkspaceId = workspaceId;
    this.saveWorkspaceState(currentState);
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

  // Handle version migrations
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
