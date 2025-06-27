/**
 * Authentication and authorization types
 */

import { UserRole } from '@reefguide/db';
import { JwtContents } from '@reefguide/types';

/**
 * Represents the current user's access state for the application.
 * Used by the splash screen to determine what UI to show.
 */
export type UserAccessState =
  | 'loading' // Initial state, checking authentication status
  | 'unauthenticated' // No valid login credentials
  | 'unauthorized' // Logged in but lacks required roles (ANALYST/ADMIN)
  | 'authorized'; // Has required roles and can access the app

/**
 * Configuration for the splash screen component.
 * These settings control the behavior and appearance of the splash screen.
 */
export interface SplashConfig {
  /** Email address for users to contact for access requests */
  adminEmail: string;
  /** Whether to show the background map while splash is active */
  showBackgroundMap: boolean;
  /** Custom message to show on the unauthorized screen */
  unauthorizedMessage?: string;
  /** App name to display in the splash screen */
  appName?: string;
}

/**
 * The minimum roles required to access the main application.
 * Users must have at least one of these roles to proceed past the splash screen.
 */
export const REQUIRED_ROLES: UserRole[] = ['ADMIN', 'ANALYST'];

/**
 * Props for the splash screen component.
 */
export interface SplashScreenProps {
  /** Current user access state */
  userState: UserAccessState;
  /** Configuration for the splash screen */
  config: SplashConfig;
  /** Callback when splash screen should be dismissed */
  onDismissed?: () => void;
  /** Callback when user successfully logs in */
  onLoginSuccess?: () => void;
}

/**
 * State for managing the splash screen visibility and behavior.
 */
export interface SplashState {
  /** Whether the splash screen is currently visible */
  isVisible: boolean;
  /** Current user access state */
  userAccessState: UserAccessState;
  /** Whether the background should be blurred */
  shouldBlurBackground: boolean;
  /** Whether user interactions should be blocked */
  shouldBlockInteractions: boolean;
}

/**
 * Helper type for components that need to check user authorization.
 */
export type AuthorizedUser = JwtContents;
