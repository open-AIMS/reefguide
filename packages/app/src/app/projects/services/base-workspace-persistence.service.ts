import { DestroyRef, inject, numberAttribute, signal } from '@angular/core';
import {
  debounceTime,
  Observable,
  of,
  shareReplay,
  Subject,
  take,
  takeUntil,
  tap,
  throwError
} from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
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
 *
 * Instances should NOT be reused between projects.
 *
 * Saving state before initialState$ loads is considered an error. UI should not allow
 * the user to modify the project state before initial state is loaded. Providing component
 * is expected to subscribe to initialState$
 */
export abstract class BaseWorkspacePersistenceService<T> {
  protected readonly api = inject(WebApiService);
  protected readonly userMessageService = inject(UserMessageService);
  private readonly route = inject(ActivatedRoute);
  protected readonly destroyRef = inject(DestroyRef);

  /**
   * local storage key for workspace state.
   */
  protected abstract readonly STORAGE_KEY: string;

  public readonly projectId: number | null;

  /**
   * Debounce the save to backend. During this time, lastSavedState is updated
   */
  public readonly backendSaveDebounceTime: number = 500;

  /**
   * Replay of the initial workspace state.
   * This is requested early in the life of this service and providing component.
   *
   * Note: currently not coordinated with loadWorkspaceState, subscribers only interested in the
   * initial state should prefer using this observable.
   */
  readonly initialState$: Observable<T>;

  /**
   * true until initialState$ completes or errors.
   */
  readonly isInitialStateLoading = signal(true);

  /**
   * The last saved state.
   * Initially from initialState$ and later set by {@link saveWorkspaceState}
   * @see setLastState
   */
  protected lastSavedState?: T;

  private scheduleBackendSave = new Subject<T>();
  private doBackendSave$ = this.scheduleBackendSave.pipe(
    debounceTime(this.backendSaveDebounceTime)
  );

  /**
   * Emits when a save starts in order to cancel any previous active request.
   */
  private cancelRequest$ = new Subject<void>();

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

    this.initialState$ = this.loadWorkspaceState().pipe(
      takeUntilDestroyed(),
      tap({
        next: state => {
          console.info('initial workspace state', state);
          this.setLastState(state);
        },
        finalize: () => {
          this.isInitialStateLoading.set(false);
        }
      }),
      shareReplay(1)
    );

    // switchMap used to cancel any previous request in progress
    this.doBackendSave$
      .pipe(
        takeUntilDestroyed(),
        switchMap(state => {
          console.log('Saving workspace state to backend API', state);
          return this.saveToBackend(state);
        })
      )
      .subscribe({
        next: () => {
          console.log('Workspace state saved successfully');
        },
        error: err => {
          console.warn('Failed to save workspace state:', err);
          this.userMessageService.error('Failed to save project');
        }
      });

    // Angular complains about ngOnDestroy in base class, so doing it this way
    this.destroyRef.onDestroy(() => this.destroy());
  }

  destroy(): void {
    this.scheduleBackendSave.complete();
    this.cancelRequest$.complete();
  }

  /**
   * Freeze the state object and set it to lastSavedState
   * Note: this is a shallow freeze
   * @param state
   */
  private setLastState(state: T) {
    state = Object.freeze(state);
    this.lastSavedState = state;
  }

  /**
   * Save complete workspace state.
   * Takes care of logging and communicating errors to user.
   * Callers just need to subscribe.
   * Successive calls will cancel previous save requests.
   *
   * @param state the full state to save
   * @returns Observable that indicates when save is done.
   */
  saveWorkspaceState(state: T): Observable<void> {
    if (this.lastSavedState === undefined) {
      throwError(() => new Error('cannot saveWorkspaceState before initial state loaded'));
    }

    if (!this.isValidWorkspaceState(state, false)) {
      console.error('invalid state', state);
      this.userMessageService.error('Failed to save invalid project state');
      throwError(() => new Error('App generated invalid workspace state'));
    }

    this.setLastState(state);

    // If we have a project ID, save to backend; otherwise use localStorage
    if (this.projectId) {
      this.scheduleBackendSave.next(state);

      // what to return? tricky, there's probably some way to make all callers get the same
      // observable and share it, but not worth the effort since don't actually need the API response.
      return this.doBackendSave$.pipe(
        take(1),
        // make type check happy
        map(() => void null)
      );
    } else {
      return this.saveToLocalStorage(state);
    }
  }

  /**
   * Patch the last state with this partial state and save it.
   * Currently shallow, so must fully define a property until implementation changed to deep merge.
   * @param partialState
   * @returns Observable that must be subscribed to start API request
   */
  patchWorkspaceState(partialState: Partial<T>): Observable<void> {
    const lastState = this.lastSavedState;
    if (lastState === undefined) {
      return throwError(() => new Error('cannot patch, initial state never loaded'));
    }

    console.log('patchWorkspaceState', partialState);

    const newState: T = {
      ...lastState,
      ...partialState
    };

    return this.saveWorkspaceState(newState);
  }

  /**
   * Load complete workspace state
   *
   * @throws WorkspaceStateMigrationError if invalid and migration failed.
   */
  loadWorkspaceState(): Observable<T> {
    // If we have a project ID, load from backend; otherwise use localStorage
    let load$: Observable<T>;
    if (this.projectId) {
      load$ = this.loadFromBackend();
    } else {
      // warning because this is probably an initial state bug with the current design.
      console.warn('projectId not set, loadWorkspaceState() from local storage');
      load$ = this.loadFromLocalStorage().pipe(
        map(state => state ?? this.generateDefaultWorkspaceState())
      );
    }

    // TODO should consolidate the validation and default fallback logic here instead of load* methods,
    //  but local storage code is messy and not being used now.

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

    // cancel previous save requests
    this.cancelRequest$.next();

    return this.api
      .updateProject(this.projectId, {
        project_state: state
      })
      .pipe(
        // unsubscribe on next cancel
        takeUntil(this.cancelRequest$),
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
