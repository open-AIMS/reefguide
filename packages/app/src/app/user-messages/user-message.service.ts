import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { FailedProjectLoadDialogComponent } from './failed-project-load-dialog/failed-project-load-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({
  providedIn: 'root'
})
export class UserMessageService {
  dialog = inject(MatDialog);
  snackbar = inject(MatSnackBar);

  /**
   * Show blocking dialog indicating the project page/route failed to load.
   *
   * Prompts the user to reload or go back to projects
   * @param message main content message to display
   */
  showProjectLoadFailed(message: string): void {
    this.dialog.open(FailedProjectLoadDialogComponent, {
      disableClose: true,
      closeOnNavigation: true, // no effect?
      data: { message }
    });
  }

  /**
   * Show non-blocking error message to user.
   * @param message
   */
  error(message: string): void {
    this.snackbar.open(message, 'OK');
  }
}
