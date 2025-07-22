import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProjectType } from '@reefguide/db';
import { CreateProjectInput } from '@reefguide/types';
import { BehaviorSubject, finalize } from 'rxjs';
import { WebApiService } from '../../../api/web-api.service';

interface ProjectTypeOption {
  value: ProjectType;
  label: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-create-project-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSnackBarModule
  ],
  templateUrl: './create-project-dialog.component.html',
  styleUrls: ['./create-project-dialog.component.scss']
})
export class CreateProjectDialogComponent {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject(MatDialogRef<CreateProjectDialogComponent>);
  private readonly webApi = inject(WebApiService);
  private readonly snackBar = inject(MatSnackBar);

  isLoading$ = new BehaviorSubject<boolean>(false);

  projectTypes: ProjectTypeOption[] = [
    {
      value: 'SITE_SELECTION',
      label: 'Site Assessment',
      description:
        'Assess optimal sites for reef restoration projects based on environmental criteria and constraints.',
      icon: 'location_on'
    },
    {
      value: 'ADRIA_ANALYSIS',
      label: 'ADRIA Analysis',
      description: 'Perform reef ecosystem modeling and intervention analysis using ADRIA.',
      icon: 'analytics'
    }
  ];

  createForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(255)]],
    description: ['', [Validators.maxLength(1000)]],
    type: ['', [Validators.required]]
  });

  onCancel() {
    this.dialogRef.close();
  }

  onSubmit() {
    if (this.createForm.valid && !this.isLoading$.value) {
      this.isLoading$.next(true);

      const formValue = this.createForm.value;
      const projectData: CreateProjectInput = {
        name: formValue.name.trim(),
        description: formValue.description?.trim() || undefined,
        type: formValue.type,
        project_state: {} // Initialize with empty state
      };

      this.webApi
        .createProject(projectData)
        .pipe(finalize(() => this.isLoading$.next(false)))
        .subscribe({
          next: response => {
            this.snackBar.open('Project created successfully!', 'Close', {
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            this.dialogRef.close(response.project);
          },
          error: error => {
            console.error('Error creating project:', error);
            const errorMessage =
              error.error?.message || 'Failed to create project. Please try again.';
            this.snackBar.open(errorMessage, 'Close', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
          }
        });
    } else {
      // Mark all fields as touched to show validation errors
      this.createForm.markAllAsTouched();
    }
  }

  getFieldError(fieldName: string): string {
    const field = this.createForm.get(fieldName);
    if (field && field.errors && field.touched) {
      if (field.errors['required']) {
        return `${this.getFieldDisplayName(fieldName)} is required`;
      }
      if (field.errors['minlength']) {
        return `${this.getFieldDisplayName(fieldName)} must be at least ${field.errors['minlength'].requiredLength} character(s)`;
      }
      if (field.errors['maxlength']) {
        return `${this.getFieldDisplayName(fieldName)} must be no more than ${field.errors['maxlength'].requiredLength} characters`;
      }
    }
    return '';
  }

  private getFieldDisplayName(fieldName: string): string {
    switch (fieldName) {
      case 'name':
        return 'Project name';
      case 'description':
        return 'Description';
      case 'type':
        return 'Project type';
      default:
        return fieldName;
    }
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.createForm.get(fieldName);
    return !!(field && field.errors && field.touched);
  }
}
