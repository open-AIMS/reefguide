import { Component, inject, output, signal, computed } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { map, startWith, take } from 'rxjs';

import { WebApiService } from '../../../../../api/web-api.service';
import { extractErrorMessage } from '../../../../../api/api-util';
import { toSignal } from '@angular/core/rxjs-interop';

type AuthMode = 'login' | 'register' | 'resetRequest' | 'resetConfirm';

/**
 * Forgot Password Request Component
 */
@Component({
  selector: 'app-forgot-password-request',
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
  templateUrl: './forgot-password-request.component.html',
  styleUrls: ['./forgot-password-request.component.scss', '../form-styles.scss']
})
export class ForgotPasswordRequestComponent {
  private readonly webApiService = inject(WebApiService);

  /** Emitted when reset request is successful */
  resetRequestSuccess = output<void>();

  /** Emitted when user wants to switch auth mode */
  switchMode = output<AuthMode>();

  /** Whether request is in progress */
  isRequesting = signal(false);

  /** Current error message */
  errorMessage = signal<string | undefined>(undefined);

  /** Reset request form */
  resetForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email])
  });

  /** Is the form valid? */
  isValid = toSignal(
    this.resetForm.statusChanges.pipe(
      map(status => status === 'VALID'),
      startWith(this.resetForm.valid)
    )
  );

  /** Whether form can be submitted */
  canSubmit = computed(() => this.isValid() && !this.isRequesting());

  constructor() {
    this.setupErrorClearing();
  }

  /**
   * Submit reset request form
   */
  onSubmit(): void {
    if (!this.canSubmit()) return;

    this.clearErrors();
    const { email } = this.resetForm.value;

    if (!email) return;

    this.isRequesting.set(true);

    this.webApiService.requestPasswordReset({ email }).subscribe({
      next: () => {
        this.isRequesting.set(false);
        this.resetRequestSuccess.emit();
      },
      error: error => {
        this.handleError(error);
      }
    });
  }

  /**
   * Switch to reset confirm mode
   */
  switchToResetConfirm(): void {
    this.switchMode.emit('resetConfirm');
  }

  /**
   * Switch to login mode
   */
  switchToLogin(): void {
    this.switchMode.emit('login');
  }

  /**
   * Handle request errors
   */
  private handleError(error: any): void {
    this.isRequesting.set(false);
    const errorMsg = extractErrorMessage(error);
    this.errorMessage.set(errorMsg);
  }

  /**
   * Clear error messages
   */
  private clearErrors(): void {
    this.errorMessage.set(undefined);
  }

  /**
   * Setup error clearing when user types
   */
  private setupErrorClearing(): void {
    const { email } = this.resetForm.controls;

    email.valueChanges.pipe(take(1)).subscribe(() => {
      this.clearErrors();
    });
  }
}
