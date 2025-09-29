import { Component, inject, Inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule, MatSelectionList } from '@angular/material/list';
import { User } from '@reefguide/db';
import { WebApiService } from '../../../../api/web-api.service';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

export interface TransferOwnershipDialogData {
  groupId: number;
  groupName: string;
  members: User[];
}

@Component({
  selector: 'app-transfer-ownership-modal',
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    FormsModule,
    ReactiveFormsModule,
    MatListModule,
    MatAutocompleteModule
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
    if (!this.canConfirm()) {
      return;
    }

    this.submitting = true;
    // TODO: Implement transfer
    this.submitting = false;
  }

  onCancel() {
    this.dialogRef.close();
  }
}
