// src/app/model-workflow/services/workspace-persistence.service.ts
import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ModelParameters } from '../parameter-config/parameter-config.component';
import { CreateProjectInput, UpdateProjectInput } from '@reefguide/types';
import { Project, ProjectType } from '@reefguide/db';
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
  private currentProjectId: number | null = null;

  setCurrentProjectId(projectId: number): void {
    this.currentProjectId = projectId;
  }

  getCurrentProjectId(): number | null {
    return this.currentProjectId;
  }

  // Save complete workspace state to the project's project_state field
  saveWorkspaceState(state: WorkspaceState): Observable<void> {
    if (!this.currentProjectId) {
      console.warn('No project ID set, cannot save workspace state');
      return of(void 0);
    }

    const updateData: UpdateProjectInput = {
      project_state: state
    };

    return this.api.updateProject(this.currentProjectId, updateData).pipe(
      map(() => void 0),
      catchError(error => {
        console.warn('Failed to save workspace state:', error);
        return of(void 0); // Don't throw error to avoid breaking the app
      })
    );
  }

  // Load complete workspace state from the project's project_state field
  loadWorkspaceState(): Observable<WorkspaceState | null> {
    if (!this.currentProjectId) {
      return of(null);
    }

    return this.api.getProject(this.currentProjectId).pipe(
      map(response => {
        const project = response.project;

        if (!project.project_state) {
          return null;
        }

        const state = project.project_state as any as WorkspaceState;

        // Validate the loaded state
        if (!this.isValidWorkspaceState(state)) {
          console.warn('Invalid workspace state found in project');
          return null;
        }

        return state;
      }),
      catchError(error => {
        console.warn('Failed to load workspace state:', error);
        return of(null);
      })
    );
  }

  // Clear all workspace state
  clearWorkspaceState(): Observable<void> {
    if (!this.currentProjectId) {
      return throwError(() => new Error('No project ID set'));
    }

    const updateData: UpdateProjectInput = {
      project_state: null
    };

    return this.api.updateProject(this.currentProjectId, updateData).pipe(
      map(() => void 0),
      catchError(error => {
        console.warn('Failed to clear workspace state:', error);
        return throwError(() => error);
      })
    );
  }

  // Create a new project for the workflow
  createProject(name: string, description?: string): Observable<Project> {
    const projectData: CreateProjectInput = {
      name,
      description,
      type: ProjectType.ADRIA_ANALYSIS,
      project_state: null
    };

    return this.api.createProject(projectData).pipe(
      map(response => {
        this.setCurrentProjectId(response.project.id);
        return response.project;
      }),
      catchError(error => {
        console.error('Failed to create project:', error);
        return throwError(() => error);
      })
    );
  }

  // Update project metadata (name, description)
  updateProject(name?: string, description?: string): Observable<Project> {
    if (!this.currentProjectId) {
      return throwError(() => new Error('No project ID set'));
    }

    const updateData: UpdateProjectInput = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    return this.api.updateProject(this.currentProjectId, updateData).pipe(
      map(response => response.project),
      catchError(error => {
        console.error('Failed to update project:', error);
        return throwError(() => error);
      })
    );
  }

  // Load project by ID
  loadProject(projectId: number): Observable<Project> {
    this.setCurrentProjectId(projectId);

    return this.api.getProject(projectId).pipe(
      map(response => response.project),
      catchError(error => {
        console.error('Failed to load project:', error);
        return throwError(() => error);
      })
    );
  }

  // Check if we have a current project
  isProjectAvailable(): boolean {
    return this.currentProjectId !== null;
  }

  // Check if storage is available (always true for DB persistence)
  isStorageAvailable(): boolean {
    return this.isProjectAvailable();
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
}
