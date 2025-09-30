import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * NG auth guard - checks if user is authenticated else redirects -> home page
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const snackBar = inject(MatSnackBar);
  const router = inject(Router);

  if (!authService.authenticated()) {
    const msg = `Not authenticated!`;
    snackBar.open(msg);
    return new RedirectCommand(router.parseUrl('/'), {});
  }

  return true;
};
