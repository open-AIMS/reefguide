/**
 * Wraps the authentication service to derive whether the user should be able to
 * access the app.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { REQUIRED_ROLES, SplashConfig, SplashState, UserAccessState } from './auth.types';

@Injectable({
  providedIn: 'root'
})
export class AppAccessService {
  private readonly authService = inject(AuthService);

  /**
   * Configuration for the splash screen.
   */
  private readonly _splashConfig = signal<SplashConfig>(environment.splashConfig);

  /**
   * Current user access state computed from authentication and authorization.
   * This drives the splash screen behavior.
   */
  public readonly userAccessState = computed<UserAccessState>(() => {
    const isAuthenticated = this.authService.authenticated();
    const currentUser = this.authService.currentUserSignal();

    if (!isAuthenticated || !currentUser) {
      return 'unauthenticated';
    }

    // NOTE: this is the main check that determines access
    // Check if user has required roles using the signal-based user data
    const hasRequiredRole = REQUIRED_ROLES.some(role => currentUser.roles.includes(role));

    return hasRequiredRole ? 'authorized' : 'unauthorized';
  });

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
}
