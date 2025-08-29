import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../auth.service';
import { SplashConfig, UserAccessState } from '../../auth.types';
import { ForgotPasswordConfirmComponent } from '../login-forms/forgot-password-confirm/forgot-password-confirm.component';
import { ForgotPasswordRequestComponent } from '../login-forms/forgot-password-request/forgot-password-request.component';
import { LoginComponent } from '../login-forms/login/login.component';
import { RegisterComponent } from '../login-forms/register/register.component';

type AuthMode = 'login' | 'register' | 'resetRequest' | 'resetConfirm';

/**
 * Splash Dialog Component - Manages different authentication states and forms
 */
@Component({
  selector: 'app-splash-dialog',
  standalone: true,
  imports: [
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    LoginComponent,
    RegisterComponent,
    ForgotPasswordRequestComponent,
    ForgotPasswordConfirmComponent
  ],
  templateUrl: './splash-dialog.component.html',
  styleUrl: './splash-dialog.component.scss',
  styles: ``
})
export class SplashDialogComponent {
  public readonly authService = inject(AuthService);

  /** Current user access state */
  userState = input.required<UserAccessState>();

  /** Configuration for splash screen */
  config = input.required<SplashConfig>();

  /** Emitted when user successfully logs in */
  loginSuccess = output<void>();

  /** Emitted when splash screen should be dismissed */
  dismissed = output<void>();

  /** Current authentication mode */
  authMode = signal<AuthMode>('login');

  /** Whether session refresh is in progress */
  isRefreshing = signal(false);

  /**
   * Get the appropriate title for the current state
   */
  getTitle = computed(() => {
    const state = this.userState();
    const mode = this.authMode();
    const appName = this.config().appName || 'Reef Guide';

    if (state === 'unauthenticated') {
      switch (mode) {
        case 'resetRequest':
          return 'Reset Password';
        case 'resetConfirm':
          return 'Set New Password';
        default:
          return `Welcome to ${appName}`;
      }
    }

    switch (state) {
      case 'loading':
        return `Loading ${appName}...`;
      case 'unauthorized':
        return 'Access Required';
      default:
        return appName;
    }
  });

  /**
   * Get the appropriate message for the current state
   */
  getMessage = computed(() => {
    const state = this.userState();
    const mode = this.authMode();
    const config = this.config();

    if (state === 'unauthenticated') {
      switch (mode) {
        case 'resetRequest':
          return 'Enter your email address to receive a password reset code';
        case 'resetConfirm':
          return 'Enter the reset code from your email and your new password';
        default:
          return 'Please sign in to access the platform.';
      }
    }

    switch (state) {
      case 'loading':
        return 'Checking your access permissions...';
      case 'unauthorized':
        return (
          config.unauthorizedMessage ||
          'Your account needs analyst or administrator access to use this application.'
        );
      default:
        return '';
    }
  });

  /**
   * Get contact information for unauthorized users
   */
  getContactInfo(): string {
    const config = this.config();
    return `Please contact ${config.adminEmail} to request access.`;
  }

  /**
   * Switch authentication mode
   */
  switchMode(mode: AuthMode): void {
    this.authMode.set(mode);
  }

  /**
   * Handle successful login
   */
  onLoginSuccess(): void {
    this.loginSuccess.emit();
  }

  /**
   * Handle successful registration - auto-login
   */
  onRegisterSuccess(credentials: { email: string; password: string }): void {
    this.authService.login(credentials.email, credentials.password).subscribe({
      next: () => this.loginSuccess.emit(),
      error: () => this.switchMode('login') // Fall back to login on auto-login failure
    });
  }

  /**
   * Handle successful reset request
   */
  onResetRequestSuccess(): void {
    this.switchMode('resetConfirm');
  }

  /**
   * Handle successful reset confirmation
   */
  onResetConfirmSuccess(): void {
    setTimeout(() => {
      this.switchMode('login');
    }, 2000);
  }

  /**
   * Open email client for access request
   */
  openEmailClient(): void {
    const adminEmail = this.config().adminEmail;
    const subject = 'ReefGuide Access Request';
    const emailUrl = `mailto:${adminEmail}?subject=${encodeURIComponent(subject)}`;
    window.open(emailUrl, '_self');
  }

  /**
   * Refresh user session
   */
  refreshSession(): void {
    const currentAuth = this.authService.getAuthenticatedUser();
    if (currentAuth) {
      this.isRefreshing.set(true);
      this.authService.refreshToken();

      setTimeout(() => {
        this.isRefreshing.set(false);
      }, 1500);
    }
  }
}
