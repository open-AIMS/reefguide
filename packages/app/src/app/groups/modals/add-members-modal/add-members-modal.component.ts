import { Component, inject, Inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule, MatSelectionList } from '@angular/material/list';
import { UserResponse } from '@reefguide/types';
import { WebApiService } from '../../../../api/web-api.service';

export interface AddMembersDialogData {
  groupId: number;
  currentUserRole: 'Owner' | 'Manager';
}

@Component({
  selector: 'app-add-members-modal',
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    FormsModule,
    ReactiveFormsModule,
    MatSelectionList,
    MatListModule
  ],
  templateUrl: './add-members-modal.component.html',
  styleUrl: './add-members-modal.component.scss'
})
export class AddMembersModalComponent {
  private dialogRef = inject(MatDialogRef<AddMembersModalComponent>);
  private webApi = inject(WebApiService);

  searchQuery = '';
  searchResults: UserResponse[] = [];
  selectedUserIds = new Set<number>();
  addAsManager = false;
  submitting = false;

  constructor(@Inject(MAT_DIALOG_DATA) public data: AddMembersDialogData) {}

  onSearchUsers(query: string) {
    if (!query.trim()) {
      this.searchResults = [];
      return;
    }
    // TODO: Implement search with debounce
  }

  toggleUser(userId: number) {
    if (this.selectedUserIds.has(userId)) {
      this.selectedUserIds.delete(userId);
    } else {
      this.selectedUserIds.add(userId);
    }
  }

  isSelected(userId: number): boolean {
    return this.selectedUserIds.has(userId);
  }

  onSubmit() {
    if (this.selectedUserIds.size === 0) {
      return;
    }

    this.submitting = true;
    // TODO: Implement adding members
    this.submitting = false;
  }

  onCancel() {
    this.dialogRef.close();
  }
}
