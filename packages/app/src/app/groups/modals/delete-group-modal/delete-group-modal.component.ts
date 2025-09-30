// delete-group-modal.component.ts
import { Component, inject, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { WebApiService } from '../../../../api/web-api.service';

export interface DeleteGroupDialogData {
  groupId: number;
  groupName: string;
}

@Component({
  selector: 'app-delete-group-modal',
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
  templateUrl: './delete-group-modal.component.html',
  styleUrl: './delete-group-modal.component.scss'
})
export class DeleteGroupModalComponent {
  private dialogRef = inject(MatDialogRef<DeleteGroupModalComponent>);
  private webApi = inject(WebApiService);

  confirmationText = '';
  submitting = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: DeleteGroupDialogData) {}

  canConfirm(): boolean {
    return this.confirmationText === 'DELETE';
  }

  onConfirm() {
    if (!this.canConfirm() || this.submitting) {
      return;
    }

    this.submitting = true;
    this.webApi.deleteGroup(this.data.groupId).subscribe({
      next: () => {
        this.dialogRef.close(true);
      },
      error: error => {
        console.error('Error deleting group:', error);
        this.submitting = false;
      }
    });
  }

  onCancel() {
    this.dialogRef.close();
  }
}
