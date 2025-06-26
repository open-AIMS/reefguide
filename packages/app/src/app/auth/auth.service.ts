import { inject, Injectable, Signal, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { UserRole } from '@reefguide/db';
import { JwtContents, ProfileResponse } from '@reefguide/types';
import { jwtDecode, JwtPayload } from 'jwt-decode';
import { map, Observable, of, retry, switchMap } from 'rxjs';
import { WebApiService } from '../../api/web-api.service';
import { AuthorizedUser } from './auth.types';

export type AuthenticatedUser = {
  user: JwtContents;
  token: string;
  refreshToken: string;
  expires: number; // epoch in seconds
};

/**
 * Enhanced Authentication Service for MADAME application.
 *
 * Manages JWT token lifecycle, user authentication state, and provides
 * role-based authorization helpers. This service has been enhanced to
 * support the new splash screen and role-based access control system.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  /**
   * Refresh token this many seconds before it expires.
   */
  refreshPrior = 30; // seconds

  private _authenticated = signal(false);
  /**
   * Whether user is authenticated. readonly
   */
  get authenticated(): Signal<boolean> {
    return this._authenticated;
  }

  private readonly api = inject(WebApiService);

  /**
   * Observable that emits current user data when authenticated, undefined when not.
   * Enhanced to provide strongly typed user information.
   */
  user$: Observable<JwtContents | undefined> = toObservable(this._authenticated).pipe(
    map(isAuthenticated => {
      return this.auth?.user;
    })
  );

  /**
   * Emits the profile when authenticated; undefined when unauthenticated.
   * @deprecated not needed unless profile gains more information than token.
   */
  profile$: Observable<ProfileResponse['user'] | undefined> = toObservable(
    this._authenticated
  ).pipe(
    switchMap(isAuthenticated => {
      if (isAuthenticated) {
        return this.api.getProfile().pipe(map(p => p.user));
      } else {
        return of(undefined);
      }
    })
  );

  private auth?: AuthenticatedUser;

  private lsToken = 'jwtToken';
  private lsRefreshToken = 'jwtRefreshToken';

  private refreshHandle?: any;

  constructor() {
    this.load();
  }

  /**
   * Authenticate user with email and password.
   *
   * @param email - User's email address
   * @param password - User's password
   * @returns Observable that completes on successful login
   */
  login(email: string, password: string): Observable<void> {
    return this.api.login({ email, password }).pipe(
      map(auth => {
        if (this.onAuth(auth.token, auth.refreshToken)) {
          this.store();
        }
        // map to void, caller shouldn't have access to token.
        return;
      })
    );
  }

  /**
   * Check if the current user has admin role.
   * Enhanced to work with new role system.
   *
   * @returns Observable that emits true if user is admin
   */
  isAdmin(): Observable<boolean> {
    return this.user$.pipe(map(user => this.userHasRole(user, 'ADMIN')));
  }

  /**
   * Check if the current user has analyst role.
   * New method for the enhanced role system.
   *
   * @returns Observable that emits true if user is analyst
   */
  isAnalyst(): Observable<boolean> {
    return this.user$.pipe(map(user => this.userHasRole(user, 'ANALYST')));
  }

  /**
   * Check if the current user has any of the specified roles.
   * New method for flexible role checking.
   *
   * @param roles - Array of roles to check for
   * @returns Observable that emits true if user has any of the roles
   */
  hasAnyRole(roles: UserRole[]): Observable<boolean> {
    return this.user$.pipe(
      map(user => {
        if (!user) return false;
        return roles.some(role => user.roles.includes(role));
      })
    );
  }

  /**
   * Get the current authenticated user data.
   * New method needed by AppAccessService.
   *
   * @returns Current authenticated user data or undefined if not authenticated
   */
  getAuthenticatedUser(): AuthenticatedUser | undefined {
    return this.auth;
  }

  /**
   * Get the current user's data from the JWT token.
   * Synchronous method for immediate access to user data.
   *
   * @returns Current user payload or undefined if not authenticated
   */
  getCurrentUser(): JwtContents | undefined {
    return this.auth?.user;
  }

  /**
   * Check if the current user (synchronously) has a specific role.
   * New method for immediate role checking without observables.
   *
   * @param role - Role to check for
   * @returns true if current user has the role
   */
  currentUserHasRole(role: UserRole): boolean {
    const user = this.getCurrentUser();
    return this.userHasRole(user, role);
  }

  /**
   * Check if the current user (synchronously) has any of the specified roles.
   *
   * @param roles - Array of roles to check for
   * @returns true if current user has any of the roles
   */
  currentUserHasAnyRole(roles: UserRole[]): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;
    return roles.some(role => user.roles.includes(role));
  }

  /**
   * Get current user as AuthorizedUser type for type safety.
   * New method that provides strongly typed user data.
   *
   * @returns Typed user data or undefined if not authenticated
   */
  getAuthorizedUser(): AuthorizedUser | undefined {
    const user = this.getCurrentUser();
    if (!user) return undefined;

    return {
      id: user.id,
      email: user.email,
      roles: user.roles
    };
  }

  /**
   * Explicit logout request by user.
   */
  logout() {
    this.unauthenticated();
  }

  /**
   * Called when API indicates user is no longer authenticated.
   */
  unauthenticated() {
    if (this.refreshHandle !== undefined) {
      clearTimeout(this.refreshHandle);
      this.refreshHandle = undefined;
    }

    if (this.auth === undefined) {
      return;
    }

    console.log('unauthenticated');
    this.auth = undefined;

    this.clearStore();

    this._authenticated.set(false);
  }

  /**
   * Get the current auth token for API requests.
   *
   * @returns JWT token string or undefined if not authenticated
   */
  getAuthToken() {
    return this.auth?.token;
  }

  /**
   * Helper method to check if a user has a specific role.
   * Works with both current user and passed user objects.
   *
   * @param user - User object to check (or undefined)
   * @param role - Role to check for
   * @returns true if user has the role
   */
  private userHasRole(user: JwtContents | undefined, role: UserRole): boolean {
    if (!user) return false;
    return user.roles.includes(role);
  }

  /**
   * User authenticated or token refreshed.
   * Schedules token refresh.
   * @param token
   * @param refreshToken
   * @returns false if expired
   */
  private onAuth(token: string, refreshToken: string): boolean {
    const auth = this.extractTokenPayload(token, refreshToken);
    if (auth.expires < Date.now() / 1_000) {
      console.log('token expired');
      return false;
    }

    console.log('onAuth', auth);
    this.auth = auth;
    this._authenticated.set(true);
    this.scheduleTokenRefresh(token);
    return true;
  }

  private refreshToken() {
    const auth = this.auth;
    if (auth === undefined) {
      throw new Error("unauthenticated, can't refresh token");
    }

    this.api
      .refreshToken(auth.refreshToken)
      .pipe(retry({ count: 2, delay: 2_000 }))
      .subscribe({
        next: newToken => {
          console.log('refreshed token');
          this.onAuth(newToken, auth.refreshToken);
          this.store();
        },
        error: err => {
          console.error('Refresh token failed!', err);
          this.unauthenticated();
        }
      });
  }

  private scheduleTokenRefresh(token: string) {
    const payload = jwtDecode(token);

    if (payload.exp && payload.iat) {
      // working with seconds.
      const expireTime = payload.exp - payload.iat;
      const refreshIn = expireTime - this.refreshPrior;
      if (refreshIn < 0) {
        console.warn('Token expiration too soon, not refreshing!');
      } else {
        console.log(`scheduling refresh token in ${refreshIn} seconds`);
        this.refreshHandle = setTimeout(() => {
          this.refreshHandle = undefined;
          this.refreshToken();
        }, refreshIn * 1_000);
      }
    }
  }

  private extractTokenPayload(token: string, refreshToken: string): AuthenticatedUser {
    const payload = jwtDecode<JwtContents & JwtPayload>(token);
    if (payload.exp === undefined) {
      throw new Error('exp field missing in token');
    }
    return {
      user: {
        email: payload.email,
        id: payload.id,
        roles: payload.roles
      },
      token,
      refreshToken,
      expires: payload.exp
    };
  }

  /**
   * Try to load from localStorage.
   */
  private load(): boolean {
    const token = localStorage.getItem(this.lsToken);
    const refreshToken = localStorage.getItem(this.lsRefreshToken);
    if (token != null && refreshToken != null) {
      const accepted = this.onAuth(token, refreshToken);
      if (accepted) {
        this.refreshToken();
        return true;
      } else {
        this.clearStore();
        return false;
      }
    } else {
      return false;
    }
  }

  /**
   * Store the current tokens in localStorage.
   */
  private store() {
    if (this.auth === undefined) {
      return;
    }
    const { token, refreshToken } = this.auth;
    localStorage.setItem(this.lsToken, token);
    localStorage.setItem(this.lsRefreshToken, refreshToken);
  }

  private clearStore() {
    localStorage.removeItem(this.lsToken);
    localStorage.removeItem(this.lsRefreshToken);
  }
}
