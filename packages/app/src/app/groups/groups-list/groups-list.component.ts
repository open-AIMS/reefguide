// groups-list.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { WebApiService } from '../../../api/web-api.service';
import { MatListModule } from '@angular/material/list';
import { CreateGroupModalComponent } from '../modals/create-group-modal/create-group-modal.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, Subject } from 'rxjs';
import { GetGroupResponse, GetGroupsResponse } from '@reefguide/types';
import { AuthService } from '../../auth/auth.service';

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
  ],
  styleUrls: ['./groups-list.component.scss']
})
export class GroupsListComponent implements OnInit {
  private webApi = inject(WebApiService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private authService = inject(AuthService);

  groups = signal<GetGroupsResponse['groups']>([]);
  loading = signal(false);
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
    this.loading.set(true);
    const query = searchQuery !== undefined ? searchQuery : this.searchQuery;

    this.webApi.getUserGroups().subscribe({
      next: response => {
        // Filter by search query if provided
        if (query && query.trim()) {
          this.groups.set(
            response.groups.filter(group => group.name.toLowerCase().includes(query.toLowerCase()))
          );
        } else {
          this.groups.set(response.groups);
        }
        this.loading.set(false);
      },
      error: error => {
        console.error('Error loading groups:', error);
        this.snackBar.open('Failed to load groups', 'Close', { duration: 3000 });
        this.loading.set(false);
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

  getUserRole(group: GetGroupResponse['group']): string {
    // Determine role based on group properties
    // Note: This assumes the Group type has ownerId, managerIds, and memberIds
    // You may need to adjust based on actual Group type structure
    const currentUserId = this.authService.currentUserSignal()?.id;

    if (!currentUserId) {
      return 'Member';
    }

    if (group.owner_id === currentUserId) {
      return 'Owner';
    }

    if (group.managers.map(m => m.user_id).includes(currentUserId)) {
      return 'Manager';
    }

    return 'Member';
  }

  getMemberCount(group: GetGroupResponse['group']): number {
    // Calculate total members: owner + managers + members
    const managerCount = group.managers.length || 0;
    const memberCount = group.members.length || 0;
    return 1 + managerCount + memberCount; // +1 for owner
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
