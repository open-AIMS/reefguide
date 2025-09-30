import { Component, Inject, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebApiService } from '../../../api/web-api.service';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { GetProjectsResponse } from '@reefguide/types';

export interface UpdateProjectDialogInput {
  projectId: number;
  projectDetails: GetProjectsResponse['projects'][number];
}

@Component({
  selector: 'app-project-settings-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './project-settings-dialog.component.html',
  styleUrl: './project-settings-dialog.component.scss'
})
export class ProjectSettingsDialogComponent {
  webApiService = inject(WebApiService);
  dialogInput: UpdateProjectDialogInput;

  isPublic = signal<boolean>(false);

  constructor(@Inject(MAT_DIALOG_DATA) public input: UpdateProjectDialogInput) {
    this.dialogInput = input;
    this.isPublic.set(input.projectDetails.is_public);
  }

  onPublicToggle(checked: boolean) {
    this.isPublic.set(checked);
    console.log('Running public toggle');
    this.webApiService
      .setProjectPublic(this.dialogInput.projectId, { isPublic: checked })
      .subscribe();
  }
}
