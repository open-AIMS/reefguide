import { Component, Inject, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebApiService } from '../../../api/web-api.service';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { GetProjectResponse, GetProjectsResponse } from '@reefguide/types';

export interface UpdateProjectDialogInput {
  projectId: number;
}

@Component({
  selector: 'app-project-settings-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './project-settings-dialog.component.html',
  styleUrl: './project-settings-dialog.component.scss'
})
export class ProjectSettingsDialogComponent {
  webApiService = inject(WebApiService);

  projectId: number;
  projectDetails = signal<GetProjectResponse['project'] | null>(null);
  isLoading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  isPublic = signal<boolean>(false);

  constructor(@Inject(MAT_DIALOG_DATA) public input: UpdateProjectDialogInput) {
    this.projectId = input.projectId;
    this.loadProject();
  }

  loadProject() {
    this.isLoading.set(true);
    this.loadError.set(null);

    this.webApiService.getProject(this.projectId).subscribe({
      next: response => {
        this.projectDetails.set(response.project);
        this.isPublic.set(response.project.is_public);
        this.isLoading.set(false);
      },
      error: error => {
        this.loadError.set('Failed to load project details');
        this.isLoading.set(false);
        console.error('Error loading project:', error);
      }
    });
  }

  onPublicToggle(checked: boolean) {
    this.isPublic.set(checked);
    this.webApiService.setProjectPublic(this.projectId, { isPublic: checked }).subscribe({
      error: error => {
        // Rollback on error
        this.isPublic.set(!checked);
        console.error('Error updating project publicity:', error);
      }
    });
  }
}
