import { inject, numberAttribute } from '@angular/core';
import { Observable, of, tap, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { WebApiService } from '../../../api/web-api.service';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { UserMessageService } from '../../user-messages/user-message.service';

/**
 * Context around loading workspace state that may be used during validation and migration.
 */
export type LoadWorkspaceStateContext = {
  projectId?: number;
};

/**
 * Base service that manages a project's persisted state.
 */
export abstract class BaseWorkspacePersistenceService<T> {
  protected readonly api = inject(WebApiService);
  protected readonly userMessageService = inject(UserMessageService);
  private readonly route = inject(ActivatedRoute);

  /**
   * local storage key for workspace state.
   */
  protected abstract readonly STORAGE_KEY: string;

  public readonly projectId: number | null;

  constructor() {
    // route param available now since the routed project components provide this service.
    const initialProjectId = numberAttribute(this.route.snapshot.params['projectId']);

    if (!isNaN(initialProjectId)) {
      this.projectId = initialProjectId;

      // important sanity check to verify service is not being reused with different projects.
      // if route directly between projects, Angular will reuse the component, which may trigger this.
      // configure Angular to create always create new components with projectId changes in route
      // https://angular.dev/guide/routing/customizing-route-behavior#route-reuse-strategy
      this.route.params.pipe(takeUntilDestroyed()).subscribe(params => {
        const projectId = numberAttribute(params['projectId']);
        if (projectId !== this.projectId) {
          throw new Error(`projectId changed from ${this.projectId} to ${projectId}`);
        }
      });
    } else {
      // no project id
      this.projectId = null;
    }
  }

  /**
   * Save complete workspace state.
   * Takes care of logging and communicating errors to user.
   * Callers just need to subscribe
   */
  saveWorkspaceState(state: T): Observable<void> {
    if (!this.isValidWorkspaceState(state, false)) {
      console.error('invalid state', state);
      this.userMessageService.error('Failed to save invalid project state');
      throwError(() => new Error('App generated invalid workspace state'));
    }

    // If we have a project ID, save to backend; otherwise use localStorage
    if (this.projectId) {
      return this.saveToBackend(state).pipe(
        tap({
          next: () => {
            console.log('Workspace state saved successfully', state);
          },
          error: err => {
            console.warn('Failed to save workspace state:', err);
            this.userMessageService.error('Failed to save project');
          }
        })
      );
    } else {
      return this.saveToLocalStorage(state);
    }
  }

  /**
   * Load complete workspace state
   * TODO remove null
   *
   * @throws WorkspaceStateMigrationError if invalid and migration failed.
   */
  loadWorkspaceState(): Observable<T | null> {
    // If we have a project ID, load from backend; otherwise use localStorage
    let load$: Observable<T | null>;
    if (this.projectId) {
      load$ = this.loadFromBackend();
    } else {
      // warning because this is probably an initial state bug with the current design.
      console.warn('projectId not set, loadWorkspaceState() from local storage');
      load$ = this.loadFromLocalStorage();
    }

    return load$.pipe(
      tap({
        error: err => {
          if (err instanceof WorkspaceStateMigrationError) {
            // console errors are captured by Sentry
            // TODO add abstract service to send messages to sentry
            console.error(`${err.message} { projectId: ${err.context.projectId} }`);

            // there is no recovering from this; resetting to default state would lose what's stored
            // and is no better than starting a new project.
            this.userMessageService.showProjectLoadFailed(
              `This project cannot be loaded,
            contact the developers to fix this issue.
            In the meantime, you will need to create a new project.`
            );
          }
        }
      })
    );
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

  // ==================
  // BACKEND PERSISTENCE METHODS
  // ==================

  /**
   * Save the state to API.
   * @param state validated workspace state
   */
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
        tap({
          error: error => {
            console.warn('Failed to save workspace state to backend:', error);
            // Fallback to localStorage
            // FIXME there is no recovery mechanism since local storage is only loaded when no projectId
            //  Also, all projects share the same local storage key
            //  Should always save to local storage!?
            //  GitHub issue: https://github.com/open-AIMS/reefguide/issues/232
            return this.saveToLocalStorage(state);
          }
        })
      );
  }

  /**
   * Constructs a new Observable that requests the workspace state from the API.
   */
  private loadFromBackend(): Observable<T> {
    const projectId = this.projectId;
    if (!projectId) {
      return throwError(() => new Error('Project ID not set'));
    }

    return this.api.getProject(projectId).pipe(
      map(response => {
        const projectState = response.project.project_state as unknown;
        return this.validateAndMigrateWorkspaceState(projectState, { projectId });
      })
      // FIXME Relates to https://github.com/open-AIMS/reefguide/issues/232
      //  disabled because I disagree with silently loading from local storage when there's an error;
      //  this fallback, should be explicit.
      //
      // catchError(error => {
      //   console.warn('Failed to load workspace state from backend:', error);
      //   // Fallback to localStorage
      //   return this.loadFromLocalStorage();
      // })
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

      const state = this.validateAndMigrateWorkspaceState(JSON.parse(serializedState), {});
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

  /**
   * Procedure:
   * 1. If empty, generate default state
   * 2. If valid, return current state (with repair)
   * 3. Attempt to migrate and return the migrated state.

   * @param state workspace state, which may be an old version
   * @param context loading context
   */
  protected validateAndMigrateWorkspaceState(
    state: unknown,
    context: LoadWorkspaceStateContext
  ): T {
    if (this.isEmptyWorkspaceState(state)) {
      return this.generateDefaultWorkspaceState();
    } else if (this.isValidWorkspaceState(state, true)) {
      return state;
    } else {
      return this.migrateWorkspaceState(state, context);
    }
  }

  /**
   * Check if the workspace state is undefined or empty.
   * @param state
   */
  protected isEmptyWorkspaceState(state: unknown): boolean {
    return state == null || Object.keys(state).length === 0;
  }

  /**
   * Generate default workspace state to use.
   * This is called when project has empty initial state.
   * (project state request successful, but in empty default state)
   */
  public abstract generateDefaultWorkspaceState(): T;

  /**
   * Attempt to migrate old/invalid workspace state.
   * @param state old state
   * @param context
   * @returns migrated workspace state
   * @throws WorkspaceStateMigrationError if migration fails
   */
  protected abstract migrateWorkspaceState(state: unknown, context: LoadWorkspaceStateContext): T;

  /**
   * Validate workspace state structure is valid and the latest version.
   * @param state workspace state object
   * @param repair make minor repairs (mutations) to make state valid
   */
  protected abstract isValidWorkspaceState(state: any, repair: boolean): state is T;
}

/**
 * State could not be migrated.
 * Occurs when state is invalid, cannot be repaired, and migration fails.
 */
export class WorkspaceStateMigrationError extends Error {
  constructor(
    message: string,
    public readonly context: LoadWorkspaceStateContext
  ) {
    super(message);
  }
}
