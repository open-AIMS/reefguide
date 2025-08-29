import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { merge, take } from 'rxjs';
import { extractErrorMessage } from '../../../api/api-util';
import { WebApiService } from '../../../api/web-api.service';
import { AuthService } from '../auth.service';
import { SplashConfig, UserAccessState } from '../auth.types';

type AuthMode = 'login' | 'register' | 'resetRequest' | 'resetConfirm';
type Credentials = { email: string; password: string };
type ResetRequest = { email: string };
type ResetConfirm = { code: string; newPassword: string; confirmPassword: string };

/**
 * Splash Screen Component
 *
 * This component serves as the main entry point for user authentication and
 * authorization. It displays different panels based on the user's access state
 * and handles the login/register/password reset flow.
 */
@Component({
  selector: 'app-splash-screen',
  standalone: true,
  imports: [
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

  /** Current authentication mode */
  authMode = signal<AuthMode>('login');

  /** Whether authentication request is in progress */
  isAuthenticating = signal(false);

  /** Current error message to display */
  errorMessage = signal<string | undefined>(undefined);

  /** Success message for password reset request */
  successMessage = signal<string | undefined>(undefined);

  /** Whether password field is visible */
  hidePassword = signal(true);

  /** Whether confirm password field is visible */
  hideConfirmPassword = signal(true);

  /** Signal to track form validity */
  private formValid = signal(false);

  /** Signal to track request form validity */
  private requestFormValid = signal(false);
  private submitResetFormValid = signal(false);

  /** Signal to track form disabled state */
  private formDisabled = signal(false);

  /**
   * Reactive form for login/register with validation
   */
  authForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(8)])
  });

  /**
   * Reactive form for password reset request
   */
  resetRequestForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email])
  });

  /**
   * Reactive form for password reset confirmation
   */
  resetConfirmForm = new FormGroup({
    code: new FormControl('', [
      Validators.required,
      Validators.minLength(6),
      Validators.maxLength(10)
    ]),
    newPassword: new FormControl('', [Validators.required, Validators.minLength(8)]),
    confirmPassword: new FormControl('', [Validators.required])
  });

  constructor() {
    // Initialize form state signals
    this.formValid.set(this.authForm.valid);
    this.requestFormValid.set(this.resetRequestForm.valid);
    this.submitResetFormValid.set(this.resetConfirmForm.valid);
    this.formDisabled.set(this.authForm.disabled);

    // Subscribe to form changes and update signals
    this.authForm.valueChanges.subscribe(() => {
      this.formValid.set(this.authForm.valid);
    });
    this.resetRequestForm.valueChanges.subscribe(() => {
      this.requestFormValid.set(this.resetRequestForm.valid);
    });
    this.resetConfirmForm.valueChanges.subscribe(() => {
      this.submitResetFormValid.set(this.resetConfirmForm.valid);
    });

    this.authForm.statusChanges.subscribe(() => {
      this.formValid.set(this.authForm.valid);
      this.formDisabled.set(this.authForm.disabled);
    });

    // Add password confirmation validator for reset form
    this.resetConfirmForm.get('confirmPassword')?.addValidators(control => {
      const newPassword = this.resetConfirmForm.get('newPassword')?.value;
      const confirmPassword = control.value;
      return newPassword === confirmPassword ? null : { mismatch: true };
    });

    // Update confirm password validation when new password changes
    this.resetConfirmForm.get('newPassword')?.valueChanges.subscribe(() => {
      this.resetConfirmForm.get('confirmPassword')?.updateValueAndValidity();
    });

    // Effect to ensure form is enabled by default
    effect(() => {
      if (!this.isAuthenticating()) {
        if (this.authForm.disabled) {
          this.authForm.enable();
          this.formDisabled.set(false);
        }
        if (this.resetRequestForm.disabled) {
          this.resetRequestForm.enable();
        }
        if (this.resetConfirmForm.disabled) {
          this.resetConfirmForm.enable();
        }
      }
    });
  }

  /**
   * Computed properties for template binding
   */
  isLoginMode = computed(() => this.authMode() === 'login');
  isRegisterMode = computed(() => this.authMode() === 'register');
  isResetRequestMode = computed(() => this.authMode() === 'resetRequest');
  isResetConfirmMode = computed(() => this.authMode() === 'resetConfirm');

  canSubmit = computed(() => {
    const notAuthenticating = !this.isAuthenticating();
    const mode = this.authMode();

    switch (mode) {
      case 'login':
      case 'register':
        return this.formValid() && notAuthenticating && !this.formDisabled();
      case 'resetRequest':
        return this.requestFormValid() && notAuthenticating;
      case 'resetConfirm':
        return this.requestFormValid() && notAuthenticating;
      default:
        return false;
    }
  });

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
   * Get the appropriate subtitle/message for the current state
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
   * Get the current form button text
   */
  getButtonText = computed(() => {
    const mode = this.authMode();

    if (this.isAuthenticating()) {
      switch (mode) {
        case 'resetRequest':
          return 'Sending reset code...';
        case 'resetConfirm':
          return 'Updating password...';
        case 'register':
          return 'Creating account...';
        default:
          return 'Signing in...';
      }
    }

    switch (mode) {
      case 'resetRequest':
        return 'Send Reset Code';
      case 'resetConfirm':
        return 'Update Password';
      case 'register':
        return 'Create Account';
      default:
        return 'Sign In';
    }
  });

  /**
   * Handle form submission for login, register, or password reset
   */
  onSubmit(): void {
    if (!this.canSubmit()) return;

    this.resetMessages();
    const mode = this.authMode();

    switch (mode) {
      case 'login':
        this.login(this.authForm.value as Credentials);
        break;
      case 'register':
        this.register(this.authForm.value as Credentials);
        break;
      case 'resetRequest':
        this.requestPasswordReset(this.resetRequestForm.value as ResetRequest);
        break;
      case 'resetConfirm':
        this.confirmPasswordReset(this.resetConfirmForm.value as ResetConfirm);
        break;
    }
  }

  /**
   * Switch between different authentication modes
   */
  switchMode(mode: AuthMode): void {
    this.resetMessages();
    this.authMode.set(mode);
  }

  /**
   * Toggle password visibility
   */
  togglePasswordVisibility(): void {
    this.hidePassword.update(hidden => !hidden);
  }

  /**
   * Toggle confirm password visibility
   */
  toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.update(hidden => !hidden);
  }

  /**
   * Handle login request
   */
  private login(credentials: Credentials): void {
    this.setAuthenticating(true);

    this.authService.login(credentials.email, credentials.password).subscribe({
      next: () => {
        this.setAuthenticating(false);
        this.loginSuccess.emit();
      },
      error: error => {
        this.handleError(error);
      }
    });
  }

  /**
   * Handle registration request
   */
  private register(credentials: Credentials): void {
    this.setAuthenticating(true);

    this.webApiService.register(credentials).subscribe({
      next: () => {
        // After successful registration, automatically log in
        this.login(credentials);
      },
      error: error => {
        this.handleError(error);
      }
    });
  }

  /**
   * Handle password reset request
   */
  private requestPasswordReset(resetRequest: ResetRequest): void {
    this.setAuthenticating(true);

    this.webApiService.requestPasswordReset(resetRequest).subscribe({
      next: response => {
        this.setAuthenticating(false);
        this.successMessage.set(response.message);
        this.authMode.set('resetConfirm');
      },
      error: error => {
        this.handlePasswordResetError(error);
      }
    });
  }

  /**
   * Handle password reset confirmation
   */
  private confirmPasswordReset(resetConfirm: ResetConfirm): void {
    this.setAuthenticating(true);

    this.webApiService.confirmPasswordReset(resetConfirm).subscribe({
      next: response => {
        this.setAuthenticating(false);
        this.successMessage.set(response.message);

        // After successful password reset, switch to login mode
        setTimeout(() => {
          this.authMode.set('login');
          this.resetMessages();
        }, 2000);
      },
      error: error => {
        this.handlePasswordResetError(error);
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
   * Handle password reset specific errors
   */
  private handlePasswordResetError(error: any): void {
    this.setAuthenticating(false);
    const errorMessage = extractErrorMessage(error);

    // For password reset errors, show a more user-friendly message
    if (
      errorMessage.toLowerCase().includes('network') ||
      errorMessage.toLowerCase().includes('server')
    ) {
      this.errorMessage.set(
        'Unable to process request. Please contact the system administrator for assistance.'
      );
    } else {
      this.errorMessage.set(errorMessage);
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
    merge(...valueChanges)
      .pipe(take(1))
      .subscribe(() => {
        this.resetMessages();
      });
  }

  /**
   * Reset all error and success messages
   */
  private resetMessages(): void {
    this.errorMessage.set(undefined);
    this.successMessage.set(undefined);

    const { email, password } = this.authForm.controls;

    // Clear server errors while preserving validation errors
    const emailValidationErrors = {
      ...(email.hasError('required') && { required: true }),
      ...(email.hasError('email') && { email: true })
    };

    const passwordValidationErrors = {
      ...(password.hasError('required') && { required: true }),
      ...(password.hasError('minlength') && { minlength: true })
    };

    email.setErrors(Object.keys(emailValidationErrors).length > 0 ? emailValidationErrors : null);
    password.setErrors(
      Object.keys(passwordValidationErrors).length > 0 ? passwordValidationErrors : null
    );

    // Force form validation update
    email.updateValueAndValidity();
    password.updateValueAndValidity();
  }

  /**
   * Set authenticating state and manage form interaction
   */
  private setAuthenticating(authenticating: boolean): void {
    this.isAuthenticating.set(authenticating);

    if (authenticating) {
      this.authForm.disable();
      this.resetRequestForm.disable();
      this.resetConfirmForm.disable();
      this.formDisabled.set(true);
    } else {
      this.authForm.enable();
      this.resetRequestForm.enable();
      this.resetConfirmForm.enable();
      this.formDisabled.set(false);

      // Force validation update after re-enabling
      this.authForm.updateValueAndValidity();
      this.resetRequestForm.updateValueAndValidity();
      this.resetConfirmForm.updateValueAndValidity();
      this.formValid.set(this.authForm.valid);
    }
  }

  /**
   * Get contact information for unauthorized users
   */
  getContactInfo(): string {
    const config = this.config();
    return `Please contact ${config.adminEmail} to request access.`;
  }

  openEmailClient() {
    const adminEmail = this.config().adminEmail;
    const subject = 'ReefGuide Access Request';
    const emailUrl = `mailto:${adminEmail}?subject=${encodeURIComponent(subject)}`;

    // Try to open mailto
    window.open(emailUrl, '_self');

    // Also provide fallback instructions
    setTimeout(() => {
      if (
        confirm(
          "If your email client didn't open, would you like to copy the email address to your clipboard?"
        )
      ) {
        navigator.clipboard.writeText(adminEmail).then(() => {
          alert(
            `Email address copied! Please send your request to:\n${adminEmail}\nSubject: ReefGuide Access Request`
          );
        });
      }
    }, 1000);
  }

  /**
   * Handle keyboard events for better accessibility
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && this.canSubmit()) {
      this.onSubmit();
    }
  }

  /**
   * Refresh user session to get updated roles
   */
  refreshSession(): void {
    // Force token refresh which will get updated user roles
    const currentAuth = this.authService.getAuthenticatedUser();
    if (currentAuth) {
      this.setAuthenticating(true);
      // Call the public refreshToken method
      this.authService.refreshToken();

      // Reset authenticating state after a delay
      setTimeout(() => {
        this.setAuthenticating(false);
        // The splash screen will automatically update based on new roles via
        // signals
      }, 1500);
    }
  }
}
