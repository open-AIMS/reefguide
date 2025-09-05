import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCard } from '@angular/material/card';
import { MatFormFieldModule, MatLabel, MatError } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';
import { catchError, finalize, Observable, of, tap } from 'rxjs';
import { WebApiService } from '../../../api/web-api.service';
import { AuthService } from '../auth.service';
import { MatIconModule } from '@angular/material/icon';

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
  private readonly api = inject(WebApiService);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

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
      this.api
        .changePassword({
          oldPassword: this.changePasswordForm.value.currentPassword!,
          newPassword: this.changePasswordForm.value.newPassword!,
          confirmPassword: this.changePasswordForm.value.confirmPassword!
        })
        .pipe(
          tap(() => {
            // Notify of success
            this.snackBar.open('Changed password successfully. Please login again.', 'Dismiss', {
              duration: 5000
            });
            // We have changed password, so we should logout since our refresh token
            // is invalid
            this.authService.logout();
          }),
          catchError(error => {
            this.snackBar.open(
              error.message || 'Failed to change password. Please try again.',
              'Dismiss',
              { duration: 5000 }
            );
            return of(null);
          }),
          finalize(() => this.isSubmitting.set(false))
        )
        .subscribe(); // Don't forget to subscribe!
    }
  }
}
