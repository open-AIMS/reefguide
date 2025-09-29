import { Component, inject, Inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule } from '@angular/material/list';
import { WebApiService } from '../../../../api/web-api.service';

export interface DeleteGroupDialogData {
  groupId: number;
  groupName: string;
}

@Component({
  selector: 'app-delete-group-modal',
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    FormsModule,
    ReactiveFormsModule,
    MatListModule,
    MatAutocompleteModule
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
    if (!this.canConfirm()) {
      return;
    }

    this.submitting = true;
    // TODO: Implement deletion
    this.submitting = false;
  }

  onCancel() {
    this.dialogRef.close();
  }
}
