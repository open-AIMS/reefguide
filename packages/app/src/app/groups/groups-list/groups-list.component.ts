// groups-list.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { Group } from '@reefguide/db';
import { WebApiService } from '../../../api/web-api.service';
import { MatListModule } from '@angular/material/list';
import { CreateGroupModalComponent } from '../modals/create-group-modal/create-group-modal.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, Subject } from 'rxjs';

@Component({
  selector: 'app-groups-list',
  standalone: true,
  templateUrl: './groups-list.component.html',
  imports: [
    CommonModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    MatInputModule,
    FormsModule,
    MatListModule,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule
  ]
})
export class GroupsListComponent implements OnInit {
  private webApi = inject(WebApiService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  groups: Group[] = [];
  loading = false;
  searchQuery = '';
  private searchSubject = new Subject<string>();

  ngOnInit() {
    this.loadGroups();

    // Debounce search
    this.searchSubject.pipe(debounceTime(300)).subscribe(query => {
      this.loadGroups(query);
    });
  }

  loadGroups(searchQuery?: string) {
    this.loading = true;
    const query = searchQuery !== undefined ? searchQuery : this.searchQuery;

    this.webApi.getUserGroups().subscribe({
      next: response => {
        // Filter by search query if provided
        if (query && query.trim()) {
          this.groups = response.groups.filter(group =>
            group.name.toLowerCase().includes(query.toLowerCase())
          );
        } else {
          this.groups = response.groups;
        }
        this.loading = false;
      },
      error: error => {
        console.error('Error loading groups:', error);
        this.snackBar.open('Failed to load groups', 'Close', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  onSearch(query: string) {
    this.searchQuery = query;
    this.searchSubject.next(query);
  }

  onCreateGroup() {
    const dialogRef = this.dialog.open(CreateGroupModalComponent, {
      width: '500px'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open('Group created successfully', 'Close', { duration: 3000 });
        this.loadGroups();
      }
    });
  }

  onGroupClick(groupId: number) {
    this.router.navigate(['/groups', groupId]);
  }

  getUserRole(group: Group): string {
    // Determine role based on group properties
    // Note: This assumes the Group type has ownerId, managerIds, and memberIds
    // You may need to adjust based on actual Group type structure
    const currentUserId = this.getCurrentUserId();

    if (group.owner_id === currentUserId) {
      return 'Owner';
    }

    // TODO do we need these?
    return 'Member';
  }

  getMemberCount(group: Group): number {
    // TODO
    return 0;
    // Calculate total members: owner + managers + members
    // const managerCount = group.managerIds?.length || 0;
    // const memberCount = group.memberIds?.length || 0;
    // return 1 + managerCount + memberCount; // +1 for owner
  }

  private getCurrentUserId(): number {
    // This should come from an auth service
    // For now, return a placeholder - you'll need to inject AuthService
    return 0; // TODO: Get from AuthService
  }
}
