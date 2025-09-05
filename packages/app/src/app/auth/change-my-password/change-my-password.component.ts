import { Component, EventEmitter, inject, Output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCard } from '@angular/material/card';
import { MatError, MatFormFieldModule, MatLabel } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ChangePasswordInput } from '@reefguide/types';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth.service';

@Component({
  selector: 'change-my-password',
  imports: [
    MatCard,
    MatFormFieldModule,
    ReactiveFormsModule,
    MatInputModule,
    MatLabel,
    MatError,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './change-my-password.component.html',
  styleUrl: './change-my-password.component.scss'
})
export class ChangeMyPasswordComponent {
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

  // Triggered when successfully changed
  @Output() onSuccess = new EventEmitter<void>();

  readonly isSubmitting = signal(false);
  hideCurrentPassword = true;
  hideNewPassword = true;
  hideConfirmPassword = true;

  public changePasswordForm = new FormGroup<{
    currentPassword: FormControl<string>;
    newPassword: FormControl<string>;
    confirmPassword: FormControl<string>;
  }>({
    currentPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    newPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)]
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8)]
    })
  });

  get currentPassword() {
    return this.changePasswordForm.get('currentPassword')!;
  }

  get newPassword() {
    return this.changePasswordForm.get('newPassword')!;
  }

  get confirmPassword() {
    return this.changePasswordForm.get('confirmPassword')!;
  }

  // Change password
  async changePassword(payload: ChangePasswordInput): Promise<{ message: string }> {
    // NOTE: this is a separate fetch request for now since
    // HTTPClient has the default behaviour due to the AuthInterceptor of logging
    // out if it 401s- for the web-api change password route this is not suitable
    // as a user may accidentally enter their current password in incorrectly
    return fetch(`${environment.webApiUrl}/auth/change-password`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.authService.getAuthToken()}`
      }
    }).then(async res => {
      if (res.status == 200) {
        return res.json();
      } else {
        const errorText = await res.text();
        throw new Error(
          `Failed to change password. Status: ${res.status}. Error message: ${errorText || res.statusText || 'Unknown.'}`
        );
      }
    });
  }

  onSubmit(): void {
    if (this.changePasswordForm.valid && !this.isSubmitting()) {
      // Check if new password matches confirm password
      if (this.newPassword.value !== this.confirmPassword.value) {
        this.snackBar.open('New passwords do not match', 'Dismiss', {
          duration: 5000
        });
        return;
      }

      this.isSubmitting.set(true);
      this.changePassword({
        oldPassword: this.changePasswordForm.value.currentPassword!,
        newPassword: this.changePasswordForm.value.newPassword!,
        confirmPassword: this.changePasswordForm.value.confirmPassword!
      })
        .then(() => {
          // Success - this only runs on successful response
          this.onSuccess.emit();
          this.snackBar.open('Changed password successfully. Please login again.', 'Dismiss', {
            duration: 5000
          });
          this.authService.logout();
        })
        .catch(error => {
          // Error - this runs on HTTP errors (401, 500, etc.)
          this.snackBar.open(
            error.message || 'Failed to change password. Please try again.',
            'Dismiss',
            { duration: 5000 }
          );
        })
        .finally(() => this.isSubmitting.set(false));
    }
  }
}
