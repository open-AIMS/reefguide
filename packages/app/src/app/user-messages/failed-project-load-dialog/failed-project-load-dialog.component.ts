import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-failed-project-load-dialog',
  imports: [MatDialogModule, MatIconModule, MatButtonModule, RouterLink],
  templateUrl: './failed-project-load-dialog.component.html',
  styleUrl: './failed-project-load-dialog.component.scss'
})
export class FailedProjectLoadDialogComponent {
  readonly data = inject<{ message: string }>(MAT_DIALOG_DATA);

  reload() {
    window.location.reload();
  }
}
