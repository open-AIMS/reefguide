import { Component, inject, output, signal, computed } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { map, merge, startWith, take } from 'rxjs';

import { AuthService } from '../../../auth.service';
import { extractErrorMessage } from '../../../../../api/api-util';
import { toSignal } from '@angular/core/rxjs-interop';

type AuthMode = 'login' | 'register' | 'resetRequest' | 'resetConfirm';

/**
 * Login Form Component
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatDividerModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss', '../form-styles.scss']
})
export class LoginComponent {
  private readonly authService = inject(AuthService);

  /** Emitted when login is successful */
  loginSuccess = output<void>();

  /** Emitted when user wants to switch auth mode */
  switchMode = output<AuthMode>();

  /** Whether authentication is in progress */
  isAuthenticating = signal(false);

  /** Current error message */
  errorMessage = signal<string | undefined>(undefined);

  /** Whether password field is hidden */
  hidePassword = signal(true);

  /** Login form */
  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required])
  });

  /** Is the form valid? */
  isValid = toSignal(
    this.loginForm.statusChanges.pipe(
      map(status => status === 'VALID'),
      startWith(this.loginForm.valid)
    )
  );

  /** Whether form can be submitted */
  canSubmit = computed(() => this.isValid() && !this.isAuthenticating());

  /** Whether form has field-specific errors */
  hasFieldErrors = computed(
    () =>
      this.loginForm.get('email')?.hasError('serverError') ||
      this.loginForm.get('password')?.hasError('serverError')
  );

  constructor() {
    // Clear errors when user starts typing
    this.setupErrorClearing();
  }

  /**
   * Toggle password visibility
   */
  togglePasswordVisibility(): void {
    this.hidePassword.update(hidden => !hidden);
  }

  /**
   * Submit login form
   */
  onSubmit(): void {
    if (!this.canSubmit()) return;

    this.clearErrors();
    const { email, password } = this.loginForm.value;

    if (!email || !password) return;

    this.isAuthenticating.set(true);

    this.authService.login(email, password).subscribe({
      next: () => {
        this.isAuthenticating.set(false);
        this.loginSuccess.emit();
      },
      error: error => {
        this.handleError(error);
      }
    });
  }

  /**
   * Switch to register mode
   */
  switchToRegister(): void {
    this.switchMode.emit('register');
  }

  /**
   * Switch to reset request mode
   */
  switchToResetRequest(): void {
    this.switchMode.emit('resetRequest');
  }

  /**
   * Handle authentication errors
   */
  private handleError(error: any): void {
    this.isAuthenticating.set(false);
    const errorMsg = extractErrorMessage(error);
    this.errorMessage.set(errorMsg);

    const { email, password } = this.loginForm.controls;

    // Set field-specific errors
    if (this.isEmailError(errorMsg)) {
      email.setErrors({ serverError: true });
    } else if (this.isCredentialsError(errorMsg)) {
      email.setErrors({ serverError: true });
      password.setErrors({ serverError: true });
    }
  }

  /**
   * Check if error is email-related
   */
  private isEmailError(message: string): boolean {
    const emailErrors = ['Invalid email', 'User not found', 'Email not found'];
    return emailErrors.some(err => message.includes(err));
  }

  /**
   * Check if error is credentials-related
   */
  private isCredentialsError(message: string): boolean {
    return message.includes('Invalid credentials') || message.includes('Authentication failed');
  }

  /**
   * Clear all error messages
   */
  private clearErrors(): void {
    this.errorMessage.set(undefined);

    // Clear server errors while preserving validation errors
    const { email, password } = this.loginForm.controls;

    const emailErrors = {
      ...(email.hasError('required') && { required: true }),
      ...(email.hasError('email') && { email: true })
    };

    const passwordErrors = {
      ...(password.hasError('required') && { required: true })
    };

    email.setErrors(Object.keys(emailErrors).length > 0 ? emailErrors : null);
    password.setErrors(Object.keys(passwordErrors).length > 0 ? passwordErrors : null);
  }

  /**
   * Setup error clearing when user types
   */
  private setupErrorClearing(): void {
    const { email, password } = this.loginForm.controls;

    merge(email.valueChanges, password.valueChanges)
      .pipe(take(1))
      .subscribe(() => {
        this.clearErrors();
      });
  }
}
