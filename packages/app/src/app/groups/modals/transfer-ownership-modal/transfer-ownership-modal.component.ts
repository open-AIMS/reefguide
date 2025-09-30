// transfer-ownership-modal.component.ts
import { CommonModule } from '@angular/common';
import { Component, computed, inject, Inject, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { User } from '@reefguide/db';
import { WebApiService } from '../../../../api/web-api.service';
import { GetGroupsResponse } from '@reefguide/types';

export interface TransferOwnershipDialogData {
  groupId: number;
  groupName: string;
  members: GetGroupsResponse['groups'][number]['members'];
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

  selectedUserId = signal<number | null>(null);
  confirmationText = signal('');
  submitting = signal(false);

  // Computed signal for validation
  canConfirm = computed(
    () => this.selectedUserId() !== null && this.confirmationText() === this.data.groupName
  );

  // Computed signal for button state
  isSubmitDisabled = computed(() => !this.canConfirm() || this.submitting());

  constructor(@Inject(MAT_DIALOG_DATA) public data: TransferOwnershipDialogData) {}

  onConfirm() {
    if (!this.canConfirm() || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.webApi
      .transferGroupOwnership(this.data.groupId, { newOwnerId: this.selectedUserId()! })
      .subscribe({
        next: () => {
          this.dialogRef.close(true);
        },
        error: error => {
          console.error('Error transferring ownership:', error);
          this.submitting.set(false);
        }
      });
  }

  onCancel() {
    this.dialogRef.close();
  }
}
