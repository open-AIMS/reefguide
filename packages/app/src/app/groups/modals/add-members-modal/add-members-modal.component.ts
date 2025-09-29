// add-members-modal.component.ts
import { Component, computed, effect, inject, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatListModule } from '@angular/material/list';
import { WebApiService } from '../../../../api/web-api.service';
import { debounceTime, Subject } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';

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
    MatIconModule,
    FormsModule,
    ReactiveFormsModule,
    MatListModule
  ],
  templateUrl: './add-members-modal.component.html',
  styleUrl: './add-members-modal.component.scss'
})
export class AddMembersModalComponent {
  private dialogRef = inject(MatDialogRef<AddMembersModalComponent>);
  private webApi = inject(WebApiService);

  searchQuery = signal('');
  searchResults = signal<{ id: number; email: string }[]>([]);
  selectedUserIds = signal(new Set<number>());
  addAsManager = signal(false);
  submitting = signal(false);

  // Computed signals
  selectedCount = computed(() => this.selectedUserIds().size);
  canSubmit = computed(() => this.selectedCount() > 0 && !this.submitting());

  private searchSubject = new Subject<string>();

  constructor(@Inject(MAT_DIALOG_DATA) public data: AddMembersDialogData) {
    // Set up debounced search
    this.searchSubject.pipe(debounceTime(300)).subscribe(query => {
      this.performSearch(query);
    });

    // Effect to trigger search when searchQuery changes
    effect(() => {
      const query = this.searchQuery();
      if (!query.trim()) {
        this.searchResults.set([]);
        return;
      }
      this.searchSubject.next(query);
    });
  }

  private performSearch(query: string) {
    this.webApi.searchUsers(query, 20).subscribe({
      next: response => {
        this.searchResults.set(response.results);
      },
      error: error => {
        console.error('Error searching users:', error);
        this.searchResults.set([]);
      }
    });
  }

  toggleUser(userId: number) {
    const currentSet = new Set(this.selectedUserIds());
    if (currentSet.has(userId)) {
      currentSet.delete(userId);
    } else {
      currentSet.add(userId);
    }
    this.selectedUserIds.set(currentSet);
  }

  isSelected(userId: number): boolean {
    return this.selectedUserIds().has(userId);
  }

  onSubmit() {
    if (!this.canSubmit()) {
      return;
    }

    this.submitting.set(true);
    const userIds = Array.from(this.selectedUserIds());

    // First add as members
    if (this.addAsManager()) {
      if (this.data.currentUserRole === 'Owner') {
        this.webApi.addGroupManagers(this.data.groupId, { userIds }).subscribe({
          next: () => {
            this.dialogRef.close(true);
          },
          error: error => {
            console.error('Error promoting to managers:', error);
            this.submitting.set(false);
          }
        });
      } else {
        this.dialogRef.close(true);
      }
    } else {
      this.webApi.addGroupMembers(this.data.groupId, { userIds }).subscribe({
        next: () => {
          this.dialogRef.close(true);
        },
        error: error => {
          console.error('Error adding members:', error);
          this.submitting.set(false);
        }
      });
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}
