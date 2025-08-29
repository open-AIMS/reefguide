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
 * Forgot Password Confirm Component
 */
@Component({
  selector: 'app-forgot-password-confirm',
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
  templateUrl: './forgot-password-confirm.component.html',
  styleUrl: './forgot-password-confirm.component.scss'
})
export class ForgotPasswordConfirmComponent {
  private readonly webApiService = inject(WebApiService);

  /** Emitted when reset confirm is successful */
  resetConfirmSuccess = output<void>();

  /** Emitted when user wants to switch auth mode */
  switchMode = output<AuthMode>();

  /** Whether confirmation is in progress */
  isConfirming = signal(false);

  /** Current error message */
  errorMessage = signal<string | undefined>(undefined);

  /** Success message */
  successMessage = signal<string | undefined>(undefined);

  /** Whether password field is hidden */
  hidePassword = signal(true);

  /** Whether confirm password field is hidden */
  hideConfirmPassword = signal(true);

  /** Reset confirmation form */
  confirmForm = new FormGroup({
    code: new FormControl('', [
      Validators.required,
      Validators.minLength(6),
      Validators.maxLength(10)
    ]),
    newPassword: new FormControl('', [Validators.required, Validators.minLength(8)]),
    confirmPassword: new FormControl('', [Validators.required])
  });

  /** Is the form valid? */
  isValid = toSignal(
    this.confirmForm.statusChanges.pipe(
      map(status => status === 'VALID'),
      startWith(this.confirmForm.valid)
    )
  );

  /** Whether form can be submitted */
  canSubmit = computed(() => this.isValid() && !this.isConfirming());

  constructor() {
    this.setupPasswordValidation();
    this.setupErrorClearing();
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
   * Submit confirmation form
   */
  onSubmit(): void {
    if (!this.canSubmit()) return;

    this.clearMessages();
    const { code, newPassword, confirmPassword } = this.confirmForm.value;

    if (!code || !newPassword || !confirmPassword) return;

    this.isConfirming.set(true);

    this.webApiService.confirmPasswordReset({ code, newPassword, confirmPassword }).subscribe({
      next: response => {
        this.isConfirming.set(false);
        this.successMessage.set(response.message || 'Password updated successfully!');
        this.resetConfirmSuccess.emit();
      },
      error: error => {
        this.handleError(error);
      }
    });
  }

  /**
   * Switch to reset request mode
   */
  switchToResetRequest(): void {
    this.switchMode.emit('resetRequest');
  }

  /**
   * Switch to login mode
   */
  switchToLogin(): void {
    this.switchMode.emit('login');
  }

  /**
   * Handle confirmation errors
   */
  private handleError(error: any): void {
    this.isConfirming.set(false);
    const errorMsg = extractErrorMessage(error);
    this.errorMessage.set(errorMsg);
  }

  /**
   * Clear all messages
   */
  private clearMessages(): void {
    this.errorMessage.set(undefined);
    this.successMessage.set(undefined);
  }

  /**
   * Setup password confirmation validation
   */
  private setupPasswordValidation(): void {
    this.confirmForm.get('confirmPassword')?.addValidators(control => {
      const newPassword = this.confirmForm.get('newPassword')?.value;
      const confirmPassword = control.value;
      return newPassword === confirmPassword ? null : { mismatch: true };
    });

    // Update confirm password validation when new password changes
    this.confirmForm.get('newPassword')?.valueChanges.subscribe(() => {
      this.confirmForm.get('confirmPassword')?.updateValueAndValidity();
    });
  }

  /**
   * Setup error clearing when user types
   */
  private setupErrorClearing(): void {
    const { code, newPassword, confirmPassword } = this.confirmForm.controls;

    merge(code.valueChanges, newPassword.valueChanges, confirmPassword.valueChanges)
      .pipe(take(1))
      .subscribe(() => {
        this.clearMessages();
      });
  }
}
