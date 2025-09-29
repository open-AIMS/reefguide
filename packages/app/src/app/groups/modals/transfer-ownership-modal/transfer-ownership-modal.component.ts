// transfer-ownership-modal.component.ts
import { CommonModule } from '@angular/common';
import { Component, inject, Inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { User } from '@reefguide/db';
import { WebApiService } from '../../../../api/web-api.service';

export interface TransferOwnershipDialogData {
  groupId: number;
  groupName: string;
  members: User[];
}

@Component({
  selector: 'app-transfer-ownership-modal',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './transfer-ownership-modal.component.html',
  styleUrl: './transfer-ownership-modal.component.scss'
})
export class TransferOwnershipModalComponent {
  private dialogRef = inject(MatDialogRef<TransferOwnershipModalComponent>);
  private webApi = inject(WebApiService);

  selectedUserId: number | null = null;
  confirmationText = '';
  submitting = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: TransferOwnershipDialogData) {}

  canConfirm(): boolean {
    return this.selectedUserId !== null && this.confirmationText === this.data.groupName;
  }

  onConfirm() {
    if (!this.canConfirm() || this.submitting) {
      return;
    }

    this.submitting = true;
    this.webApi
      .transferGroupOwnership(this.data.groupId, { newOwnerId: this.selectedUserId! })
      .subscribe({
        next: () => {
          this.dialogRef.close(true);
        },
        error: error => {
          console.error('Error transferring ownership:', error);
          this.submitting = false;
        }
      });
  }

  onCancel() {
    this.dialogRef.close();
  }
}
