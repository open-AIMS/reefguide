import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { WebApiService } from '../api/web-api.service';
import { firstValueFrom } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * NG auth guard - checks if user is authenticated and can load the project else
 * redirects
 */
export const projectAuthGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const webApiService = inject(WebApiService);
  const projectId: string | undefined = route.params['projectId'];
  const snackBar = inject(MatSnackBar);

  if (authService.authenticated() && !!projectId) {
    try {
      // try and load project
      const canResolve = await firstValueFrom(webApiService.getProject(Number(projectId)));
      if (canResolve) {
        return true;
      }
    } catch (e) {
      const msg = `Trying to load route for project with ID ${projectId} which experienced error. Do you own this project?`;
      snackBar.open(msg);
      console.warn(msg + e);
    }
  }

  // return to base
  return new RedirectCommand(router.parseUrl('/'), {});
};
