import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { UserRole } from '@reefguide/db';
import { Observable, distinctUntilChanged } from 'rxjs';
import { AuthService } from './auth.service';
import { REQUIRED_ROLES, SplashConfig, SplashState, UserAccessState } from './auth.types';

/**
 * Service that manages application-wide access control and splash screen state.
 *
 * This service combines authentication status with role-based authorization
 * to determine whether users can access the main application. It provides
 * a centralized way to manage the splash screen visibility and user access state.
 *
 * @example
 * ```typescript
 * constructor(private appAccess: AppAccessService) {
 *   // Subscribe to access state changes
 *   this.appAccess.userAccessState$.subscribe(state => {
 *     console.log('User access changed:', state);
 *   });
 *
 *   // Check if splash should be shown
 *   if (this.appAccess.shouldShowSplash()) {
 *     // Show splash screen
 *   }
 * }
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class AppAccessService {
  private readonly authService = inject(AuthService);

  /**
   * Configuration for the splash screen.
   * Can be updated to change splash screen behavior.
   */
  private readonly _splashConfig = signal<SplashConfig>({
    adminEmail: 'admin@example.com', // Will be overridden by environment config
    showBackgroundMap: true,
    unauthorizedMessage:
      'Your account needs analyst or administrator access to use this application.',
    appName: 'MADAME - Marine Environment Analysis'
  });

  /**
   * Current user access state computed from authentication and authorization.
   * This drives the splash screen behavior.
   */
  public readonly userAccessState = computed<UserAccessState>(() => {
    const isAuthenticated = this.authService.authenticated();

    if (!isAuthenticated) {
      return 'unauthenticated';
    }

    // Check if user has required roles
    const hasRequiredRole = this.hasRequiredRoles();
    return hasRequiredRole ? 'authorized' : 'unauthorized';
  });

  /**
   * Observable version of user access state for reactive programming.
   */
  public readonly userAccessState$: Observable<UserAccessState> = toObservable(
    this.userAccessState
  ).pipe(
    distinctUntilChanged() // Only emit when state actually changes
  );

  /**
   * Complete splash screen state including visibility and interaction blocking.
   */
  public readonly splashState = computed<SplashState>(() => {
    const userState = this.userAccessState();
    const isVisible = userState !== 'authorized';

    return {
      isVisible,
      userAccessState: userState,
      shouldBlurBackground: isVisible && this._splashConfig().showBackgroundMap,
      shouldBlockInteractions: isVisible
    };
  });

  /**
   * Observable version of splash state.
   */
  public readonly splashState$: Observable<SplashState> = toObservable(this.splashState).pipe(
    distinctUntilChanged(
      (prev, curr) =>
        prev.isVisible === curr.isVisible && prev.userAccessState === curr.userAccessState
    )
  );

  /**
   * Current splash screen configuration.
   */
  public readonly splashConfig = this._splashConfig.asReadonly();

  /**
   * Whether the splash screen should currently be shown.
   */
  public readonly shouldShowSplash = computed(() => this.splashState().isVisible);

  /**
   * Whether user interactions should be blocked (splash is visible).
   */
  public readonly shouldBlockInteractions = computed(
    () => this.splashState().shouldBlockInteractions
  );

  /**
   * Whether the background should be blurred.
   */
  public readonly shouldBlurBackground = computed(() => this.splashState().shouldBlurBackground);

  constructor() {
    // Log state changes for debugging
    this.userAccessState$.subscribe(state => {
      console.log(`[AppAccessService] User access state changed: ${state}`);
    });
  }

  /**
   * Updates the splash screen configuration.
   *
   * @param config - Partial configuration to merge with existing config
   *
   * @example
   * ```typescript
   * appAccessService.updateSplashConfig({
   *   adminEmail: 'support@mycompany.com',
   *   appName: 'My Custom App Name'
   * });
   * ```
   */
  public updateSplashConfig(config: Partial<SplashConfig>): void {
    this._splashConfig.update(current => ({
      ...current,
      ...config
    }));
  }

  /**
   * Checks if the current user has any of the required roles for app access.
   *
   * @returns true if user has ADMIN or ANALYST role, false otherwise
   */
  private hasRequiredRoles(): boolean {
    return this.authService.currentUserHasAnyRole(REQUIRED_ROLES);
  }

  /**
   * Gets the current user information from the auth service.
   * This is a helper method that uses the enhanced auth service methods.
   *
   * @returns Current user data or null if not authenticated
   */
  private getCurrentUser() {
    return this.authService.getCurrentUser() || null;
  }

  /**
   * Utility method to check if a user has a specific role.
   *
   * @param role - The role to check for
   * @returns true if current user has the specified role
   *
   * @example
   * ```typescript
   * if (appAccessService.hasRole('ADMIN')) {
   *   // Show admin features
   * }
   * ```
   */
  public hasRole(role: UserRole): boolean {
    return this.authService.currentUserHasRole(role);
  }

  /**
   * Utility method to check if current user is an admin.
   *
   * @returns true if current user has ADMIN role
   */
  public isAdmin(): boolean {
    return this.hasRole('ADMIN');
  }

  /**
   * Utility method to check if current user is an analyst.
   *
   * @returns true if current user has ANALYST role
   */
  public isAnalyst(): boolean {
    return this.hasRole('ANALYST');
  }

  /**
   * Gets a user-friendly message based on the current access state.
   * Useful for displaying status information to users.
   *
   * @returns Descriptive message about current access state
   */
  public getAccessStateMessage(): string {
    const state = this.userAccessState();

    switch (state) {
      case 'loading':
        return 'Checking your access permissions...';
      case 'unauthenticated':
        return 'Please log in to access the application.';
      case 'unauthorized':
        return (
          this._splashConfig().unauthorizedMessage ||
          'You need additional permissions to access this application.'
        );
      case 'authorized':
        return 'Welcome! You have full access to the application.';
      default:
        return 'Checking access...';
    }
  }
}
