// add-members-modal.component.ts
import { Component, inject, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatListModule } from '@angular/material/list';
import { UserResponse } from '@reefguide/types';
import { WebApiService } from '../../../../api/web-api.service';
import { debounceTime, Subject } from 'rxjs';

export interface AddMembersDialogData {
  groupId: number;
  currentUserRole: 'Owner' | 'Manager';
}

@Component({
  selector: 'app-add-members-modal',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    FormsModule,
    ReactiveFormsModule,
    MatListModule
  ],
  templateUrl: './add-members-modal.component.html',
  styleUrl: './add-members-modal.component.scss'
})
export class AddMembersModalComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<AddMembersModalComponent>);
  private webApi = inject(WebApiService);

  searchQuery = '';
  searchResults: UserResponse[] = [];
  selectedUserIds = new Set<number>();
  addAsManager = false;
  submitting = false;
  private searchSubject = new Subject<string>();

  constructor(@Inject(MAT_DIALOG_DATA) public data: AddMembersDialogData) {}

  ngOnInit() {
    this.searchSubject.pipe(debounceTime(300)).subscribe(query => {
      this.performSearch(query);
    });
  }

  onSearchUsers(query: string) {
    if (!query.trim()) {
      this.searchResults = [];
      return;
    }
    this.searchSubject.next(query);
  }

  private performSearch(query: string) {
    this.webApi.searchUsers(query, 20).subscribe({
      next: response => {
        this.searchResults = response;
      },
      error: error => {
        console.error('Error searching users:', error);
        this.searchResults = [];
      }
    });
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
    if (this.selectedUserIds.size === 0 || this.submitting) {
      return;
    }

    this.submitting = true;
    const userIds = Array.from(this.selectedUserIds);

    // First add as members
    this.webApi.addGroupMembers(this.data.groupId, { userIds }).subscribe({
      next: () => {
        // If adding as managers and user is owner, promote them
        if (this.addAsManager && this.data.currentUserRole === 'Owner') {
          this.webApi.addGroupManagers(this.data.groupId, { userIds }).subscribe({
            next: () => {
              this.dialogRef.close(true);
            },
            error: error => {
              console.error('Error promoting to managers:', error);
              this.submitting = false;
            }
          });
        } else {
          this.dialogRef.close(true);
        }
      },
      error: error => {
        console.error('Error adding members:', error);
        this.submitting = false;
      }
    });
  }

  onCancel() {
    this.dialogRef.close();
  }
}
