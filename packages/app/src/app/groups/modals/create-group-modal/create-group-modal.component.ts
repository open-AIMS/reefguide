// create-group-modal.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { WebApiService } from '../../../../api/web-api.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-create-group-modal',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './create-group-modal.component.html',
  styleUrl: './create-group-modal.component.scss'
})
export class CreateGroupModalComponent {
  private dialogRef = inject(MatDialogRef<CreateGroupModalComponent>);
  private webApi = inject(WebApiService);

  groupName = '';
  description = '';
  submitting = false;

  onSubmit() {
    if (!this.groupName.trim() || this.submitting) {
      return;
    }

    this.submitting = true;
    this.webApi
      .createGroup({
        name: this.groupName.trim(),
        description: this.description.trim()
      })
      .subscribe({
        next: response => {
          this.dialogRef.close(response.group);
        },
        error: error => {
          console.error('Error creating group:', error);
          this.submitting = false;
          // Error handling - could show error message in modal
        }
      });
  }

  onCancel() {
    this.dialogRef.close();
  }
}
