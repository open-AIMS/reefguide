import { Component, inject, output, signal, computed } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { map, merge, startWith, take } from 'rxjs';
import { WebApiService } from '../../../../../api/web-api.service';
import { extractErrorMessage } from '../../../../../api/api-util';
import { toSignal } from '@angular/core/rxjs-interop';

type AuthMode = 'login' | 'register' | 'resetRequest' | 'resetConfirm';

/**
 * Register Form Component
 */
@Component({
  selector: 'app-register',
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
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  private readonly webApiService = inject(WebApiService);

  /** Emitted when registration is successful */
  registerSuccess = output<{ email: string; password: string }>();

  /** Emitted when user wants to switch auth mode */
  switchMode = output<AuthMode>();

  /** Whether registration is in progress */
  isRegistering = signal(false);

  /** Current error message */
  errorMessage = signal<string | undefined>(undefined);

  /** Whether password field is hidden */
  hidePassword = signal(true);

  /** Register form */
  registerForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(8)])
  });

  /** Is the form valid? */
  isValid = toSignal(
    this.registerForm.statusChanges.pipe(
      map(status => status === 'VALID'),
      startWith(this.registerForm.valid)
    )
  );

  /** Whether form can be submitted */
  canSubmit = computed(() => this.isValid() && !this.isRegistering());

  /** Whether form has field-specific errors */
  hasFieldErrors = computed(
    () =>
      this.registerForm.get('email')?.hasError('serverError') ||
      this.registerForm.get('password')?.hasError('serverError')
  );

  constructor() {
    this.setupErrorClearing();
  }

  /**
   * Toggle password visibility
   */
  togglePasswordVisibility(): void {
    this.hidePassword.update(hidden => !hidden);
  }

  /**
   * Submit registration form
   */
  onSubmit(): void {
    if (!this.canSubmit()) return;

    this.clearErrors();
    const { email, password } = this.registerForm.value;

    if (!email || !password) return;

    this.isRegistering.set(true);

    this.webApiService.register({ email, password }).subscribe({
      next: () => {
        this.isRegistering.set(false);
        this.registerSuccess.emit({ email, password });
      },
      error: error => {
        this.handleError(error);
      }
    });
  }

  /**
   * Switch to login mode
   */
  switchToLogin(): void {
    this.switchMode.emit('login');
  }

  /**
   * Handle registration errors
   */
  private handleError(error: any): void {
    this.isRegistering.set(false);
    const errorMsg = extractErrorMessage(error);
    this.errorMessage.set(errorMsg);

    const { email } = this.registerForm.controls;

    if (this.isEmailError(errorMsg)) {
      email.setErrors({ serverError: true });
    }
  }

  /**
   * Check if error is email-related
   */
  private isEmailError(message: string): boolean {
    const emailErrors = ['User already exists', 'Email already registered', 'Invalid email'];
    return emailErrors.some(err => message.includes(err));
  }

  /**
   * Clear all error messages
   */
  private clearErrors(): void {
    this.errorMessage.set(undefined);

    const { email, password } = this.registerForm.controls;

    const emailErrors = {
      ...(email.hasError('required') && { required: true }),
      ...(email.hasError('email') && { email: true })
    };

    const passwordErrors = {
      ...(password.hasError('required') && { required: true }),
      ...(password.hasError('minlength') && { minlength: true })
    };

    email.setErrors(Object.keys(emailErrors).length > 0 ? emailErrors : null);
    password.setErrors(Object.keys(passwordErrors).length > 0 ? passwordErrors : null);
  }

  /**
   * Setup error clearing when user types
   */
  private setupErrorClearing(): void {
    const { email, password } = this.registerForm.controls;

    merge(email.valueChanges, password.valueChanges)
      .pipe(take(1))
      .subscribe(() => {
        this.clearErrors();
      });
  }
}
