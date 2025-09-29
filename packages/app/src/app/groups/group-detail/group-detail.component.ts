// group-detail.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Group } from '@reefguide/db';
import { WebApiService } from '../../../api/web-api.service';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AddMembersModalComponent } from '../modals/add-members-modal/add-members-modal.component';
import { DeleteGroupModalComponent } from '../modals/delete-group-modal/delete-group-modal.component';
import { TransferOwnershipModalComponent } from '../modals/transfer-ownership-modal/transfer-ownership-modal.component';

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatListModule,
    MatButtonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule
  ],
  templateUrl: './group-detail.component.html',
  styleUrl: './group-detail.component.scss'
})
export class GroupDetailComponent implements OnInit {
  private webApi = inject(WebApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  group: Group | null = null;
  loading = false;
  activeTab = 0;
  currentUserRole: 'Owner' | 'Manager' | 'Member' | null = null;
  currentUserId: number = 0; // TODO: Get from AuthService

  ngOnInit() {
    const groupId = Number(this.route.snapshot.paramMap.get('id'));
    if (isNaN(groupId)) {
      this.router.navigate(['/groups']);
      return;
    }
    this.loadGroup(groupId);
  }

  loadGroup(groupId: number) {
    this.loading = true;
    this.webApi.getGroup(groupId).subscribe({
      next: response => {
        this.group = response.group;
        this.determineUserRole();
        this.loading = false;
      },
      error: error => {
        console.error('Error loading group:', error);
        this.snackBar.open('Failed to load group', 'Close', { duration: 3000 });
        this.router.navigate(['/groups']);
        this.loading = false;
      }
    });
  }

  private determineUserRole() {
    if (!this.group) return;

    if (this.group.owner_id === this.currentUserId) {
      this.currentUserRole = 'Owner';
    }

    // TODO need others?
    this.currentUserRole = 'Member'

    // else if (this.group.managerIds?.includes(this.currentUserId)) {
    //   this.currentUserRole = 'Manager';
    // } else {
    //   this.currentUserRole = 'Member';
    // }
  }

  onAddMembers() {
    if (!this.group) return;

    const dialogRef = this.dialog.open(AddMembersModalComponent, {
      width: '600px',
      data: {
        groupId: this.group.id,
        currentUserRole: this.currentUserRole
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open('Members added successfully', 'Close', { duration: 3000 });
        this.loadGroup(this.group!.id);
      }
    });
  }

  onRemoveMember(userId: number) {
    if (!this.group || !confirm('Are you sure you want to remove this member?')) return;

    this.webApi.removeGroupMembers(this.group.id, { userIds: [userId] }).subscribe({
      next: () => {
        this.snackBar.open('Member removed', 'Close', { duration: 3000 });
        this.loadGroup(this.group!.id);
      },
      error: error => {
        console.error('Error removing member:', error);
        this.snackBar.open('Failed to remove member', 'Close', { duration: 3000 });
      }
    });
  }

  onPromoteToManager(userId: number) {
    if (!this.group) return;

    this.webApi.addGroupManagers(this.group.id, { userIds: [userId] }).subscribe({
      next: () => {
        this.snackBar.open('User promoted to manager', 'Close', { duration: 3000 });
        this.loadGroup(this.group!.id);
      },
      error: error => {
        console.error('Error promoting user:', error);
        this.snackBar.open('Failed to promote user', 'Close', { duration: 3000 });
      }
    });
  }

  onDemoteManager(userId: number) {
    if (!this.group) return;

    this.webApi.removeGroupManagers(this.group.id, { userIds: [userId] }).subscribe({
      next: () => {
        this.snackBar.open('Manager demoted to member', 'Close', { duration: 3000 });
        this.loadGroup(this.group!.id);
      },
      error: error => {
        console.error('Error demoting manager:', error);
        this.snackBar.open('Failed to demote manager', 'Close', { duration: 3000 });
      }
    });
  }

  onSaveSettings() {
    if (!this.group) return;

    this.webApi
      .updateGroup(this.group.id, {
        name: this.group.name,
        description: this.group.description ?? undefined
      })
      .subscribe({
        next: () => {
          this.snackBar.open('Settings saved', 'Close', { duration: 3000 });
          this.loadGroup(this.group!.id);
        },
        error: error => {
          console.error('Error saving settings:', error);
          this.snackBar.open('Failed to save settings', 'Close', { duration: 3000 });
        }
      });
  }

  onTransferOwnership() {
    if (!this.group) return;

    // Get all members (managers + regular members) except current owner
    // TODO do we need this?
    // const allMembers = [
    //   ...(this.group.managers || []),
    //   ...(this.group.members || [])
    // ];

    const dialogRef = this.dialog.open(TransferOwnershipModalComponent, {
      width: '500px',
      data: {
        groupId: this.group.id,
        groupName: this.group.name,
        // TODO fix this
        members: []
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open('Ownership transferred', 'Close', { duration: 3000 });
        this.router.navigate(['/groups']);
      }
    });
  }

  onDeleteGroup() {
    if (!this.group) return;

    const dialogRef = this.dialog.open(DeleteGroupModalComponent, {
      width: '500px',
      data: {
        groupId: this.group.id,
        groupName: this.group.name
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open('Group deleted', 'Close', { duration: 3000 });
        this.router.navigate(['/groups']);
      }
    });
  }

  canManage(): boolean {
    return this.currentUserRole === 'Owner' || this.currentUserRole === 'Manager';
  }

  isOwner(): boolean {
    return this.currentUserRole === 'Owner';
  }

  goBack() {
    this.router.navigate(['/groups']);
  }
}
