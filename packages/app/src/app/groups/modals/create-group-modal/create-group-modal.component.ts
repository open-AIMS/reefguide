import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { WebApiService } from '../../../../api/web-api.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-create-group-modal',
  imports: [MatDialogModule, MatFormFieldModule, FormsModule, ReactiveFormsModule],
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
    if (!this.groupName.trim()) {
      return;
    }

    this.submitting = true;
    // TODO: Implement creation
    this.submitting = false;
  }

  onCancel() {
    this.dialogRef.close();
  }
}
