import { Component, inject, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { merge, take } from 'rxjs';
import { AuthService } from '../auth.service';
import { WebApiService } from '../../../api/web-api.service';
import { extractErrorMessage } from '../../../api/api-util';
import { UserAccessState, SplashConfig } from '../auth.types';

type AuthMode = 'login' | 'register';
type Credentials = { email: string; password: string };

/**
 * This component serves as the main entry point for user authentication and authorization.
 * It displays different panels based on the user's access state and handles the login/register flow.
 *
 * Features:
 * - Animated background with backdrop blur
 * - Login and registration forms with validation
 * - Role-based access messaging
 * - Responsive design with loading states
 * - Accessible form controls with proper ARIA labels
 *
 * @example
 * ```html
 * <app-splash-screen
 *   [userState]="userAccessState()"
 *   [config]="splashConfig()"
 *   (loginSuccess)="onLoginSuccess()">
 * </app-splash-screen>
 * ```
 */
@Component({
  selector: 'app-splash-screen',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatDividerModule,
    MatTooltipModule
  ],
  templateUrl: './splash-screen.component.html',
  styleUrl: './splash-screen.component.scss'
})
export class SplashScreenComponent {
  public readonly authService = inject(AuthService);
  private readonly webApiService = inject(WebApiService);

  /** Current user access state - determines which panel to show */
  userState = input.required<UserAccessState>();

  /** Configuration for splash screen behavior and messaging */
  config = input.required<SplashConfig>();

  /** Emitted when user successfully logs in */
  loginSuccess = output<void>();

  /** Emitted when splash screen should be dismissed */
  dismissed = output<void>();

  /** Current authentication mode (login or register) */
  authMode = signal<AuthMode>('login');

  /** Whether authentication request is in progress */
  isAuthenticating = signal(false);

  /** Current error message to display */
  errorMessage = signal<string | undefined>(undefined);

  /** Whether password field is visible */
  hidePassword = signal(true);

  /**
   * Reactive form for login/register with validation
   */
  authForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(8)])
  });

  /**
   * Computed properties for template binding
   */
  isLoginMode = computed(() => this.authMode() === 'login');
  isRegisterMode = computed(() => this.authMode() === 'register');
  canSubmit = computed(() => this.authForm.valid && !this.isAuthenticating());

  /**
   * Get the appropriate title for the current state
   */
  getTitle = computed(() => {
    const state = this.userState();
    const appName = this.config().appName || 'MADAME';

    switch (state) {
      case 'loading':
        return `Loading ${appName}...`;
      case 'unauthenticated':
        return `Welcome to ${appName}`;
      case 'unauthorized':
        return 'Access Required';
      default:
        return appName;
    }
  });

  /**
   * Get the appropriate subtitle/message for the current state
   */
  getMessage = computed(() => {
    const state = this.userState();
    const config = this.config();

    switch (state) {
      case 'loading':
        return 'Checking your access permissions...';
      case 'unauthenticated':
        return 'Please sign in to access the marine environment analysis platform.';
      case 'unauthorized':
        return config.unauthorizedMessage ||
               'Your account needs analyst or administrator access to use this application.';
      default:
        return '';
    }
  });

  /**
   * Get the current form button text
   */
  getButtonText = computed(() => {
    if (this.isAuthenticating()) {
      return this.isLoginMode() ? 'Signing in...' : 'Creating account...';
    }
    return this.isLoginMode() ? 'Sign In' : 'Create Account';
  });

  /**
   * Handle form submission for login or register
   */
  onSubmit(): void {
    if (!this.canSubmit()) return;

    this.resetErrors();
    const credentials = this.authForm.value as Credentials;

    if (this.isRegisterMode()) {
      this.register(credentials);
    } else {
      this.login(credentials);
    }
  }

  /**
   * Switch between login and register modes
   */
  switchMode(): void {
    this.resetErrors();
    this.authMode.set(this.isLoginMode() ? 'register' : 'login');
  }

  /**
   * Toggle password visibility
   */
  togglePasswordVisibility(): void {
    this.hidePassword.update(hidden => !hidden);
  }

  /**
   * Handle login request
   */
  private login(credentials: Credentials): void {
    console.info('Attempting login for:', credentials.email);
    this.setAuthenticating(true);

    this.authService.login(credentials.email, credentials.password).subscribe({
      next: () => {
        console.info('Login successful');
        this.setAuthenticating(false);
        this.loginSuccess.emit();
      },
      error: (error) => {
        console.error('Login failed:', error);
        this.handleError(error);
      }
    });
  }

  /**
   * Handle registration request
   */
  private register(credentials: Credentials): void {
    console.info('Attempting registration for:', credentials.email);
    this.setAuthenticating(true);

    this.webApiService.register(credentials).subscribe({
      next: () => {
        console.info('Registration successful, attempting login');
        // After successful registration, automatically log in
        this.login(credentials);
      },
      error: (error) => {
        console.error('Registration failed:', error);
        this.handleError(error);
      }
    });
  }

  /**
   * Handle authentication errors with user-friendly messages
   */
  private handleError(error: any): void {
    this.setAuthenticating(false);
    const errorMessage = extractErrorMessage(error);
    this.errorMessage.set(errorMessage);

    const { email, password } = this.authForm.controls;

    // Set field-specific errors for better UX
    if (this.isEmailError(errorMessage)) {
      email.setErrors({ serverError: true });
      this.clearErrorOnChange(email);
    } else if (this.isCredentialsError(errorMessage)) {
      email.setErrors({ serverError: true });
      password.setErrors({ serverError: true });
      this.clearErrorOnChange(email, password);
    }
  }

  /**
   * Check if error is related to email validation
   */
  private isEmailError(message: string): boolean {
    const emailErrors = ['Invalid email', 'User already exists', 'Email already registered'];
    return emailErrors.some(err => message.includes(err));
  }

  /**
   * Check if error is related to credentials
   */
  private isCredentialsError(message: string): boolean {
    return message.includes('Invalid credentials') || message.includes('Authentication failed');
  }

  /**
   * Clear errors when user starts typing
   */
  private clearErrorOnChange(...controls: FormControl[]): void {
    const valueChanges = controls.map(control => control.valueChanges);
    merge(...valueChanges).pipe(take(1)).subscribe(() => {
      this.resetErrors();
    });
  }

  /**
   * Reset all error states
   */
  private resetErrors(): void {
    this.errorMessage.set(undefined);
    const { email, password } = this.authForm.controls;

    // Clear server errors while preserving validation errors
    if (email.hasError('serverError')) {
      email.setErrors(email.hasError('required') || email.hasError('email') ?
        { required: email.hasError('required'), email: email.hasError('email') } : null);
    }

    if (password.hasError('serverError')) {
      password.setErrors(password.hasError('required') || password.hasError('minlength') ?
        { required: password.hasError('required'), minlength: password.hasError('minlength') } : null);
    }
  }

  /**
   * Set authenticating state and manage form interaction
   */
  private setAuthenticating(authenticating: boolean): void {
    this.isAuthenticating.set(authenticating);
    if (authenticating) {
      this.authForm.disable();
    } else {
      this.authForm.enable();
    }
  }

  /**
   * Get contact information for unauthorized users
   */
  getContactInfo(): string {
    const config = this.config();
    return `Please contact ${config.adminEmail} to request access.`;
  }

  /**
   * Handle keyboard events for better accessibility
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && this.canSubmit()) {
      this.onSubmit();
    }
  }
}
